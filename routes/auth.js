/* ./routes/auth.js */
const express = require('express');
const passport = require('passport');
const router = express.Router();

// ── Kick off Google OAuth ──────────────────────────────────────────────────
// gmail.send    → send emails from the user's account
// gmail.readonly → read threads so the poller can detect client replies
// accessType:'offline' + prompt:'consent' guarantees a refresh_token every time.
router.get('/google', passport.authenticate('google', {
  scope: [
    'profile',
    'email',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly',
  ],
  accessType: 'offline',
  prompt: 'consent',
}));

// ── OAuth callback ─────────────────────────────────────────────────────────
router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/?auth=failed' }),
  (req, res) => res.redirect('/?auth=success'),
);

// ── Current user (JSON) ────────────────────────────────────────────────────
router.get('/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: req.user.toSafeObject() });
});

// ── Logout ─────────────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  req.logout(err => {
    if (err) return res.status(500).json({ error: err.message });
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ success: true });
    });
  });
});

module.exports = router;