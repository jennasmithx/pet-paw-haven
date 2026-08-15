import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // service role, since we bypass RLS for the purchase check + insert
);

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { sku } = req.query;
    if (!sku) return res.status(400).json({ error: 'Missing sku' });

    const { data, error } = await supabase
      .from('reviews')
      .select('id, customer_name, rating, comment, created_at')
      .eq('product_sku', sku)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    const avg = data.length
      ? (data.reduce((sum, r) => sum + r.rating, 0) / data.length).toFixed(1)
      : null;

    return res.status(200).json({ reviews: data, average: avg, count: data.length });
  }

  if (req.method === 'POST') {
    const { product_sku, customer_name, email, rating, comment } = req.body;

    if (!product_sku || !customer_name || !email || !rating) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    // Verify a completed order exists for this email + product
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id')
      .eq('email', email)
      .eq('product_sku', product_sku)
      .eq('payment_status', 'Paid')
      .limit(1)
      .maybeSingle();

    if (orderError) return res.status(500).json({ error: orderError.message });
    if (!order) {
      return res.status(403).json({
        error: "We couldn't find a completed order for this product under that email."
      });
    }

    const { data, error } = await supabase
      .from('reviews')
      .insert([{ product_sku, customer_name, email, rating, comment }])
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    return res.status(201).json({ review: data });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
