
import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;
const IG_USER_ID = process.env.IG_USER_ID || null;
const IG_API_VERSION = process.env.IG_API_VERSION || 'v23.0';
const IG_API_HOST = process.env.IG_API_HOST || 'https://graph.instagram.com';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const BOOKING_TO = process.env.BOOKING_TO || 'dj.team-holland@web.de';
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = String(process.env.SMTP_SECURE || 'true').toLowerCase() !== 'false';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER || BOOKING_TO;
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const adminSessions = new Map();
const loginAttempts = new Map();
const bookingAttempts = new Map();

app.disable('x-powered-by');
app.use(express.json({limit:'1mb'}));
app.use(express.static(path.join(__dirname,'public'),{
  maxAge:'1h',
  etag:true
}));

function requireInstagramConfig(res){
  if(!IG_ACCESS_TOKEN){
    res.status(503).json({
      ok:false,
      error:'instagram_not_configured',
      message:'Servervariable IG_ACCESS_TOKEN fehlt.'
    });
    return false;
  }
  return true;
}

async function igGet(pathname, params={}){
  const url = new URL(`${IG_API_HOST}/${IG_API_VERSION}/${pathname}`);
  Object.entries(params).forEach(([k,v]) => {
    if(v !== undefined && v !== null && v !== '') url.searchParams.set(k,String(v));
  });
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${IG_ACCESS_TOKEN}` }
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = {raw:text}; }
  if(!r.ok){
    const err = new Error(`Instagram API ${r.status}`);
    err.status = r.status;
    err.data = data;
    throw err;
  }
  return data;
}


function safeEqual(a,b){
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if(aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa,bb);
}

function parseCookies(req){
  const out = {};
  const raw = req.headers.cookie || '';
  raw.split(';').forEach(part => {
    const i = part.indexOf('=');
    if(i < 0) return;
    const k = part.slice(0,i).trim();
    const v = part.slice(i+1).trim();
    if(k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function getAdminSession(req){
  const sid = parseCookies(req).djh_admin_session;
  if(!sid) return null;
  const session = adminSessions.get(sid);
  if(!session) return null;
  if(session.expiresAt < Date.now()){
    adminSessions.delete(sid);
    return null;
  }
  return {sid, ...session};
}

function adminCookie(value, maxAgeSeconds){
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `djh_admin_session=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
}

function requireAdmin(req,res,next){
  const session = getAdminSession(req);
  if(!session) return res.status(401).json({ok:false,error:'admin_auth_required'});
  req.adminSession = session;
  next();
}


function cleanText(value, max=1000){
  return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g,' ').trim().slice(0,max);
}

