// ──────────────────────────────────────────────────────────────
//  WM 2026 · Admin-Proxy (Vercel Serverless Function)
//  Hält den Supabase service_role-Key SERVERSEITIG. Der Key wird
//  nie an den Browser ausgeliefert. Jede Anfrage muss ein gültiges
//  Supabase-Access-Token einer Admin-E-Mail mitsenden.
//
//  Benötigte Vercel Environment Variables:
//    SUPABASE_SERVICE_KEY_PROD = <service_role key Produktion>
//    SUPABASE_SERVICE_KEY_DEV  = <service_role key Dev/Test>
//
//  Dependency-frei (nutzt globales fetch / Node 18+ auf Vercel).
// ──────────────────────────────────────────────────────────────

const ENVS = {
  prod: {
    url:  'https://hinedxiclumqsvludqsl.supabase.co',
    anon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpbmVkeGljbHVtcXN2bHVkcXNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NTkzNjIsImV4cCI6MjA5NjEzNTM2Mn0.QGETFrPgGft2X-1YJlaueE4is0vXUHQ9PYt_n6tWlq4',
    serviceEnv: 'SUPABASE_SERVICE_KEY_PROD'
  },
  dev: {
    url:  'https://kuzxrwzydddykliunhvg.supabase.co',
    anon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1enhyd3p5ZGRkeWtsaXVuaHZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NDE0OTMsImV4cCI6MjA5NTQxNzQ5M30.dnIGUpCh2DvPbVi8r-iCdHXKaIIBz_6lbSGTR_ys57U',
    serviceEnv: 'SUPABASE_SERVICE_KEY_DEV'
  }
};

// Wer darf den Proxy benutzen?
const ADMIN_EMAILS = ['nils-er@gmx.de'];

// Welche Tabellen dürfen geschrieben werden?
// bets / extra_bets sind BEWUSST nicht erlaubt → fremde Tipps bleiben geschützt.
const ALLOWED_TABLES = ['matches', 'teams', 'players', 'profiles', 'extra_questions'];

module.exports = async (req, res) => {
  // CORS – Auth läuft über das JWT, daher ist der Origin unkritisch.
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();

  // Health-Check (zeigt nur, OB ein Key gesetzt ist – nicht den Key selbst)
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true, service: 'wm26-admin-proxy',
      keys: { prod: !!process.env.SUPABASE_SERVICE_KEY_PROD, dev: !!process.env.SUPABASE_SERVICE_KEY_DEV }
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Body lesen (Vercel parst JSON i.d.R. automatisch; Fallback inklusive)
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body) {
    body = await new Promise(r => { let d = ''; req.on('data', c => d += c); req.on('end', () => { try { r(JSON.parse(d)); } catch { r({}); } }); });
  }
  const { env, action, table, id, values } = body || {};

  const cfg = ENVS[env];
  if (!cfg) return res.status(400).json({ error: 'Ungültige Umgebung' });

  // 1) Token prüfen
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Kein Auth-Token' });

  let user;
  try {
    const uRes = await fetch(cfg.url + '/auth/v1/user', { headers: { apikey: cfg.anon, Authorization: 'Bearer ' + token } });
    if (!uRes.ok) return res.status(401).json({ error: 'Token ungültig oder abgelaufen' });
    user = await uRes.json();
  } catch (e) {
    return res.status(502).json({ error: 'Auth-Check fehlgeschlagen: ' + e.message });
  }
  if (!user || !user.email || !ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    return res.status(403).json({ error: 'Kein Admin-Zugriff für ' + (user && user.email || 'unbekannt') });
  }

  // 2) Service-Key holen
  const serviceKey = process.env[cfg.serviceEnv];
  if (!serviceKey) return res.status(500).json({ error: 'Service-Key fehlt – Vercel Env "' + cfg.serviceEnv + '" nicht gesetzt' });

  // 3) Aktion validieren
  if (!ALLOWED_TABLES.includes(table)) return res.status(400).json({ error: 'Tabelle nicht erlaubt: ' + table });

  let url = cfg.url + '/rest/v1/' + table;
  let method, payload;
  if (action === 'update') {
    if (id === undefined || id === null || id === '') return res.status(400).json({ error: 'id fehlt' });
    url += '?id=eq.' + encodeURIComponent(id); method = 'PATCH'; payload = JSON.stringify(values || {});
  } else if (action === 'insert') {
    method = 'POST'; payload = JSON.stringify(values || {});
  } else if (action === 'delete') {
    if (id === undefined || id === null || id === '') return res.status(400).json({ error: 'id fehlt' });
    url += '?id=eq.' + encodeURIComponent(id); method = 'DELETE';
  } else {
    return res.status(400).json({ error: 'Unbekannte Aktion: ' + action });
  }

  // 4) Mit service_role gegen PostgREST ausführen (umgeht RLS)
  try {
    const r = await fetch(url, {
      method,
      headers: {
        apikey: serviceKey,
        Authorization: 'Bearer ' + serviceKey,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: payload
    });
    const txt = await r.text();
    let data; try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
    if (!r.ok) return res.status(r.status).json({ error: (data && data.message) || ('DB-Fehler ' + r.status), details: data });
    return res.status(200).json({ data });
  } catch (e) {
    return res.status(502).json({ error: 'DB-Anfrage fehlgeschlagen: ' + e.message });
  }
};
