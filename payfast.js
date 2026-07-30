// api/_payfast.js
// Shared PayFast helpers. Not a route itself — imported by create-order.js and payfast-notify.js.
import crypto from 'crypto';

// PayFast's own flavour of urlencoding: spaces as "+", uppercase hex escapes.
function pfEncode(value) {
  return encodeURIComponent(String(value))
    .replace(/%20/g, '+')
    .replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

// Builds the exact query string PayFast expects, in the order the fields were added,
// then MD5-hashes it (with the passphrase appended if you've set one on your account).
// The order of fields does not have to match anything in particular, but the SAME
// order must be used both when generating the signature and when POSTing the form.
export function generateSignature(fields, passphrase) {
  let pairs = [];
  for (const key in fields) {
    if (fields[key] !== undefined && fields[key] !== null && fields[key] !== '') {
      pairs.push(`${key}=${pfEncode(fields[key])}`);
    }
  }
  let queryString = pairs.join('&');
  if (passphrase) {
    queryString += `&passphrase=${pfEncode(passphrase)}`;
  }
  return crypto.createHash('md5').update(queryString).digest('hex');
}

// Calls PayFast's own validation endpoint to confirm an ITN payload really came from them.
// This is IN ADDITION TO checking the signature — PayFast recommends both.
export async function validateWithPayFast(rawBody, sandbox) {
  const host = sandbox ? 'sandbox.payfast.co.za' : 'www.payfast.co.za';
  const res = await fetch(`https://${host}/eng/query/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: rawBody
  });
  const text = (await res.text()).trim();
  return text === 'VALID';
}

// Fixed, trusted-server-side product catalogue. NEVER trust a price sent from the browser —
// this is the single source of truth for what something costs.
export const PRODUCTS = {
  'PCWF-001': {
    name: 'Premium Cat Water Fountain',
    sku: 'PCWF-001',
    price: 650.00
  }
  // Add more products here as you add more items to the store.
};