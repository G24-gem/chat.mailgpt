require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure media directory exists
const mediaDir = path.join(__dirname, 'public', 'media');
if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });

// ─── PERFORMANCE: Gzip compress all responses ────────────────────────────────
// Shrinks HTML/CSS/JS by 60-80% over the wire
app.use(compression({ level: 6 }));

// ─── PERFORMANCE: Security + speed headers ───────────────────────────────────
app.use((req, res, next) => {
  // Tell browsers to cache DNS lookups
  res.setHeader('X-DNS-Prefetch-Control', 'on');
  // Prevent MIME sniffing (security + avoids extra browser work)
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Remove Express fingerprint
  next();
});
app.disable('x-powered-by');

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ─── PERFORMANCE: Aggressive static file caching ─────────────────────────────
// CSS/JS/images cached for 1 year in browser — they never re-download unless filename changes
// index.html cached for 10 minutes — always gets a fresh page on revisit
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1y',           // cache everything for 1 year
  etag: true,             // ETags for smart revalidation
  lastModified: true,     // Last-Modified headers
  setHeaders: (res, filePath) => {
    // HTML files should never be cached long — so the app always loads fresh
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'public, max-age=600'); // 10 minutes
    }
    // Uploaded media files — cache for 7 days
    if (filePath.includes('/media/')) {
      res.setHeader('Cache-Control', 'public, max-age=604800');
    }
  }
}));

// ─── PERFORMANCE: Pre-load routes at startup (not on first request) ──────────
const emailRoutes = require('./routes/email');
const chatRoutes = require('./routes/chat');
const mediaRoutes = require('./routes/media');

app.use('/api/email', emailRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/media', mediaRoutes);

// ─── PERFORMANCE: Serve index.html with no-cache so app always loads fresh ───
app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=600');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── PERFORMANCE: Increase Node.js default keep-alive ────────────────────────
// Keeps TCP connections open — avoids reconnection overhead per request
const server = app.listen(PORT, () => {
  console.log(`\n🚀 MailGPT running at http://localhost:${PORT}\n`);
});

server.keepAliveTimeout = 65000;    // 65 seconds (slightly above nginx/load balancer defaults)
server.headersTimeout = 66000;      // must be slightly above keepAliveTimeout