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
  const paymentId =
    'ORD-' +
    Date.now() +
    '-' +
    Math.random().toString(36).slice(2, 8).toUpperCase();

  const rowsToInsert = lineItems.map(li => ({
    first_name: firstName.trim(),
    last_name: lastName.trim(),
    email: email.trim(),
    phone: phone.trim(),
    address: address.trim(),
    city: city.trim(),
    postal_code: String(postal).trim(),
    country: 'ZA',
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

  const sandbox = process.env.PAYFAST_SANDBOX === 'true';
  const siteUrl = process.env.SITE_URL;

  const itemSummary = lineItems.length === 1
    ? lineItems[0].product_name
    : `${lineItems.length} items`;

  const fields = {
    merchant_id: process.env.PAYFAST_MERCHANT_ID,
    merchant_key: process.env.PAYFAST_MERCHANT_KEY,
    return_url: `${siteUrl}/order-success.html?ref=${paymentId}`,
    cancel_url: `${siteUrl}/order-cancelled.html?ref=${paymentId}`,
    notify_url: `${siteUrl}/api/payfast-notify`,
    name_first: firstName.trim(),
    name_last: lastName.trim(),
    email_address: email.trim(),
    m_payment_id: paymentId,
    amount: total.toFixed(2),
    item_name: `PetPaw Haven Order ${paymentId}`,
    item_description: itemSummary
  };

  fields.signature = generateSignature(fields, process.env.PAYFAST_PASSPHRASE);

  const actionUrl = sandbox
    ? 'https://sandbox.payfast.co.za/eng/process'
    : 'https://www.payfast.co.za/eng/process';

  return res.status(200).json({ actionUrl, fields });
}
