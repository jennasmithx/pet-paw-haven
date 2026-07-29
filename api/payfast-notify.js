import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const {
    payment_status,
    m_payment_id,
    pf_payment_id,
    amount_gross
  } = req.body;

  // Only update if payment completed
  if (payment_status === "COMPLETE") {
    const { error } = await supabase
      .from("orders")
      .update({
        payment_status: "Paid",
        amount: amount_gross,
        payment_id: pf_payment_id
      })
      .eq("payment_id", m_payment_id);

    if (error) {
      console.error(error);
      return res.status(500).send("Database Error");
    }
  }

  return res.status(200).send("OK");
}