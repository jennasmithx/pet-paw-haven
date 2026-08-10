// api/order-status.js
// GET /api/order-status?ref=ORD-xxxxxxx
// Returns { status: 'Paid' | 'Pending' | 'Failed' | null }
//
// Used by thank-you.html (and optionally checkout-cancelled.html) to verify
// an order's real payment_status before showing a success/failure message —
// since PayFast redirects the browser to return_url/cancel_url regardless of
// whether payment actually succeeded. The webhook (payfast-notify.js) is the
// only thing that should ever set payment_status to 'Paid'; this endpoint
// just reads that value, it never writes it.
//
// Uses the service role key since this needs to read orders without an
// RLS policy exposing the whole orders table to anon reads. Only returns
// the status field — never the customer's name, address, etc — so it's
// safe to call from a public page even if someone guesses/enumerates refs.

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
    .single();

  if (error || !order) {
    // Don't leak whether the ref format is "close" to valid — just say not found
    return res.status(404).json({ status: null });
  }

  return res.status(200).json({ status: order.payment_status });
}