// api/create-order.js
// POST { items: [{ productId, quantity }], customer: { firstName, lastName, email, phone, address, city, postal, country } }
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
//
// NOTE: This version accepts a cart (multiple products + quantities) instead of a
// single productSku/qty pair. It assumes:
//   - PRODUCTS (from ./_payfast.js) is an object keyed by product id/sku, each with
//     at least { name, price, sku }
//   - Your Supabase `orders` table has a jsonb column called `items` to hold the
//     line items array. If it doesn't yet, run:
//       ALTER TABLE orders ADD COLUMN items jsonb;
//     If you're already storing line items in a separate order_items table instead,
//     let me know and I'll swap this to insert there instead.

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
  const { items, customer } = body;

  // --- Validate the cart ---
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }
  if (items.length > 50) {
    return res.status(400).json({ error: 'Too many items in cart' });
  }

  // --- Validate customer details server-side. Never trust the browser. ---
  const {
    firstName, lastName, email, phone,
    address, city, postal, country
  } = customer || {};

  if (!firstName || !lastName) return res.status(400).json({ error: 'Name required' });
  if (!emailRe.test(String(email || '').trim())) return res.status(400).json({ error: 'Invalid email' });
  if (!phoneRe.test(String(phone || '').trim())) return res.status(400).json({ error: 'Invalid phone' });
  if (!address || address.trim().length <= 3) return res.status(400).json({ error: 'Invalid address' });
  if (!city) return res.status(400).json({ error: 'City required' });
  if (!postal || String(postal).trim().length <= 2) return res.status(400).json({ error: 'Invalid postal code' });

  // --- Look up and validate every line item against the server-side catalogue.
  //     The browser can send whatever it wants here — price and existence are
  //     always re-derived from PRODUCTS, never trusted from the request. ---
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

    const lineTotal = product.price * quantity;
    total += lineTotal;

    lineItems.push({
      productId: item.productId,
      sku: product.sku,
      name: product.name,
      quantity,
      priceAtPurchase: product.price,
      lineTotal
    });
  }

  const amount = total.toFixed(2);
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
      postal_code: String(postal).trim(),
      country: country || 'ZA',
      items: lineItems,        // jsonb column — full cart snapshot at time of purchase
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

  // item_name/item_description have PayFast length limits, so summarise rather
  // than dumping every line item into the field.
  const itemSummary = lineItems.length === 1
    ? lineItems[0].name
    : `${lineItems.length} items`;

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
    item_name: `PetPawHaven Order ${mPaymentId}`,
    item_description: itemSummary
  };

  fields.signature = generateSignature(fields, process.env.PAYFAST_PASSPHRASE);

  const actionUrl = sandbox
    ? 'https://sandbox.payfast.co.za/eng/process'
    : 'https://www.payfast.co.za/eng/process';

  return res.status(200).json({ actionUrl, fields });
}