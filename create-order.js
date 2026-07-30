// api/create-order.js
// POST { productSku, qty, firstName, lastName, email, phone, address, city, postalCode, country }
// Returns { actionUrl, fields } — the browser builds a hidden form from these and submits it to PayFast.
//
// Required environment variables (set these in your Vercel project settings, never in client code):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY      <- service role key, NOT the publishable/anon key
//   PAYFAST_SANDBOX                <- "true" or "false"
//   PAYFAST_MERCHANT_ID
//   PAYFAST_MERCHANT_KEY
//   PAYFAST_PASSPHRASE              <- set this in your PayFast dashboard too (Settings > Integration)
//   SITE_URL                        <- e.g. https://pet-paw-haven.vercel.app

import { createClient } from '@supabase/supabase-js';
import { generateSignature, PRODUCTS } from './_payfast.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // server-only, full write access, RLS bypassed intentionally here
);

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRe = /^[0-9+ ()-]{7,}$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};
  const {
    productSku, qty,
    firstName, lastName, email, phone,
    address, city, postalCode, country
  } = body;

  // --- Validate everything server-side. Never trust the browser. ---
  const product = PRODUCTS[productSku];
  const quantity = parseInt(qty, 10);

  if (!product) return res.status(400).json({ error: 'Unknown product' });
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
    return res.status(400).json({ error: 'Invalid quantity' });
  }
  if (!firstName || !lastName) return res.status(400).json({ error: 'Name required' });
  if (!emailRe.test(String(email || '').trim())) return res.status(400).json({ error: 'Invalid email' });
  if (!phoneRe.test(String(phone || '').trim())) return res.status(400).json({ error: 'Invalid phone' });
  if (!address || address.trim().length <= 3) return res.status(400).json({ error: 'Invalid address' });
  if (!city) return res.status(400).json({ error: 'City required' });
  if (!postalCode || postalCode.trim().length <= 2) return res.status(400).json({ error: 'Invalid postal code' });

  // --- Price comes ONLY from the server-side catalogue. The browser cannot influence this. ---
  const amount = (product.price * quantity).toFixed(2);
  const mPaymentId = 'ORD-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);

  // --- Create the order as Pending. payment_status can only move to Paid via the notify webhook. ---
  const { data: order, error: insertError } = await supabase
    .from('orders')
    .insert({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      address: address.trim(),
      city: city.trim(),
      postal_code: postalCode.trim(),
      country: country || 'ZA',
      product_name: product.name,
      product_sku: product.sku,
      quantity,
      amount,
      payment_status: 'Pending',
      payment_id: mPaymentId
    })
    .select()
    .single();

  if (insertError) {
    console.error(insertError);
    return res.status(500).json({ error: 'Could not create order' });
  }

  const sandbox = process.env.PAYFAST_SANDBOX === 'true';
  const siteUrl = process.env.SITE_URL;

  const fields = {
    merchant_id: process.env.PAYFAST_MERCHANT_ID,
    merchant_key: process.env.PAYFAST_MERCHANT_KEY,
    return_url: `${siteUrl}/thank-you.html`,
    cancel_url: `${siteUrl}/checkout-cancelled.html`,
    notify_url: `${siteUrl}/api/payfast-notify`,
    name_first: firstName.trim(),
    name_last: lastName.trim(),
    email_address: email.trim(),
    m_payment_id: mPaymentId,
    amount,
    item_name: product.name,
    item_description: `SKU ${product.sku} x${quantity}`
  };

  fields.signature = generateSignature(fields, process.env.PAYFAST_PASSPHRASE);

  const actionUrl = sandbox
    ? 'https://sandbox.payfast.co.za/eng/process'
    : 'https://www.payfast.co.za/eng/process';

  return res.status(200).json({ actionUrl, fields });
}