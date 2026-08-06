// payfast-backend.js
// Express routes for: creating an order, redirecting to PayFast with a
// signed payment request, and handling PayFast's payment notification (ITN).
//
// npm install express pg crypto querystring axios

const express = require('express');
const crypto = require('crypto');
const querystring = require('querystring');
const axios = require('axios');
const nodemailer = require('nodemailer');
const { Pool } = require('pg'); // swap for mysql2 if you're on MySQL

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Gmail SMTP setup:
// 1. Create a Gmail account for the store (e.g. petpawhaven@gmail.com)
// 2. Turn on 2-Step Verification in that account's Google settings
// 3. Go to Google Account > Security > App Passwords, generate one for "Mail"
// 4. Use that 16-character App Password below — NOT your normal Gmail password
const mailer = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER, // e.g. petpawhaven@gmail.com
    pass: process.env.GMAIL_APP_PASSWORD, // the 16-character App Password
  },
});
const STORE_OWNER_EMAIL = process.env.GMAIL_USER; // orders + replies land in this same inbox

// ---- FILL THESE IN ----
const PAYFAST_MERCHANT_ID = process.env.PAYFAST_MERCHANT_ID;   // e.g. '10000100'
const PAYFAST_MERCHANT_KEY = process.env.PAYFAST_MERCHANT_KEY; // e.g. '46f0cd694581a'
const PAYFAST_PASSPHRASE = process.env.PAYFAST_PASSPHRASE;     // set in your PayFast dashboard
const PAYFAST_URL = process.env.NODE_ENV === 'production'
  ? 'https://www.payfast.co.za/eng/process'
  : 'https://sandbox.payfast.co.za/eng/process'; // test here first
const SITE_URL = process.env.SITE_URL; // e.g. 'https://petpawhaven.co.za'

// Generates the MD5 signature PayFast requires on every request
function generateSignature(data, passphrase) {
  let pfOutput = '';
  Object.keys(data)
    .sort() // PayFast requires alphabetical key order
    .forEach(key => {
      if (data[key] !== '' && data[key] !== undefined) {
        pfOutput += `${key}=${encodeURIComponent(data[key].toString().trim()).replace(/%20/g, '+')}&`;
      }
    });
  pfOutput = pfOutput.slice(0, -1);
  if (passphrase) {
    pfOutput += `&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}`;
  }
  return crypto.createHash('md5').update(pfOutput).digest('hex');
}

// ---- STEP 1: create the order, return a PayFast redirect URL ----
router.post('/api/checkout', async (req, res) => {
  const { items, customer } = req.body;
  // items: [{ productId, quantity }]
  // customer: { firstName, lastName, email, phone, address, city, postal }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Look up real prices server-side — never trust prices sent from the browser
    let total = 0;
    const lineItems = [];
    for (const item of items) {
      const { rows } = await client.query(
        'SELECT id, price, is_available FROM products WHERE id = $1', [item.productId]
      );
      const product = rows[0];
      if (!product || !product.is_available) {
        throw new Error(`${item.productId} is currently unavailable`);
      }
      total += product.price * item.quantity;
      lineItems.push({ productId: product.id, quantity: item.quantity, price: product.price });
    }

    const orderResult = await client.query(
      `INSERT INTO orders
        (customer_first_name, customer_last_name, email, phone, address, city, postal_code, total, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending_payment')
       RETURNING id`,
      [customer.firstName, customer.lastName, customer.email, customer.phone,
       customer.address, customer.city, customer.postal, total]
    );
    const orderId = orderResult.rows[0].id;

    for (const li of lineItems) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase)
         VALUES ($1,$2,$3,$4)`,
        [orderId, li.productId, li.quantity, li.price]
      );
    }

    await client.query('COMMIT');

    // Build the signed PayFast payload
    const pfData = {
      merchant_id: PAYFAST_MERCHANT_ID,
      merchant_key: PAYFAST_MERCHANT_KEY,
      return_url: `${SITE_URL}/order-success?order=${orderId}`,
      cancel_url: `${SITE_URL}/order-cancelled?order=${orderId}`,
      notify_url: `${SITE_URL}/api/payfast/itn`,
      name_first: customer.firstName,
      name_last: customer.lastName,
      email_address: customer.email,
      m_payment_id: orderId.toString(),
      amount: total.toFixed(2),
      item_name: `PetPawHaven Order #${orderId}`,
    };
    pfData.signature = generateSignature(pfData, PAYFAST_PASSPHRASE);

    const redirectUrl = `${PAYFAST_URL}?${querystring.stringify(pfData)}`;
    res.json({ redirectUrl, orderId });

  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ---- STEP 2: PayFast calls this automatically once payment is done ----
