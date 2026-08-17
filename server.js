import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import fs from 'fs';
import fsp from 'fs/promises';
import nodemailer from 'nodemailer';

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

// Instagram
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;
const IG_USER_ID = process.env.IG_USER_ID || null;
const IG_API_VERSION = process.env.IG_API_VERSION || 'v23.0';
const IG_API_HOST = process.env.IG_API_HOST || 'https://graph.instagram.com';

// Admin
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

// Booking destination
const BOOKING_TO = process.env.BOOKING_TO || 'dj.team-holland@web.de';

// Preferred mail transport on Render Free: Brevo HTTPS API
const BREVO_API_KEY = process.env.BREVO_API_KEY || '';
const MAIL_FROM_EMAIL = process.env.MAIL_FROM_EMAIL || process.env.SMTP_FROM || process.env.SMTP_USER || '';
const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || 'DJ Holland App';

// SMTP fallback (works locally / paid Render, but Render Free blocks common SMTP ports)
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER || MAIL_FROM_EMAIL || BOOKING_TO;

// Runtime state. On Render Free this file is ephemeral and can be lost on restart/redeploy.
// The API is designed so the storage layer can later be swapped for Postgres/Redis without changing the frontend.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'state.json');

const adminSessions = new Map();
const loginAttempts = new Map();
const bookingAttempts = new Map();
const wishAttempts = new Map();
let stateWrite = Promise.resolve();
let state = { wishes: [], bookings: [] };

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h', etag: true }));

async function loadState() {
  try {
    await fsp.mkdir(DATA_DIR, { recursive: true });
    if (fs.existsSync(DATA_FILE)) {
      const parsed = JSON.parse(await fsp.readFile(DATA_FILE, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        state.wishes = Array.isArray(parsed.wishes) ? parsed.wishes : [];
        state.bookings = Array.isArray(parsed.bookings) ? parsed.bookings : [];
      }
    }
  } catch (err) {
    console.error('State load error:', err?.message || err);
  }
}

function saveState() {
  stateWrite = stateWrite.then(async () => {
    try {
      await fsp.mkdir(DATA_DIR, { recursive: true });
      const tmp = `${DATA_FILE}.tmp`;
      await fsp.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
      await fsp.rename(tmp, DATA_FILE);
    } catch (err) {
      console.error('State save error:', err?.message || err);
    }
  });
  return stateWrite;
}

function clientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.socket.remoteAddress || 'unknown';
}

function rateLimited(map, key, max, windowMs) {
  const now = Date.now();
  const item = map.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > item.resetAt) {
    item.count = 0;
    item.resetAt = now + windowMs;
  }
  if (item.count >= max) return true;
  item.count += 1;
  map.set(key, item);
  return false;
}

function cleanText(value, max = 1000) {
  return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || '';
  raw.split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i < 0) return;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function getAdminSession(req) {
  const sid = parseCookies(req).djh_admin_session;
  if (!sid) return null;
  const session = adminSessions.get(sid);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    adminSessions.delete(sid);
    return null;
  }
  return { sid, ...session };
}

