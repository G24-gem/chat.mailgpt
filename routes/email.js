/* ./routes/email.js */
const express = require('express');
const { google } = require('googleapis');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// ── Build an authenticated Gmail client for the logged-in user ─────────────
function gmailClient(user) {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_CALLBACK_URL,
  );
  auth.setCredentials({
    access_token: user.accessToken,
    refresh_token: user.refreshToken,
  });
  return google.gmail({ version: 'v1', auth });
}

// ── RFC 2822 → base64url (what Gmail API needs) ───────────────────────────
function encodeMessage(from, displayName, to, subject, html) {
  const raw = [
    `From: "${displayName}" <${from}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=UTF-8`,
    ``,
    html,
  ].join('\r\n');

  return Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ── POST /api/email/send ───────────────────────────────────────────────────
router.post('/send', requireAuth, async (req, res) => {
  const { to, subject, html, sessionId } = req.body;

  if (!to || !subject || !html) {
    return res.status(400).json({ error: 'Missing required fields: to, subject, html' });
  }

  try {
    const gmail = gmailClient(req.user);
    const raw = encodeMessage(req.user.email, req.user.displayName || req.user.firstName, to, subject, html);

    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });

    // Track sent state for AI Agent Follow-ups
    if (sessionId) {
      const Session = require('../models/Session');
      await Session.findByIdAndUpdate(sessionId, {
        gmailThreadId: result.data.threadId,
        phase: 'sent_awaiting_reply',
        sentAt: new Date(),
        updatedAt: Date.now()
      });
      console.log(`[AGENT] Session ${sessionId} marked as sent_awaiting_reply (Thread: ${result.data.threadId})`);
    }

    res.json({ success: true, messageId: result.data.id, threadId: result.data.threadId });
  } catch (err) {
    console.error('Gmail send error:', err.response?.data || err.message);

    // Token expired → ask the frontend to re-authenticate
    if (err.code === 401 || err.status === 401) {
      return res.status(401).json({
        error: 'Gmail token expired. Please login again.',
        relogin: true,
        loginUrl: '/auth/google',
      });
    }

    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/email/verify — sanity-check that tokens work ─────────────────
router.get('/verify', requireAuth, async (req, res) => {
  try {
    const gmail = gmailClient(req.user);
    const profile = await gmail.users.getProfile({ userId: 'me' });
    res.json({ success: true, email: profile.data.emailAddress });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;