// api/order-status.js
// GET /api/order-status?ref=123   (ref = orders.id)
// Returns { status: 'pending_payment' | 'paid' | 'failed' | 'shipped' | null }
//
// Used by thank-you.html to verify an order's real status before showing a
// success message — PayFast redirects the browser to return_url regardless
// of whether payment actually succeeded, so the redirect alone proves nothing.
// The webhook (payfast-notify.js) is the only thing that sets status to
// 'paid'; this endpoint only reads it.
//
// Uses the service role key so this works without an RLS policy exposing
// the whole orders table to anon reads. Only returns the status field —
// never customer details — so it's safe even if someone guesses/enumerates ids.

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
  const orderId = parseInt(ref, 10);

  if (!ref || !Number.isInteger(orderId)) {
    return res.status(400).json({ error: 'Missing or invalid order reference' });
  }

  const { data: order, error } = await supabase
    .from('orders')
    .select('status')
    .eq('id', orderId)
    .single();

  if (error || !order) {
    return res.status(404).json({ status: null });
  }

  return res.status(200).json({ status: order.status });
}