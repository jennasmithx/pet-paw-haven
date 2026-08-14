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
import { validateWithPayFast } from './_payfast.js';
import crypto from 'crypto';
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
  const first = orderRows[0];
  const customerName = `${first.first_name} ${first.last_name}`;
  const total = orderRows
    .reduce((sum, row) => sum + parseFloat(row.amount), 0)
    .toFixed(2);

  const itemRows = orderRows
    .map(row => `
      <tr>
        <td style="padding:12px 8px;border-bottom:1px solid #eee;">
          ${row.product_name}
        </td>
        <td style="padding:12px 8px;border-bottom:1px solid #eee;text-align:center;">
          ${row.quantity}
        </td>
        <td style="padding:12px 8px;border-bottom:1px solid #eee;text-align:right;">
          R${parseFloat(row.amount).toFixed(2)}
        </td>
      </tr>
    `)
    .join('');

  const itemLines = orderRows
    .map(row =>
      `- ${row.product_name} x${row.quantity} — R${parseFloat(row.amount).toFixed(2)}`
    )
    .join('\n');

  if (outcome === 'paid') {

    // =========================
    // CUSTOMER EMAIL
    // =========================
    await mailer.sendMail({
      to: first.email,
      from: STORE_OWNER_EMAIL,
      subject: `Order confirmed — PetPawHaven`,

      text:
`Hi ${first.first_name},

Thank you for your order!

Your payment of R${total} has been received and your order is being prepared for shipping.

Items:
${itemLines}

Shipping to:
${first.address}
${first.city}, ${first.postal_code}

Thanks for shopping with PetPawHaven!`,

      html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f7f7f7;font-family:Arial,sans-serif;color:#333;">

  <div style="max-width:600px;margin:30px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #eee;">

    <div style="padding:28px 30px;text-align:center;border-bottom:1px solid #eee;">
      <h1 style="margin:0;font-size:26px;color:#222;">
        PetPawHaven 🐾
      </h1>
      <p style="margin:8px 0 0;color:#777;font-size:14px;">
        Order Confirmation
      </p>
    </div>

    <div style="padding:30px;">

      <h2 style="margin:0 0 10px;font-size:22px;color:#222;">
        Order Confirmed! 🎉
      </h2>

      <p style="margin:0 0 20px;color:#777;font-size:14px;">
  Order number: <strong>${first.payment_id}</strong>
</p>

      <p style="font-size:16px;line-height:1.6;">
        Hi ${first.first_name},
      </p>

      <p style="font-size:15px;line-height:1.6;color:#555;">
        Thank you for your order! Your payment of
        <strong>R${total}</strong> has been received and your order is being prepared for shipping.
      </p>

      <h3 style="margin-top:28px;font-size:17px;color:#222;">
        Order Summary
      </h3>

      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="background:#f7f7f7;">
            <th style="padding:12px 8px;text-align:left;">Item</th>
            <th style="padding:12px 8px;text-align:center;">Qty</th>
            <th style="padding:12px 8px;text-align:right;">Price</th>
          </tr>
        </thead>

        <tbody>
          ${itemRows}
        </tbody>

        <tfoot>
          <tr>
            <td colspan="2" style="padding:16px 8px;font-weight:bold;font-size:16px;">
              Total
            </td>
            <td style="padding:16px 8px;text-align:right;font-weight:bold;font-size:16px;">
              R${total}
            </td>
          </tr>
        </tfoot>
      </table>

      <div style="margin-top:25px;padding:18px;background:#f7f7f7;border-radius:8px;">
        <h3 style="margin:0 0 10px;font-size:16px;">
          Shipping To
        </h3>

        <p style="margin:0;font-size:14px;line-height:1.6;color:#555;">
          ${first.address}<br>
          ${first.city}, ${first.postal_code}
        </p>
      </div>

      <p style="margin-top:28px;font-size:14px;line-height:1.6;color:#666;">
        We'll keep you updated as your order moves through the shipping process.
      </p>

      <p style="margin-top:25px;font-size:15px;">
        Thanks for shopping with <strong>PetPawHaven</strong> 🐾
      </p>

    </div>

    <div style="padding:18px 30px;background:#fafafa;text-align:center;color:#999;font-size:12px;">
      © PetPawHaven
    </div>

  </div>

</body>
</html>
`
    });


    // =========================
    // STORE OWNER EMAIL
    // =========================
    await mailer.sendMail({
      to: STORE_OWNER_EMAIL,
      from: STORE_OWNER_EMAIL,
      subject: `New paid order — R${total} — ${customerName}`,

      text:
`${customerName} just paid R${total}.

Items:
${itemLines}

Ship to:
${first.address}
${first.city}, ${first.postal_code}, ${first.country || 'ZA'}

Contact:
Email: ${first.email}
Phone: ${first.phone}

Payment reference:
${first.payment_id}`,

      html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f7f7f7;font-family:Arial,sans-serif;color:#333;">

  <div style="max-width:600px;margin:30px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #eee;">

    <div style="padding:25px 30px;background:#222;color:#fff;">
      <h2 style="margin:0;">
        New Paid Order 🐾
      </h2>
      <p style="margin:8px 0 0;color:#ddd;">
        PetPawHaven
      </p>
    </div>

    <div style="padding:30px;">

      <h3 style="margin-top:0;">
        Customer
      </h3>

      <p style="line-height:1.6;">
        <strong>${customerName}</strong><br>
        Email: ${first.email}<br>
        Phone: ${first.phone}
      </p>

      <h3 style="margin-top:25px;">
        Items
      </h3>

      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="background:#f7f7f7;">
            <th style="padding:12px 8px;text-align:left;">Item</th>
            <th style="padding:12px 8px;text-align:center;">Qty</th>
            <th style="padding:12px 8px;text-align:right;">Price</th>
          </tr>
        </thead>

        <tbody>
          ${itemRows}
        </tbody>

        <tfoot>
          <tr>
            <td colspan="2" style="padding:16px 8px;font-weight:bold;">
              Total Paid
            </td>
            <td style="padding:16px 8px;text-align:right;font-weight:bold;">
              R${total}
            </td>
          </tr>
        </tfoot>
      </table>

      <div style="margin-top:25px;padding:18px;background:#f7f7f7;border-radius:8px;">
        <h3 style="margin:0 0 10px;">
          Shipping Address
        </h3>

        <p style="margin:0;line-height:1.6;color:#555;">
          ${first.address}<br>
          ${first.city}, ${first.postal_code}<br>
          ${first.country || 'ZA'}
        </p>
      </div>

      <div style="margin-top:25px;padding:15px;background:#f7f7f7;border-radius:8px;">
        <strong>Payment Reference</strong><br>
        <span style="font-size:13px;color:#666;">
          ${first.payment_id}
        </span>
      </div>

    </div>

  </div>

</body>
</html>
`
    });

  } else {

    // =========================
    // FAILED PAYMENT EMAIL
    // =========================
    await mailer.sendMail({
      to: first.email,
      from: STORE_OWNER_EMAIL,
      subject: `Payment unsuccessful — PetPawHaven`,

      text:
`Hi ${first.first_name},

Unfortunately, your payment didn't go through.

You can try again anytime on our website.

Nothing has been charged.

PetPawHaven`,

      html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f7f7f7;font-family:Arial,sans-serif;color:#333;">

  <div style="max-width:600px;margin:30px auto;background:#fff;border-radius:12px;border:1px solid #eee;">

    <div style="padding:28px;text-align:center;border-bottom:1px solid #eee;">
      <h1 style="margin:0;">PetPawHaven 🐾</h1>
    </div>

    <div style="padding:30px;">

      <h2>Payment Unsuccessful</h2>

      <p>
        Hi ${first.first_name},
      </p>

      <p style="line-height:1.6;color:#555;">
        Unfortunately, your payment didn't go through.
        You can try again anytime on our website.
      </p>

      <p style="font-weight:bold;">
        Nothing has been charged.
      </p>

      <p style="margin-top:30px;">
        PetPawHaven 🐾
      </p>

    </div>

  </div>

</body>
</html>
`
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

  // 1) Recompute the signature using the RAW original text PayFast sent,
  //    not a decode-then-re-encode reconstruction. Re-encoding risks subtle
  //    mismatches (e.g. how spaces or special characters get encoded), so
  //    we just strip out "signature=...' from the untouched raw body and
  //    hash that directly — this is what PayFast's own signature actually
  //    reflects, since it's byte-for-byte what they sent.
  const receivedSignature = pfData.signature;

  if (pfData.merchant_id !== process.env.PAYFAST_MERCHANT_ID) {
  console.error('PayFast ITN: merchant ID mismatch');
  return res.status(400).send('merchant mismatch');
}

  if (!receivedSignature) {
    console.error('PayFast ITN: no signature received');
    return res.status(400).send('invalid signature');
  }

  const passphrase = process.env.PAYFAST_PASSPHRASE;
  if (!passphrase) {
    console.error('PayFast ITN: PAYFAST_PASSPHRASE is missing');
    return res.status(500).send('server configuration error');
  }

  const signaturePayload = rawBody
    .split('&')
    .filter(part => !part.startsWith('signature='))
    .join('&')
    .trim();

  const encodedPassphrase = encodeURIComponent(passphrase)
    .replace(/%20/g, '+')
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A');

  const signatureString = `${signaturePayload}&passphrase=${encodedPassphrase}`;
  const expectedSignature = crypto.createHash('md5').update(signatureString).digest('hex');

  if (receivedSignature !== expectedSignature) {
    console.error('PayFast ITN: signature mismatch');
    console.error('>>> ITN DEBUG — received >>>', receivedSignature);
    console.error('>>> ITN DEBUG — expected >>>', expectedSignature);
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

  if (pfData.payment_status !== 'COMPLETE') {
  console.log(
    `PayFast ITN: payment status is ${pfData.payment_status}, not COMPLETE`
  );

  return res.status(200).send('Payment not complete');
}
  
  const status = 'Paid';
  
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