function adminCookie(value, maxAgeSeconds) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `djh_admin_session=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
}

function requireAdmin(req, res, next) {
  const session = getAdminSession(req);
  if (!session) return res.status(401).json({ ok: false, error: 'admin_auth_required', message: 'Bitte zuerst als Admin anmelden.' });
  req.adminSession = session;
  next();
}

// ---------------- Instagram ----------------
function requireInstagramConfig(res) {
  if (!IG_ACCESS_TOKEN) {
    res.status(503).json({ ok: false, error: 'instagram_not_configured', message: 'Servervariable IG_ACCESS_TOKEN fehlt.' });
    return false;
  }
  return true;
}

async function igGet(pathname, params = {}) {
  const url = new URL(`${IG_API_HOST}/${IG_API_VERSION}/${pathname}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  });
  const r = await fetch(url, { headers: { Authorization: `Bearer ${IG_ACCESS_TOKEN}` } });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!r.ok) {
    const err = new Error(`Instagram API ${r.status}`);
    err.status = r.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function instagramFeedHandler(req, res) {
  if (!requireInstagramConfig(res)) return;
  try {
    let igUserId = IG_USER_ID;
    let username = 'djholland91official';
    if (!igUserId) {
      const me = await igGet('me', { fields: 'id,username' });
      igUserId = me.id;
      username = me.username || username;
    }
    const media = await igGet(`${igUserId}/media`, {
      fields: 'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,username',
      limit: 24
    });
    let stories = [];
    try {
      const storyData = await igGet(`${igUserId}/stories`, {
        fields: 'id,media_type,media_url,thumbnail_url,permalink,timestamp',
        limit: 20
      });
      stories = Array.isArray(storyData.data) ? storyData.data : [];
    } catch { stories = []; }
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json({ ok: true, username, items: Array.isArray(media.data) ? media.data : [], stories });
  } catch (e) {
    console.error('Instagram feed error:', e.data || e.message);
    res.status(e.status || 502).json({ ok: false, error: 'instagram_api_error', message: 'Instagram konnte nicht geladen werden.' });
  }
}

app.get('/api/instagram/feed', instagramFeedHandler);
app.get('/api/instagram', instagramFeedHandler);

// ---------------- Admin auth ----------------
app.post('/api/admin/login', (req, res) => {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    return res.status(503).json({ ok: false, error: 'admin_not_configured', message: 'Admin-Zugang ist noch nicht konfiguriert.' });
  }
  const ip = clientIp(req);
  const now = Date.now();
  const attempt = loginAttempts.get(ip) || { count: 0, resetAt: now + 15 * 60 * 1000 };
  if (now > attempt.resetAt) { attempt.count = 0; attempt.resetAt = now + 15 * 60 * 1000; }
  if (attempt.count >= 8) {
    return res.status(429).json({ ok: false, error: 'too_many_attempts', message: 'Zu viele Login-Versuche. Bitte später erneut versuchen.' });
  }
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const ok = safeEqual(email, ADMIN_EMAIL.trim().toLowerCase()) && safeEqual(password, ADMIN_PASSWORD);
  if (!ok) {
    attempt.count += 1;
    loginAttempts.set(ip, attempt);
    return res.status(401).json({ ok: false, error: 'invalid_credentials', message: 'E-Mail oder Passwort ist falsch.' });
  }
  loginAttempts.delete(ip);
  const sid = crypto.randomBytes(32).toString('hex');
  adminSessions.set(sid, { email, expiresAt: now + ADMIN_SESSION_TTL_MS });
  res.setHeader('Set-Cookie', adminCookie(sid, Math.floor(ADMIN_SESSION_TTL_MS / 1000)));
  res.json({ ok: true, email });
});

app.get('/api/admin/session', (req, res) => {
  const session = getAdminSession(req);
  res.set('Cache-Control', 'no-store');
  if (!session) return res.status(401).json({ ok: false, authenticated: false });
  res.json({ ok: true, authenticated: true, email: session.email });
});

app.post('/api/admin/logout', requireAdmin, (req, res) => {
  adminSessions.delete(req.adminSession.sid);
  res.setHeader('Set-Cookie', adminCookie('', 0));
  res.json({ ok: true });
});

// ---------------- Musikwünsche ----------------
app.post('/api/wishes', async (req, res) => {
  const ip = clientIp(req);
  if (rateLimited(wishAttempts, ip, 12, 10 * 60 * 1000)) {
    return res.status(429).json({ ok: false, message: 'Zu viele Wünsche in kurzer Zeit. Bitte kurz warten.' });
  }

  // Honeypot
  if (cleanText(req.body?.website, 200)) return res.json({ ok: true });

  const event = cleanText(req.body?.event, 120);
  const name = cleanText(req.body?.name, 120);
  const song = cleanText(req.body?.song, 180);
  const artist = cleanText(req.body?.artist, 180);
  const message = cleanText(req.body?.message, 600);

  if (!event || !name || !song || !artist) {
    return res.status(400).json({ ok: false, message: 'Bitte Event-Code, Name, Song und Interpret ausfüllen.' });
  }

  const wish = {
    id: crypto.randomUUID(),
    event,
    name,
    song,
    artist,
    message,
    done: false,
    createdAt: new Date().toISOString()
  };

  state.wishes.unshift(wish);
  // Keep the latest 500 entries.
  state.wishes = state.wishes.slice(0, 500);
  await saveState();
  res.json({ ok: true, message: 'Dein Musikwunsch ist bei DJ Holland angekommen. 🎵' });
});

app.get('/api/admin/wishes', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, wishes: state.wishes });
});

app.patch('/api/admin/wishes/:id', requireAdmin, async (req, res) => {
  const item = state.wishes.find(w => w.id === req.params.id);
  if (!item) return res.status(404).json({ ok: false, message: 'Wunsch nicht gefunden.' });
  if (typeof req.body?.done === 'boolean') item.done = req.body.done;
  await saveState();
  res.json({ ok: true, wish: item });
});

app.delete('/api/admin/wishes/:id', requireAdmin, async (req, res) => {
  const before = state.wishes.length;
  state.wishes = state.wishes.filter(w => w.id !== req.params.id);
  if (state.wishes.length === before) return res.status(404).json({ ok: false, message: 'Wunsch nicht gefunden.' });
  await saveState();
  res.json({ ok: true });
});

app.delete('/api/admin/wishes', requireAdmin, async (req, res) => {
  state.wishes = [];
  await saveState();
  res.json({ ok: true });
});

