/* ./server.js */
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const compression = require('compression');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');

const User = require('./models/User');
const { connectDB } = require('./utils/db');

const app = express();
const PORT = process.env.PORT || 3000;

// ── 1. Connect MongoDB ─────────────────────────────────────────────────────
connectDB();
require('./utils/gmailPoller').startPoller();

// ── 2. Ensure upload dir exists ────────────────────────────────────────────
const mediaDir = path.join(__dirname, 'public', 'media');
if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });

// ── 3. Baseline middleware ─────────────────────────────────────────────────
app.use(compression({ level: 6 }));
app.use((req, res, next) => {
  res.setHeader('X-DNS-Prefetch-Control', 'on');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});
app.disable('x-powered-by');

app.use(cors({
  origin: process.env.BASE_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ── 4. Session (backed by MongoDB) ────────────────────────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET || 'mailgpt-dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/mailgpt',
    ttl: 7 * 24 * 60 * 60,  // 7 days
    autoRemove: 'native',
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));

// ── 5. Passport — Google OAuth2 ───────────────────────────────────────────
passport.use(new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const firstName = profile.name?.givenName || profile.displayName.split(' ')[0] || '';
      const lastName = profile.name?.familyName || '';

      let user = await User.findOne({ googleId: profile.id });

      if (user) {
        // Refresh tokens on every login so we never hold stale ones
        user.accessToken = accessToken;
        if (refreshToken) user.refreshToken = refreshToken;
        user.lastLogin = new Date();
        // Keep name/avatar in sync with Google
        user.displayName = profile.displayName;
        user.firstName = firstName;
        user.lastName = lastName;
        user.avatar = profile.photos?.[0]?.value || user.avatar;
        await user.save();
      } else {
        user = await User.create({
          googleId: profile.id,
          email: profile.emails[0].value,
          displayName: profile.displayName,
          firstName,
          lastName,
          avatar: profile.photos?.[0]?.value || '',
          accessToken,
          refreshToken: refreshToken || '',
        });
        console.log(`🎉  New freelancer registered: ${user.email}`);
      }

      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  },
));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try { done(null, await User.findById(id)); }
  catch (err) { done(err, null); }
});

app.use(passport.initialize());
app.use(passport.session());

// ── 6. Static files ───────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public'), {
  index: false, // 🛡️ CRITICAL: Don't let static bypass our auth gate!
  maxAge: '1y',
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'public, max-age=600');
    if (filePath.includes('/media/')) res.setHeader('Cache-Control', 'public, max-age=604800');
  },
}));

// ── 7. Routes ─────────────────────────────────────────────────────────────
app.use('/auth', require('./routes/auth'));
app.use('/api/email', require('./routes/email'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/media', require('./routes/media'));
app.use('/api/consultant', require('./routes/consultant'));

// ── 8. Root & SPA Gateway ──────────────────────────────────────────────────
app.get('/', (req, res) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

// Everyone can access the AI Consultant
app.get('/consultant.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'consultant.html'));
});

// For any other route, if they aren't logged in, send them back to landing!
app.get('*', (req, res) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  res.redirect('/');
});

// ── 9. Start ──────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`\n🚀  MailGPT running at http://localhost:${PORT}\n`);
});

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;