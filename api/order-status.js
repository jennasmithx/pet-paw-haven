// api/order-status.js
// GET /api/order-status?ref=ORD-xxxxxxx   (ref = payment_id, shared across
// every row inserted for that checkout)
// Returns { status: 'Pending' | 'Paid' | 'Failed' | null }
//
// Used by order-success.html to verify the real payment_status before showing a
// success message. Since a single checkout can insert multiple rows (one per
// cart item, all sharing payment_id), this just checks the first matching
// row — the webhook updates all rows with the same payment_id together, so
// they should always agree.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ref } = req.query;

  if (!ref || typeof ref !== 'string') {
    return res.status(400).json({ error: 'Missing order reference' });
  }

  const { data: order, error } = await supabase
    .from('orders')
    .select('payment_status')
    .eq('payment_id', ref)
    .limit(1)
    .single();

  if (error || !order) {
    return res.status(404).json({ status: null });
  }

  return res.status(200).json({ status: order.payment_status });
}