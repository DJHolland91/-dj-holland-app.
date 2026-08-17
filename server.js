import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, 'public');

const PORT = process.env.PORT || 3000;
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN || '';
const IG_USER_ID = process.env.IG_USER_ID || '';
const IG_API_VERSION = process.env.IG_API_VERSION || 'v23.0';
const IG_API_HOST = process.env.IG_API_HOST || 'https://graph.instagram.com';

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.static(PUBLIC_DIR, { maxAge: '1h', etag: true }));

async function igGet(pathname, params = {}) {
  if (!IG_ACCESS_TOKEN) {
    const error = new Error('IG_ACCESS_TOKEN fehlt');
    error.status = 503;
    throw error;
  }

  const url = new URL(`${IG_API_HOST}/${IG_API_VERSION}/${pathname}`);
  url.searchParams.set('access_token', IG_ACCESS_TOKEN);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url);
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!response.ok) {
    const error = new Error(data?.error?.message || `Instagram API HTTP ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, instagramConfigured: Boolean(IG_ACCESS_TOKEN) });
});

app.get('/api/instagram', async (_req, res) => {
  try {
    let userId = IG_USER_ID;
    let username = 'djholland91official';

    if (!userId) {
      const me = await igGet('me', { fields: 'id,username' });
      userId = me.id;
      username = me.username || username;
    }

    const media = await igGet(`${userId}/media`, {
      fields: 'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,username',
      limit: 24
    });

    let stories = [];
    try {
      const storyData = await igGet(`${userId}/stories`, {
        fields: 'id,media_type,media_url,thumbnail_url,permalink,timestamp,username',
        limit: 20
      });
      stories = Array.isArray(storyData.data) ? storyData.data : [];
    } catch {
      stories = [];
    }

    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json({
      ok: true,
      username,
      items: Array.isArray(media.data) ? media.data : [],
      stories
    });
  } catch (error) {
    console.error('Instagram feed error:', error.data || error.message);
    res.status(error.status || 502).json({
      ok: false,
      error: 'instagram_api_error',
      message: 'Instagram konnte nicht geladen werden.'
    });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`DJ Holland App läuft auf Port ${PORT}`);
});
