// api/contact.js
// Handles the "Send a message" form on contact.html — sends via Resend
// instead of Formspree, so it comes from your own domain like the order
// emails do. The customer's email is set as reply-to, so you can just hit
// reply in your inbox and it'll go straight back to them.
//
// Requires RESEND_API_KEY env var (same one used by api/payfast-notify.js).

const FROM_ADDRESS = 'PetPaw Haven <orders@petpawhaven.co.za>';
const STORE_OWNER_EMAIL = process.env.GMAIL_USER;

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, email, message } = req.body || {};

  if (!name || !message) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!emailRe.test(String(email || '').trim())) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: STORE_OWNER_EMAIL,
        reply_to: email.trim(),
        subject: `New contact form message — ${name}`,
        text: `From: ${name} <${email}>\n\n${message}`,
        html: `
          <p><strong>From:</strong> ${escapeHtml(name)} (${escapeHtml(email)})</p>
          <p><strong>Message:</strong></p>
          <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
        `,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Resend contact send failed:', errText);
      return res.status(500).json({ error: 'Could not send message' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Contact form send error:', err);
    return res.status(500).json({ error: 'Could not send message' });
  }
}
