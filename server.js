
import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;
const IG_USER_ID = process.env.IG_USER_ID || null;
const IG_API_VERSION = process.env.IG_API_VERSION || 'v23.0';
const IG_API_HOST = process.env.IG_API_HOST || 'https://graph.instagram.com';

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

app.get('/api/health', (req,res) => {
  res.json({
    ok:true,
    instagramConfigured:Boolean(IG_ACCESS_TOKEN)
  });
});

app.get('/api/instagram/feed', async (req,res) => {
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
});

app.get('*', (req,res) => {
  res.sendFile(path.join(__dirname,'
  console.log(`DJ Holland V12 läuft auf Port ${PORT}`);
});
app.listen(PORT, '0.0.0.0', () => {