function validEmail(value){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function bookingMailer(){
  if(!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
}

app.post('/api/booking', async (req,res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const state = bookingAttempts.get(ip) || {count:0, resetAt: now + 60*60*1000};
  if(now > state.resetAt){ state.count = 0; state.resetAt = now + 60*60*1000; }
  if(state.count >= 8){
    return res.status(429).json({ok:false,message:'Zu viele Anfragen. Bitte später erneut versuchen.'});
  }

  // Honeypot against simple bots.
  if(cleanText(req.body?.website, 200)) return res.json({ok:true});

  const name = cleanText(req.body?.name, 120);
  const email = cleanText(req.body?.email, 180).toLowerCase();
  const phone = cleanText(req.body?.phone, 80);
  const eventType = cleanText(req.body?.eventType, 120);
  const date = cleanText(req.body?.date, 40);
  const location = cleanText(req.body?.location, 160);
  const message = cleanText(req.body?.message, 4000);

  if(!name || !validEmail(email) || !message){
    return res.status(400).json({ok:false,message:'Bitte Name, gültige E-Mail-Adresse und Nachricht ausfüllen.'});
  }

  const mailer = bookingMailer();
  if(!mailer){
    return res.status(503).json({ok:false,message:'Der E-Mail-Versand ist noch nicht eingerichtet.'});
  }

  state.count += 1;
  bookingAttempts.set(ip, state);

  const subject = `Neue DJ-Holland-Anfrage${date ? ` – ${date}` : ''} – ${name}`;
  const text = [
    'Neue Buchungsanfrage über die DJ Holland App',
    '',
    `Name: ${name}`,
    `E-Mail: ${email}`,
    `Telefon: ${phone || '-'}`,
    `Event: ${eventType || '-'}`,
    `Datum: ${date || '-'}`,
    `Ort / Location: ${location || '-'}`,
    '',
    'Nachricht:',
    message,
    '',
    `Gesendet: ${new Date().toISOString()}`
  ].join('\n');

  try{
    await mailer.sendMail({
      from: SMTP_FROM,
      to: BOOKING_TO,
      replyTo: email,
      subject,
      text
    });
    res.json({ok:true,message:'Danke! Deine Anfrage wurde direkt an DJ Holland gesendet.'});
  }catch(error){
    console.error('Booking mail error:', error?.message || error);
    res.status(502).json({ok:false,message:'Die Anfrage konnte gerade nicht gesendet werden. Bitte später erneut versuchen.'});
  }
});

app.post('/api/admin/login', (req,res) => {
  if(!ADMIN_EMAIL || !ADMIN_PASSWORD){
    return res.status(503).json({ok:false,error:'admin_not_configured',message:'Admin-Zugang ist noch nicht konfiguriert.'});
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const attempt = loginAttempts.get(ip) || {count:0, resetAt:now + 15*60*1000};
  if(now > attempt.resetAt){ attempt.count = 0; attempt.resetAt = now + 15*60*1000; }
  if(attempt.count >= 8){
    return res.status(429).json({ok:false,error:'too_many_attempts',message:'Zu viele Login-Versuche. Bitte später erneut versuchen.'});
  }

  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const ok = safeEqual(email, ADMIN_EMAIL.trim().toLowerCase()) && safeEqual(password, ADMIN_PASSWORD);
  if(!ok){
    attempt.count += 1;
    loginAttempts.set(ip, attempt);
    return res.status(401).json({ok:false,error:'invalid_credentials',message:'E-Mail oder Passwort ist falsch.'});
  }

  loginAttempts.delete(ip);
  const sid = crypto.randomBytes(32).toString('hex');
  adminSessions.set(sid, {email, expiresAt: now + ADMIN_SESSION_TTL_MS});
  res.setHeader('Set-Cookie', adminCookie(sid, Math.floor(ADMIN_SESSION_TTL_MS/1000)));
  res.json({ok:true,email});
});

app.get('/api/admin/session', (req,res) => {
  const session = getAdminSession(req);
  res.set('Cache-Control','no-store');
  if(!session) return res.status(401).json({ok:false,authenticated:false});
  res.json({ok:true,authenticated:true,email:session.email});
});

app.post('/api/admin/logout', requireAdmin, (req,res) => {
  adminSessions.delete(req.adminSession.sid);
  res.setHeader('Set-Cookie', adminCookie('', 0));
  res.json({ok:true});
});

app.get('/api/health', (req,res) => {
  res.json({
    ok:true,
    instagramConfigured:Boolean(IG_ACCESS_TOKEN)
  });
});

async function instagramFeedHandler(req,res){
  if(!requireInstagramConfig(res)) return;
  try{
    // Instagram API with Instagram Login uses graph.instagram.com.
    // The exact API version is supplied via IG_API_VERSION so upgrades do not
    // require source-code changes.
    let igUserId = IG_USER_ID;
    let username = 'djholland91official';
    if(!igUserId){
      const me = await igGet('me', { fields:'id,username' });
      igUserId = me.id;
      username = me.username || username;
    }

    const media = await igGet(`${igUserId}/media`, {
      fields:'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,username',
      limit:24
    });

    // Stories are intentionally optional: availability depends on Meta API
    // capabilities/permissions for the account. A failure here must not break feed.
    let stories = [];
    try{
      const storyData = await igGet(`${igUserId}/stories`, {
        fields:'id,media_type,media_url,thumbnail_url,permalink,timestamp',
        limit:20
      });
      stories = Array.isArray(storyData.data) ? storyData.data : [];
    }catch{
      stories = [];
    }

    res.set('Cache-Control','public, max-age=60, stale-while-revalidate=300');
    res.json({
      ok:true,
      username,
      items:Array.isArray(media.data) ? media.data : [],
      stories
    });
  }catch(e){
    console.error('Instagram feed error:', e.data || e.message);
    res.status(e.status || 502).json({
      ok:false,
      error:'instagram_api_error',
      message:'Instagram konnte nicht geladen werden.'
    });
  }
}

app.get('/api/instagram/feed', instagramFeedHandler);
app.get('/api/instagram', instagramFeedHandler);

app.get('*', (req,res) => {
  res.sendFile(path.join(__dirname,'public','index.html'));
});

app.listen(PORT, () => {
  console.log(`DJ Holland V19 läuft auf Port ${PORT}`);
});
