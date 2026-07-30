// api/payfast-notify.js
// PayFast posts here (server-to-server) after a payment attempt. This is the ONLY place
// that should ever flip an order to "Paid" — never trust the return_url redirect for that,
// since a customer can close the tab before it fires, or fake hitting it directly.
//
// Vercel needs the raw body for signature verification, so we disable the default JSON parser.

import { createClient } from '@supabase/supabase-js';
import { generateSignature, validateWithPayFast } from './_payfast.js';
import dns from 'dns/promises';

export const config = {
  api: { bodyParser: false }
};

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

  // 4) Look up the order WE created and compare the amount PayFast says was paid
  //    against what we expect. This stops anyone from paying a smaller amount
  //    for a different order and having it marked as fully paid.
  const { data: order, error } = await supabase
    .from('orders')
    .select('*')
    .eq('payment_id', pfData.m_payment_id)
    .single();

  if (error || !order) {
    console.error('PayFast ITN: no matching order', pfData.m_payment_id);
    return res.status(404).send('order not found');
  }

  const paidAmount = parseFloat(pfData.amount_gross ?? pfData.amount);
  const expectedAmount = parseFloat(order.amount);

  if (Math.abs(paidAmount - expectedAmount) > 0.01) {
    console.error('PayFast ITN: amount mismatch', paidAmount, expectedAmount);
    await supabase.from('orders').update({ payment_status: 'Amount Mismatch' }).eq('id', order.id);
    return res.status(400).send('amount mismatch');
  }

  // 5) All checks passed — safe to update the order.
  const status = pfData.payment_status === 'COMPLETE' ? 'Paid' : pfData.payment_status;
  await supabase.from('orders').update({ payment_status: status }).eq('id', order.id);

  // TODO: send the customer their own receipt email here (e.g. via Resend/SendGrid),
  // using order.email — PayFast will NOT do this for you using the buyer's address.

  return res.status(200).send('OK');
}