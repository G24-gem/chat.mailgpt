const express = require('express');
const router = express.Router();
const sgMail = require('@sendgrid/mail');

const apiKey = process.env.SENDGRID_API_KEY?.trim();

if (!apiKey) {
  console.error('SENDGRID_API_KEY is not set or is empty');
  process.exit(1); // or handle gracefully
}

sgMail.setApiKey(apiKey);

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
    const sgErrors = err?.response?.body?.errors;
    const errorMessage = sgErrors
      ? sgErrors.map(e => e.message).join(', ')
      : err.message;

    console.error('Send error:', errorMessage);
    res.status(500).json({ error: errorMessage });
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