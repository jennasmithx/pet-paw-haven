// api/payfast-notify.js
// PayFast posts here (server-to-server) after a payment attempt. This is the ONLY place
// that should ever flip an order to "Paid" — never trust the return_url redirect for that,
// since a customer can close the tab before it fires, or fake hitting it directly.
//
// Vercel needs the raw body for signature verification, so we disable the default JSON parser.
//
// NOTE: checkout.js inserts ONE ROW PER CART ITEM, all sharing the same
// payment_id (there's no order_items table — orders is one-product-per-row).
// So this webhook fetches ALL rows matching payment_id, sums their `amount`
// to compare against what PayFast actually paid, and updates every matching
// row together — not just one.
//
// Requires GMAIL_USER and GMAIL_APP_PASSWORD env vars (Google Account >
// Security > 2-Step Verification > App Passwords). Also requires
// nodemailer — add it to package.json: npm install nodemailer

import { createClient } from '@supabase/supabase-js';
import { generateSignature, validateWithPayFast } from './_payfast.js';
import dns from 'dns/promises';
import nodemailer from 'nodemailer';

export const config = {
  api: { bodyParser: false }
};

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const mailer = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});
const STORE_OWNER_EMAIL = process.env.GMAIL_USER;

// PayFast's documented check: the source IP's reverse DNS should resolve to a payfast.co.za host.
async function isFromPayFast(ip) {
  try {
    const hosts = await dns.reverse(ip);
    return hosts.some(h => h.endsWith('payfast.co.za'));
  } catch {
    return false; // reverse lookup failing is suspicious, treat as untrusted
  }
}

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// orderRows = every row sharing this checkout's payment_id (one per cart item)
async function sendOrderEmails(orderRows, outcome) {
  const first = orderRows[0]; // customer/shipping details are identical across every row
  const customerName = `${first.first_name} ${first.last_name}`;
  const total = orderRows.reduce((sum, row) => sum + parseFloat(row.amount), 0).toFixed(2);

  const itemLines = orderRows
    .map(row => `  - ${row.product_name} x${row.quantity} — R${parseFloat(row.amount).toFixed(2)}`)
    .join('\n');

  if (outcome === 'paid') {
    // Customer receipt — kept simple, no full internal details needed
    await mailer.sendMail({
      to: first.email,
      from: STORE_OWNER_EMAIL,
      subject: `Order confirmed — PetPawHaven`,
      text: `Hi ${first.first_name},\n\nYour order (R${total}) is confirmed and being prepared for shipping to:\n${first.address}, ${first.city}, ${first.postal_code}\n\nItems:\n${itemLines}\n\nThanks for shopping with PetPawHaven.`,
    });

    // Store owner notification — full form info for fulfillment
    await mailer.sendMail({
      to: STORE_OWNER_EMAIL,
      from: STORE_OWNER_EMAIL,
      subject: `New paid order — R${total} — ${customerName}`,
      text: `${customerName} just paid R${total}.\n\n` +
            `Items:\n${itemLines}\n\n` +
            `Ship to:\n${first.address}, ${first.city}, ${first.postal_code}, ${first.country || 'ZA'}\n\n` +
            `Contact:\nEmail: ${first.email}\nPhone: ${first.phone}\n\n` +
            `Payment reference: ${first.payment_id}`,
    });
  } else {
    await mailer.sendMail({
      to: first.email,
      from: STORE_OWNER_EMAIL,
      subject: `Payment unsuccessful — PetPawHaven`,
      text: `Hi ${first.first_name},\n\nYour payment didn't go through. You can try again anytime on our site — nothing has been charged.`,
    });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const rawBody = await getRawBody(req);
  const params = new URLSearchParams(rawBody);
  const pfData = Object.fromEntries(params.entries());

  // 1) Recompute the signature ourselves and compare.
  const receivedSignature = pfData.signature;
  const dataForSig = { ...pfData };
  delete dataForSig.signature;
  const expectedSignature = generateSignature(dataForSig, process.env.PAYFAST_PASSPHRASE);

  // TEMPORARY DEBUG — remove once ITN signature matching is confirmed working
  console.error('>>> ITN DEBUG — fields PayFast posted >>>', JSON.stringify(dataForSig));
  console.error('>>> ITN DEBUG — received signature >>>', receivedSignature);
  console.error('>>> ITN DEBUG — expected (our) signature >>>', expectedSignature);
  console.error('>>> ITN DEBUG — passphrase length used >>>', process.env.PAYFAST_PASSPHRASE ? process.env.PAYFAST_PASSPHRASE.length : 0);

  if (!receivedSignature || receivedSignature !== expectedSignature) {
    console.error('PayFast ITN: signature mismatch');
    return res.status(400).send('invalid signature');
  }

  // 2) Confirm the source IP genuinely belongs to PayFast.
  const forwardedFor = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const sourceIp = forwardedFor || req.socket.remoteAddress;
  const sandbox = process.env.PAYFAST_SANDBOX === 'true';

  if (!sandbox) {
    const trusted = await isFromPayFast(sourceIp);
    if (!trusted) {
      console.error('PayFast ITN: untrusted source IP', sourceIp);
      return res.status(400).send('untrusted source');
    }
  }

  // 3) Ask PayFast directly to confirm this ITN is genuine (protects against replay/forged posts).
  const valid = await validateWithPayFast(rawBody, sandbox);
  if (!valid) {
    console.error('PayFast ITN: server validation failed');
    return res.status(400).send('validation failed');
  }

  // 4) Look up EVERY order row from this checkout and compare PayFast's paid
  //    amount against their SUMMED total.
  const { data: orderRows, error } = await supabase
    .from('orders')
    .select('*')
    .eq('payment_id', pfData.m_payment_id);

  if (error || !orderRows || orderRows.length === 0) {
    console.error('PayFast ITN: no matching order', pfData.m_payment_id);
    return res.status(404).send('order not found');
  }

  const paidAmount = parseFloat(pfData.amount_gross ?? pfData.amount);
  const expectedAmount = orderRows.reduce((sum, row) => sum + parseFloat(row.amount), 0);

  if (Math.abs(paidAmount - expectedAmount) > 0.01) {
    console.error('PayFast ITN: amount mismatch', paidAmount, expectedAmount);
    await supabase
      .from('orders')
      .update({ payment_status: 'Amount Mismatch' })
      .eq('payment_id', pfData.m_payment_id);
    return res.status(400).send('amount mismatch');
  }

  // 5) All checks passed — update every row from this checkout together.
  const status = pfData.payment_status === 'COMPLETE' ? 'Paid' : pfData.payment_status;
  await supabase
    .from('orders')
    .update({ payment_status: status })
    .eq('payment_id', pfData.m_payment_id);

  // 6) Send emails. Don't let an email failure break the webhook response —
  //    PayFast just needs the 200 OK; log and move on if mail fails.
  try {
    await sendOrderEmails(orderRows, status === 'Paid' ? 'paid' : 'failed');
  } catch (err) {
    console.error('Order email send failed:', err);
  }

  return res.status(200).send('OK');
}