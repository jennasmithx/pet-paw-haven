// api/checkout.js
// POST { items: [{ productId, quantity }], customer: { firstName, lastName, email, phone, address, city, postal, country } }
// Returns { actionUrl, fields } — the browser builds a hidden form from these and submits it to PayFast.
//
// Required environment variables (Vercel project settings):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   PAYFAST_SANDBOX          <- "true" or "false"
//   PAYFAST_MERCHANT_ID
//   PAYFAST_MERCHANT_KEY
//   PAYFAST_PASSPHRASE
//   SITE_URL
//
// Matches schema.sql: orders(id, customer_first_name, customer_last_name, email,
// phone, address, city, postal_code, total, status, payfast_payment_id) and a
// separate order_items(order_id, product_id, quantity, price_at_purchase) table.
// There's no dedicated "payment reference" column, so — same as the original
// payfast-backend.js — the order's own serial id doubles as PayFast's
// m_payment_id. order_id is what return_url/order-status.js use to look the
// order back up.

import { createClient } from '@supabase/supabase-js';
import { generateSignature, PRODUCTS } from './_payfast.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

    total += product.price * quantity;
    lineItems.push({
      product_id: parseInt(item.productId, 10),
      quantity,
      price_at_purchase: product.price
    });
  }

  // --- Create the order (status defaults to 'pending_payment' per schema.sql) ---
  const { data: order, error: insertError } = await supabase
    .from('orders')
    .insert({
      customer_first_name: firstName.trim(),
      customer_last_name: lastName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      address: address.trim(),
      city: city.trim(),
      postal_code: String(postal).trim(),
      total: total.toFixed(2)
    })
    .select()
    .single();

  if (insertError) {
    console.error('Order insert failed:', insertError);
    return res.status(500).json({ error: 'Could not create order' });
  }

  // --- Insert line items into order_items, now that we have the order's id ---
  const itemsToInsert = lineItems.map(li => ({ ...li, order_id: order.id }));
  const { error: itemsError } = await supabase.from('order_items').insert(itemsToInsert);

  if (itemsError) {
    console.error('Order items insert failed:', itemsError);
    // Clean up the now-orphaned order rather than leaving a broken record behind
    await supabase.from('orders').delete().eq('id', order.id);
    return res.status(500).json({ error: 'Could not save order items' });
  }

  const sandbox = process.env.PAYFAST_SANDBOX === 'true';
  const siteUrl = process.env.SITE_URL;

  const fields = {
    merchant_id: process.env.PAYFAST_MERCHANT_ID,
    merchant_key: process.env.PAYFAST_MERCHANT_KEY,
    url: `${siteUrl}/thank-you.html?ref=${order.id}`,
    cancel_url: `${siteUrl}/checkout-cancelled.html?ref=${order.id}`,
    notify_url: `${siteUrl}/api/payfast-notify`,
    name_first: firstName.trim(),
    name_last: lastName.trim(),
    email_address: email.trim(),
    m_payment_id: order.id.toString(),
    amount: total.toFixed(2),
    item_name: `PetPawHaven Order #${order.id}`,
    item_description: lineItems.length === 1 ? PRODUCTS[items[0].productId].name : `${lineItems.length} items`
  };

  fields.signature = generateSignature(fields, process.env.PAYFAST_PASSPHRASE);

  const actionUrl = sandbox
    ? 'https://sandbox.payfast.co.za/eng/process'
    : 'https://www.payfast.co.za/eng/process';

  return res.status(200).json({ actionUrl, fields });
}