// ---------------- Booking ----------------
function smtpMailer() {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
}

async function sendViaBrevo({ to, replyTo, subject, text }) {
  if (!BREVO_API_KEY || !MAIL_FROM_EMAIL) return false;
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'api-key': BREVO_API_KEY
    },
    body: JSON.stringify({
      sender: { email: MAIL_FROM_EMAIL, name: MAIL_FROM_NAME },
      to: [{ email: to, name: 'DJ Holland' }],
      replyTo: replyTo ? { email: replyTo } : undefined,
      subject,
      textContent: text
    })
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Brevo ${response.status}: ${body.slice(0, 500)}`);
  }
  return true;
}

async function sendBookingMail({ email, subject, text }) {
  if (BREVO_API_KEY && MAIL_FROM_EMAIL) {
    await sendViaBrevo({ to: BOOKING_TO, replyTo: email, subject, text });
    return 'brevo';
  }

  const mailer = smtpMailer();
  if (mailer) {
    await mailer.sendMail({ from: SMTP_FROM, to: BOOKING_TO, replyTo: email, subject, text });
    return 'smtp';
  }

  return null;
}

app.post('/api/booking', async (req, res) => {
  const ip = clientIp(req);
  if (rateLimited(bookingAttempts, ip, 5, 60 * 60 * 1000)) {
    return res.status(429).json({ ok: false, message: 'Zu viele Anfragen. Bitte später erneut versuchen.' });
  }

  if (cleanText(req.body?.website, 200)) return res.json({ ok: true });

  const name = cleanText(req.body?.name, 120);
  const email = cleanText(req.body?.email, 180).toLowerCase();
  const phone = cleanText(req.body?.phone, 80);
  const eventType = cleanText(req.body?.eventType, 120);
  const date = cleanText(req.body?.date, 40);
  const location = cleanText(req.body?.location, 160);
  const message = cleanText(req.body?.message, 4000);

  if (!name || !validEmail(email) || !message) {
    return res.status(400).json({ ok: false, message: 'Bitte Name, gültige E-Mail-Adresse und Nachricht ausfüllen.' });
  }

  const booking = {
    id: crypto.randomUUID(),
    name, email, phone, eventType, date, location, message,
    createdAt: new Date().toISOString(),
    mailSent: false
  };

  // Save first, so a mail-provider outage does not discard the request while the instance is running.
  state.bookings.unshift(booking);
  state.bookings = state.bookings.slice(0, 250);
  await saveState();

  const subject = `Neue DJ-Holland-Anfrage${date ? ` – ${date}` : ''} – ${name}`;
  const text = [
    'Neue Buchungsanfrage über die DJ Holland App', '',
    `Name: ${name}`,
    `E-Mail: ${email}`,
    `Telefon: ${phone || '-'}`,
    `Event: ${eventType || '-'}`,
    `Datum: ${date || '-'}`,
    `Ort / Location: ${location || '-'}`, '',
    'Nachricht:', message, '',
    `Gesendet: ${booking.createdAt}`
  ].join('\n');

  try {
    const transport = await sendBookingMail({ email, subject, text });
    if (!transport) {
      console.warn('Booking saved, but no mail provider configured.');
      return res.status(202).json({ ok: true, saved: true, mailSent: false, message: 'Danke! Deine Anfrage wurde gespeichert.' });
    }
    booking.mailSent = true;
    booking.mailTransport = transport;
    await saveState();
    res.json({ ok: true, saved: true, mailSent: true, message: 'Danke! Deine Anfrage wurde direkt an DJ Holland gesendet.' });
  } catch (error) {
    console.error('Booking mail error:', error?.message || error);
    res.status(202).json({ ok: true, saved: true, mailSent: false, message: 'Danke! Deine Anfrage wurde gespeichert. Die E-Mail-Benachrichtigung wird noch geprüft.' });
  }
});

app.get('/api/admin/bookings', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, bookings: state.bookings });
});

// ---------------- Health ----------------
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    instagramConfigured: Boolean(IG_ACCESS_TOKEN),
    adminConfigured: Boolean(ADMIN_EMAIL && ADMIN_PASSWORD),
    bookingMail: BREVO_API_KEY && MAIL_FROM_EMAIL ? 'brevo' : (SMTP_HOST && SMTP_USER && SMTP_PASS ? 'smtp' : 'not_configured'),
    wishes: state.wishes.length
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

await loadState();
app.listen(PORT, () => {
  console.log(`DJ Holland V19.5 läuft auf Port ${PORT}`);
  console.log(`Mail transport: ${BREVO_API_KEY && MAIL_FROM_EMAIL ? 'Brevo HTTPS' : (SMTP_HOST ? 'SMTP fallback' : 'not configured')}`);
});
