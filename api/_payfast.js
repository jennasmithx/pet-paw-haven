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
// PayFast's own examples are written in PHP, using urlencode() — which
// encodes punctuation like ! ' ( ) * differently than JavaScript's
// encodeURIComponent() does. encodeURIComponent leaves those 5 characters
// unescaped (they're valid per RFC3986), but PayFast's signature check
// expects them percent-encoded PHP-style. Without this extra step, any
// name/address/item text containing one of these characters produces a
// signature mismatch even though the rest of the logic is correct.
function pfEncode(str) {
  return encodeURIComponent(str)
    .replace(/%20/g, '+')
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A');
}

export function generateSignature(data, passphrase) {
  let pfOutput = '';
  // IMPORTANT: PayFast's own documentation explicitly warns NOT to sort
  // alphabetically here — "Do not use the API signature format, which uses
  // alphabetical ordering!" Fields must stay in the order they were added
  // to `data` (matching PayFast's documented attribute order). JS objects
  // preserve insertion order for string keys, so Object.keys(data) without
  // .sort() gives the correct order — as long as checkout.js/payfast-notify.js
  // build their field objects in PayFast's documented order to begin with.
  Object.keys(data)
    .forEach(key => {
      if (data[key] !== '' && data[key] !== undefined && key !== 'signature') {
        pfOutput += `${key}=${pfEncode(data[key].toString().trim())}&`;
      }
    });
  pfOutput = pfOutput.slice(0, -1);
  if (passphrase) {
    pfOutput += `&passphrase=${pfEncode(passphrase.trim())}`;
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