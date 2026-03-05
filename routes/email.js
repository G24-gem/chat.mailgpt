const express = require('express');
const router = express.Router();
const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

router.post('/send', async (req, res) => {
  const { to, subject, html } = req.body;

  if (!to || !subject || !html) {
    return res.status(400).json({ error: 'Missing required fields: to, subject, html' });
  }

  try {
    const [response] = await sgMail.send({
      from: `"MailGPT" <${process.env.SENDER_EMAIL}>`,
      to,
      subject,
      html,
    });

    res.json({ success: true, statusCode: response.statusCode });
  } catch (err) {
    console.error('Send error:', err?.response?.body || err.message);
    res.status(500).json({ error: err?.response?.body?.errors || err.message });
  }
});

router.get('/verify', async (req, res) => {
  try {
    // SendGrid HTTP API has no verify() — check key is set instead
    if (!process.env.SENDGRID_API_KEY) {
      throw new Error('SENDGRID_API_KEY is not set');
    }
    res.json({ success: true, message: 'API key is configured' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;