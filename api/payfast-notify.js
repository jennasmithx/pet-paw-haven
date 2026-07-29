export default async function handler(req, res) {
  // PayFast sends POST requests
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  console.log("PayFast ITN received:");
  console.log(req.body);

  // TODO:
  // 1. Verify the ITN with PayFast
  // 2. Check payment_status === "COMPLETE"
  // 3. Save the order to a database or send yourself an email

  return res.status(200).send("OK");
}