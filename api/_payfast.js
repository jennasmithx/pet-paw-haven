// api/_payfast.js
// Shared helpers for the PayFast checkout flow — imported by checkout.js
// (and would also be imported by payfast-notify.js if it needs to re-verify
// signatures or look up product info).

import crypto from 'crypto';

// PRODUCTS is your server-side source of truth for prices — this is what
// makes it safe to trust nothing the browser sends. Every product your
// cart can add must have an entry here, keyed by the same id your product
// cards use in data-id (cart.js reads cardEl.dataset.id and sends that as
// productId).
//
// IMPORTANT — keep this in sync with public/products-data.js by hand.
// products-data.js is a plain <script> (not a module), so it can't be
// imported directly here — this is a duplicate on purpose. If you add or
// change a product, update BOTH files, or checkout will either reject the
// item ("Unknown product") or charge the old price.
export const PRODUCTS = {
  "1": { name: "Premium Pet Water Fountain", price: 449.00, sku: "1" },
  "2": { name: "Automatic Pet Feeder", price: 449.00, sku: "2" },
};

// Generates the MD5 signature PayFast requires on every request.
// Same algorithm PayFast expects on both the outgoing payment request
// and the incoming ITN webhook — alphabetical key order, URL-encoded,
// spaces as '+', optional passphrase appended at the end.
export function generateSignature(data, passphrase) {
  let pfOutput = '';
  Object.keys(data)
    .sort()
    .forEach(key => {
      if (data[key] !== '' && data[key] !== undefined && key !== 'signature') {
        pfOutput += `${key}=${encodeURIComponent(data[key].toString().trim()).replace(/%20/g, '+')}&`;
      }
    });
  pfOutput = pfOutput.slice(0, -1);
  if (passphrase) {
    pfOutput += `&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}`;
  }
  return crypto.createHash('md5').update(pfOutput).digest('hex');
}

// Asks PayFast's own servers to confirm an ITN post is genuine (not spoofed).
// rawBody is the exact x-www-form-urlencoded body PayFast posted to the
// webhook — forwarded as-is to PayFast's validate endpoint.
export async function validateWithPayFast(rawBody, sandbox) {
  const validateUrl = sandbox
    ? 'https://sandbox.payfast.co.za/eng/query/validate'
    : 'https://www.payfast.co.za/eng/query/validate';

  try {
    const response = await fetch(validateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: rawBody
    });
    const text = await response.text();
    return text.trim() === 'VALID';
  } catch (err) {
    console.error('PayFast validate request failed:', err);
    return false;
  }
}
