// api/checkout.js
// POST { items: [{ productId, quantity }], customer: { firstName, lastName, email, phone, address, city, postal, country } }
// Returns { actionUrl, fields } — the browser builds a hidden form from these and submits it to PayFast.
//
// Matches the ACTUAL live orders table (confirmed via information_schema query):
//   id (uuid), first_name, last_name, email, phone, address, city, postal_code,
//   country, product_name, product_sku, quantity, amount, payment_status, payment_id
//
// This table stores ONE PRODUCT PER ROW — there's no order_items table. Since
// the cart can hold multiple products, a single checkout inserts one row per
// cart item, all sharing the same payment_id, so the webhook can mark every
// row from that checkout as paid together.

import { createClient } from '@supabase/supabase-js';
import { generateSignature, PRODUCTS } from './_payfast.js';

// ============================================================
// TEMPORARY — hardcoded for testing, so we can rule out Vercel's
// env var system as the problem. DO NOT leave these here once
// things work — move back to process.env.* before going live,
// since this file gets committed to git (visible in history forever).
// ============================================================
const SUPABASE_URL_HARDCODED = 'https://gtotwzfjjlptsqiwnwfq.supabase.co';
const SUPABASE_KEY_HARDCODED = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0b3R3emZqamxwdHNxaXdud2ZxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTMyNjczNSwiZXhwIjoyMTAwOTAyNzM1fQ.UgGYBWk1ghB2D2k9W_nPcMmL3PzPD3iMkR23guJghFk'; // paste fresh from Supabase

const PAYFAST_MERCHANT_ID_HARDCODED = '10052855';   // your own registered sandbox id
const PAYFAST_MERCHANT_KEY_HARDCODED = 'owoqgv6hwaczo'; // your own registered sandbox key
const PAYFAST_PASSPHRASE_HARDCODED = 'jennasmithxx'; // set this on sandbox.payfast.co.za, then paste it here yourself
// ============================================================

const supabase = createClient(SUPABASE_URL_HARDCODED, SUPABASE_KEY_HARDCODED);

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRe = /^[0-9+ ()-]{7,}$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};
  const { items, customer } = body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }
  if (items.length > 50) {
    return res.status(400).json({ error: 'Too many items in cart' });
  }

  const { firstName, lastName, email, phone, address, city, postal, country } = customer || {};

  if (!firstName || !lastName) return res.status(400).json({ error: 'Name required' });
  if (!emailRe.test(String(email || '').trim())) return res.status(400).json({ error: 'Invalid email' });
  if (!phoneRe.test(String(phone || '').trim())) return res.status(400).json({ error: 'Invalid phone' });
  if (!address || address.trim().length <= 3) return res.status(400).json({ error: 'Invalid address' });
  if (!city) return res.status(400).json({ error: 'City required' });
  if (!postal || String(postal).trim().length <= 2) return res.status(400).json({ error: 'Invalid postal code' });

  // --- Validate every line item against the server-side catalogue.
  //     Price/existence always re-derived here — never trusted from the request. ---
  let total = 0;
  const lineItems = [];

  for (const item of items) {
    const product = PRODUCTS[item.productId];
    const quantity = parseInt(item.quantity, 10);

    if (!product) {
      return res.status(400).json({ error: `Unknown product: ${item.productId}` });
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
      return res.status(400).json({ error: `Invalid quantity for ${product.name}` });
    }

    const lineAmount = product.price * quantity;
    total += lineAmount;

    lineItems.push({
      product_name: product.name,
      product_sku: product.sku,
      quantity,
      amount: lineAmount.toFixed(2)
    });
  }

  // One shared reference across every row from this checkout
  const paymentId = 'ORD-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);

  const rowsToInsert = lineItems.map(li => ({
    first_name: firstName.trim(),
    last_name: lastName.trim(),
    email: email.trim(),
    phone: phone.trim(),
    address: address.trim(),
    city: city.trim(),
    postal_code: String(postal).trim(),
    country: country || 'ZA',
    product_name: li.product_name,
    product_sku: li.product_sku,
    quantity: li.quantity,
    amount: li.amount,
    payment_status: 'Pending',
    payment_id: paymentId
  }));

  const { data: insertedOrders, error: insertError } = await supabase
    .from('orders')
    .insert(rowsToInsert)
    .select();

  if (insertError) {
    console.error('Order insert failed:', insertError);
    return res.status(500).json({ error: 'Could not create order' });
  }

  const sandbox = true; // hardcoded — sandbox testing only
  const siteUrl = process.env.SITE_URL; // this one is fine to keep — not secret, just your domain

  const itemSummary = lineItems.length === 1
    ? lineItems[0].product_name
    : `${lineItems.length} items`;

  const fields = {
    merchant_id: PAYFAST_MERCHANT_ID_HARDCODED,
    merchant_key: PAYFAST_MERCHANT_KEY_HARDCODED,
    return_url: `${siteUrl}/thank-you.html?ref=${paymentId}`,
    cancel_url: `${siteUrl}/order-cancelled.html?ref=${paymentId}`,
    notify_url: `${siteUrl}/api/payfast-notify`,
    name_first: firstName.trim(),
    name_last: lastName.trim(),
    email_address: email.trim(),
    m_payment_id: paymentId,
    amount: total.toFixed(2),
    item_name: `PetPawHaven Order ${paymentId}`,
    item_description: itemSummary
  };

  fields.signature = generateSignature(fields, PAYFAST_PASSPHRASE_HARDCODED);

  const actionUrl = sandbox
    ? 'https://sandbox.payfast.co.za/eng/process'
    : 'https://www.payfast.co.za/eng/process';

  return res.status(200).json({ actionUrl, fields });
}