// This is the source of truth for "did they actually pay" — not the
// return_url redirect, which the customer's browser could hit even if
// payment failed. Never mark an order paid until this fires.
router.post('/api/payfast/itn', express.urlencoded({ extended: false }), async (req, res) => {
  res.sendStatus(200); // acknowledge receipt immediately, PayFast requires this

  const data = req.body;
  const receivedSignature = data.signature;
  const dataForSig = { ...data };
  delete dataForSig.signature;
  const expectedSignature = generateSignature(dataForSig, PAYFAST_PASSPHRASE);

  if (receivedSignature !== expectedSignature) return; // tampered/invalid, ignore

  // Confirm with PayFast's servers directly (prevents spoofed ITN calls)
  const validateUrl = process.env.NODE_ENV === 'production'
    ? 'https://www.payfast.co.za/eng/query/validate'
    : 'https://sandbox.payfast.co.za/eng/query/validate';
  const confirmation = await axios.post(validateUrl, querystring.stringify(data));
  if (confirmation.data !== 'VALID') return;

  const orderId = data.m_payment_id;
  const client = await pool.connect();
  try {
    const orderRes = await client.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    const order = orderRes.rows[0];
    if (!order) return;

    if (data.payment_status === 'COMPLETE') {
      await client.query(
        `UPDATE orders SET status = 'paid', payfast_payment_id = $1 WHERE id = $2`,
        [data.pf_payment_id, orderId]
      );
      await sendOrderEmails(order, 'paid');
    } else {
      await client.query(`UPDATE orders SET status = 'failed' WHERE id = $1`, [orderId]);
      await sendOrderEmails(order, 'failed');
    }
  } catch (err) {
    console.error('ITN processing failed:', err);
  } finally {
    client.release();
  }
});

async function sendOrderEmails(order, outcome) {
  const customerName = `${order.customer_first_name} ${order.customer_last_name}`;

  if (outcome === 'paid') {
    await mailer.sendMail({
      to: order.email,
      from: STORE_OWNER_EMAIL,
      subject: `Order #${order.id} confirmed — PetPawHaven`,
      text: `Hi ${order.customer_first_name},\n\nYour order (R${order.total}) is confirmed and being prepared for shipping to:\n${order.address}, ${order.city}, ${order.postal_code}\n\nThanks for shopping with PetPawHaven.`,
    });
    await mailer.sendMail({
      to: STORE_OWNER_EMAIL,
      from: STORE_OWNER_EMAIL,
      subject: `New paid order #${order.id}`,
      text: `${customerName} just paid R${order.total} for order #${order.id}.\nShip to: ${order.address}, ${order.city}, ${order.postal_code}\nPhone: ${order.phone}`,
    });
  } else {
    await mailer.sendMail({
      to: order.email,
      from: STORE_OWNER_EMAIL,
      subject: `Payment unsuccessful — Order #${order.id}`,
      text: `Hi ${order.customer_first_name},\n\nYour payment for order #${order.id} didn't go through. You can try again anytime on our site — nothing has been charged.`,
    });
  }
}

// ---- Pages PayFast redirects the customer's browser to ----
// Plain static files — order-success.html reads the order ID straight
// from the URL query string with JS, no template engine needed.
router.get('/order-success', (req, res) => {
  res.sendFile(__dirname + '/order-success.html');
});

router.get('/order-cancelled', (req, res) => {
  res.sendFile(__dirname + '/order-cancelled.html');
});

module.exports = router;
