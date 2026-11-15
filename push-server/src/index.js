/* GymTrack – push-palvelin (Cloudflare Worker + D1 + Cron Trigger)
 *
 * Tehtävät:
 *  - säilyttää laitteiden Web Push -tilaukset (D1-tietokanta)
 *  - säilyttää käyttäjän muistutusajat, aikavyöhykkeen ja päivän tilan
 *  - lähettää muistutukset ajastetusti (Cron joka minuutti) myös silloin,
 *    kun sovellus on suljettu
 *  - torkut ja testi-ilmoitukset (kertaluonteiset ilmoitukset)
 *
 * Ei ulkoisia riippuvuuksia: VAPID-allekirjoitus (ES256) ja viestin salaus
 * (RFC 8291, aes128gcm) on toteutettu WebCrypto-rajapinnalla.
 * VAPID-avaimet luodaan automaattisesti ensimmäisellä käyttökerralla ja
 * tallennetaan tietokantaan.
 */

const enc = new TextEncoder();

/* ---------------- base64url ---------------- */
export function b64u(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function unb64u(str) {
  str = String(str).replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function concat(...arrs) {
  const len = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}

/* ---------------- RFC 8291: viestin salaus ---------------- */
async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8);
  return new Uint8Array(bits);
}

/**
 * Salaa push-viestin vastaanottajan avaimilla.
 * opts.salt ja opts.asKeyPair vain testejä varten (RFC 8291 -testivektori).
 */
export async function encryptPayload(plaintext, p256dhB64, authB64, opts = {}) {
  const uaPublic = unb64u(p256dhB64);
  const authSecret = unb64u(authB64);
  const asKeys = opts.asKeyPair || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256));

  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, shared, keyInfo, 32);
  const salt = opts.salt || crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const data = typeof plaintext === 'string' ? enc.encode(plaintext) : plaintext;
  const padded = concat(data, new Uint8Array([2])); // viimeisen tietueen erotin
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, padded));

  const rs = new Uint8Array([0, 0, 0x10, 0]); // 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ct);
}

/* ---------------- VAPID ---------------- */
async function getVapid(env) {
  await ensureSchema(env);
  const row = await env.DB.prepare('SELECT v FROM meta WHERE k = ?').bind('vapid').first();
  if (row) return JSON.parse(row.v);
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const priv = await crypto.subtle.exportKey('jwk', kp.privateKey);
  const pubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const v = { privateJwk: priv, publicKey: b64u(pubRaw) };
  // INSERT OR IGNORE: jos kaksi pyyntöä luo avaimet yhtä aikaa, ensimmäinen voittaa
  await env.DB.prepare('INSERT OR IGNORE INTO meta (k, v) VALUES (?, ?)').bind('vapid', JSON.stringify(v)).run();
  const again = await env.DB.prepare('SELECT v FROM meta WHERE k = ?').bind('vapid').first();
  return JSON.parse(again.v);
}

export async function vapidAuthHeader(endpoint, vapid, subject) {
  const aud = new URL(endpoint).origin;
  const header = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const key = await crypto.subtle.importKey('jwk', vapid.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(header + '.' + claims)));
  return `vapid t=${header}.${claims}.${b64u(sig)}, k=${vapid.publicKey}`;
}

/** Lähettää yhden push-viestin. Palauttaa { ok, status, gone }. */
export async function sendPush(env, sub, payload, vapid) {
  vapid = vapid || await getVapid(env);
  const body = await encryptPayload(JSON.stringify(payload), sub.keys.p256dh, sub.keys.auth);
  const subject = env.VAPID_SUBJECT || 'https://github.com/lisakives/gymtrack';
  let res;
  try {
    res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        Authorization: await vapidAuthHeader(sub.endpoint, vapid, subject),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: '7200',
        Urgency: 'high',
        Topic: (payload.tag || 'gymtrack').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || 'gymtrack'
      },
      body
    });
  } catch (e) {
    return { ok: false, status: 0, error: String(e) };
  }
  const gone = res.status === 404 || res.status === 410;
  let text = '';
  if (!res.ok) { try { text = (await res.text()).slice(0, 300); } catch (e) { /* */ } }
  return { ok: res.ok, status: res.status, gone, error: text };
}

/* ---------------- Tietokanta ---------------- */
const schemaReady = new WeakSet();
async function ensureSchema(env) {
  if (schemaReady.has(env.DB)) return;
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, secret TEXT NOT NULL, data TEXT NOT NULL, updated INTEGER)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS subs (endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL, keys TEXT NOT NULL, ua TEXT, created INTEGER, last_ok INTEGER, last_error TEXT)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS sent (k TEXT PRIMARY KEY, at INTEGER)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS log (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER, user_id TEXT, title TEXT, status INTEGER, info TEXT)')
  ]);
  schemaReady.add(env.DB);
}

async function getUser(env, id) {
  const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  if (!row) return null;
  return { id: row.id, secret: row.secret, data: JSON.parse(row.data || '{}') };
}
async function saveUserData(env, id, data) {
  await env.DB.prepare('UPDATE users SET data = ?, updated = ? WHERE id = ?').bind(JSON.stringify(data), Date.now(), id).run();
}

/** Tunnistautuminen: laite luo itse satunnaisen id:n ja salaisuuden. */
async function auth(env, body, create = false) {
  const id = String(body.userId || '');
  const secret = String(body.secret || '');
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(id) || secret.length < 24) throw httpError(400, 'Virheellinen tunniste');
  if (env.APP_KEY && body.appKey !== env.APP_KEY) throw httpError(403, 'Väärä sovellusavain');
  let user = await getUser(env, id);
  if (!user) {
    if (!create) throw httpError(404, 'Laitetta ei ole rekisteröity');
    const data = { tz: 'Europe/Helsinki', reminders: [], oneoffs: [], done: {}, summary: null };
    await env.DB.prepare('INSERT INTO users (id, secret, data, updated) VALUES (?, ?, ?, ?)').bind(id, secret, JSON.stringify(data), Date.now()).run();
    user = { id, secret, data };
  }
  if (user.secret !== secret) throw httpError(403, 'Väärä salaisuus');
  return user;
}

function httpError(status, message) { const e = new Error(message); e.status = status; return e; }

/* ---------------- Aikalaskenta ---------------- */
const WEEKDAYS = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
const fmtCache = new Map();
/** Paikallinen aika annetulla aikavyöhykkeellä: { date: 'YYYY-MM-DD', hm: 'HH:MM', wd: 0–6 (ma=0) } */
export function localParts(ms, tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' });
    } catch (e) {
      f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Helsinki', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' });
    }
    fmtCache.set(tz, f);
  }
  const p = {};
  for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value;
  return { date: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}`, wd: WEEKDAYS[p.weekday] };
}

/** Rakentaa ilmoituksen tekstin. Yhteenvetomuistutus käyttää sovelluksen lähettämiä päivän lukuja. */
export function buildBody(rem, data, date) {
  let body = rem.body || '';
  const s = data.summary;
  if (rem.kind === 'summary' || /\{(kcal|protein|tasks)\}/.test(body)) {
    if (s && s.date === date) {
      const kcal = Math.round(s.kcal || 0), protein = Math.round(s.protein || 0);
      const line = `Tänään ${kcal}${s.goalKcal ? ' / ' + s.goalKcal : ''} kcal, proteiinia ${protein}${s.goalProtein ? ' / ' + s.goalProtein : ''} g` +
        (s.tasksTotal ? `, tehtäviä ${s.tasksDone}/${s.tasksTotal}` : '') + '.';
      body = body.replace('{kcal}', kcal).replace('{protein}', protein).replace('{tasks}', `${s.tasksDone || 0}/${s.tasksTotal || 0}`);
      if (rem.kind === 'summary') body = line + (body ? ' ' + body : '');
    } else if (rem.kind === 'summary') {
      body = 'Et ole vielä kirjannut tämän päivän ruokailuja. Lisää ne nyt, niin yhteenveto pysyy ajan tasalla.';
    }
  }
  return body;
}

/** Muistutukset, joiden aika osuu välille (fromMs, toMs]. */
export function dueReminders(data, fromMs, toMs) {
  const out = [];
  const tz = data.tz || 'Europe/Helsinki';
  const start = Math.floor(fromMs / 60000) + 1;
  const end = Math.floor(toMs / 60000);
  for (let m = Math.max(start, end - 15); m <= end; m++) {
    const lp = localParts(m * 60000, tz);
    for (const r of data.reminders || []) {
      if (!r || r.enabled === false || r.notify === false) continue;
      if (r.time !== lp.hm) continue;
      if (Array.isArray(r.days) && r.days.length && !r.days.includes(lp.wd)) continue;
      const doneToday = data.done && data.done[lp.date];
      if (doneToday && doneToday.includes(r.id)) continue;
      out.push({ key: `${r.id}|${lp.date}|${lp.hm}`, rem: r, date: lp.date });
    }
  }
  return out;
}

/* ---------------- Ajastettu lähetys ---------------- */
async function sendToUser(env, userId, payload, vapid) {
  const subs = await env.DB.prepare('SELECT * FROM subs WHERE user_id = ?').bind(userId).all();
  const results = [];
  for (const row of subs.results || []) {
    const sub = { endpoint: row.endpoint, keys: JSON.parse(row.keys) };
    const r = await sendPush(env, sub, payload, vapid);
    results.push(r);
    if (r.gone) await env.DB.prepare('DELETE FROM subs WHERE endpoint = ?').bind(row.endpoint).run();
    else if (r.ok) await env.DB.prepare('UPDATE subs SET last_ok = ?, last_error = NULL WHERE endpoint = ?').bind(Date.now(), row.endpoint).run();
    else await env.DB.prepare('UPDATE subs SET last_error = ? WHERE endpoint = ?').bind(`${r.status} ${r.error || ''}`.slice(0, 300), row.endpoint).run();
  }
  const okCount = results.filter(r => r.ok).length;
  await env.DB.prepare('INSERT INTO log (at, user_id, title, status, info) VALUES (?, ?, ?, ?, ?)')
    .bind(Date.now(), userId, payload.title, okCount, results.map(r => r.status).join(',')).run();
  return { sent: okCount, total: results.length, results };
}

export async function runSchedule(env, nowMs = Date.now()) {
  await ensureSchema(env);
  const last = await env.DB.prepare('SELECT v FROM meta WHERE k = ?').bind('lastRun').first();
  // Edellisestä ajosta eteenpäin (enintään 15 min taaksepäin), jottei mikään jää väliin
  const from = last ? Math.max(+last.v, nowMs - 15 * 60000) : nowMs - 60000;
  await env.DB.prepare('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind('lastRun', String(nowMs)).run();

  const users = await env.DB.prepare('SELECT id, data FROM users WHERE id IN (SELECT DISTINCT user_id FROM subs)').all();
  let vapid = null;
  let sentCount = 0;
  for (const u of users.results || []) {
    const data = JSON.parse(u.data || '{}');
    const jobs = [];
    dueReminders(data, from, nowMs).forEach(d => jobs.push({
      key: `${u.id}|${d.key}`,
      payload: { title: d.rem.title || 'Muistutus', body: buildBody(d.rem, data, d.date), tag: d.rem.id, rid: d.rem.id, date: d.date, url: `./index.html#/today?r=${encodeURIComponent(d.rem.id)}` }
    }));
    // Torkut ja testit
    const oneoffs = data.oneoffs || [];
    const dueOne = oneoffs.filter(o => o.at <= nowMs);
    if (dueOne.length) {
      dueOne.forEach(o => jobs.push({
        key: `${u.id}|one|${o.id}`,
        payload: { title: o.title || 'Muistutus', body: o.body || '', tag: o.rid || o.id, rid: o.rid || null, date: localParts(nowMs, data.tz).date, url: o.rid ? `./index.html#/today?r=${encodeURIComponent(o.rid)}` : './index.html#/today' }
      }));
      data.oneoffs = oneoffs.filter(o => o.at > nowMs);
      await saveUserData(env, u.id, data);
    }
    for (const job of jobs) {
      const ins = await env.DB.prepare('INSERT OR IGNORE INTO sent (k, at) VALUES (?, ?)').bind(job.key, nowMs).run();
      if (!ins.meta || ins.meta.changes === 0) continue; // lähetetty jo
      vapid = vapid || await getVapid(env);
      const r = await sendToUser(env, u.id, job.payload, vapid);
      sentCount += r.sent;
    }
  }
  // Siivous kerran tunnissa
  if (new Date(nowMs).getUTCMinutes() === 0) {
    await env.DB.prepare('DELETE FROM sent WHERE at < ?').bind(nowMs - 3 * 86400000).run();
    await env.DB.prepare('DELETE FROM log WHERE at < ?').bind(nowMs - 14 * 86400000).run();
  }
  return { from, to: nowMs, sent: sentCount };
}

/* ---------------- HTTP-rajapinta ---------------- */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS } });

function cleanReminders(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 50).map(r => ({
    id: String(r.id || '').slice(0, 40),
    time: /^\d{2}:\d{2}$/.test(r.time) ? r.time : '09:00',
    title: String(r.title || 'Muistutus').slice(0, 80),
    body: String(r.body || '').slice(0, 240),
    days: Array.isArray(r.days) ? r.days.filter(d => Number.isInteger(d) && d >= 0 && d <= 6) : [],
    enabled: r.enabled !== false,
    notify: r.notify !== false,
    kind: r.kind ? String(r.kind).slice(0, 20) : undefined
  })).filter(r => r.id);
}

async function handle(request, env) {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (request.method === 'GET' && (path === '/' || path === '/api/health')) {
    await ensureSchema(env);
    const last = await env.DB.prepare('SELECT v FROM meta WHERE k = ?').bind('lastRun').first();
    return json({ ok: true, app: 'gymtrack-push', lastRun: last ? +last.v : null, now: Date.now() });
  }
  if (request.method === 'GET' && path === '/api/vapid') {
    const v = await getVapid(env);
    return json({ publicKey: v.publicKey });
  }
  if (request.method !== 'POST') return json({ error: 'Not found' }, 404);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'Virheellinen JSON' }, 400); }
  await ensureSchema(env);

  if (path === '/api/subscribe') {
    const user = await auth(env, body, true);
    const sub = body.subscription;
    if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
      return json({ error: 'Virheellinen tilaus' }, 400);
    }
    await env.DB.prepare('INSERT INTO subs (endpoint, user_id, keys, ua, created) VALUES (?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, keys = excluded.keys, ua = excluded.ua')
      .bind(sub.endpoint, user.id, JSON.stringify({ p256dh: sub.keys.p256dh, auth: sub.keys.auth }), String(body.ua || '').slice(0, 200), Date.now()).run();
    if (body.state) await applySync(env, user, body.state);
    return json({ ok: true });
  }

  if (path === '/api/unsubscribe') {
    const user = await auth(env, body);
    if (body.endpoint) await env.DB.prepare('DELETE FROM subs WHERE endpoint = ? AND user_id = ?').bind(body.endpoint, user.id).run();
    return json({ ok: true });
  }

  if (path === '/api/sync') {
    const user = await auth(env, body, true);
    await applySync(env, user, body.state || {});
    const subs = await env.DB.prepare('SELECT COUNT(*) AS n FROM subs WHERE user_id = ?').bind(user.id).first();
    return json({ ok: true, subscriptions: subs ? subs.n : 0 });
  }

  if (path === '/api/snooze') {
    const user = await auth(env, body);
    const minutes = Math.max(1, Math.min(24 * 60, Math.round(+body.minutes || 10)));
    const data = user.data;
    data.oneoffs = (data.oneoffs || []).filter(o => !(body.rid && o.rid === body.rid)).slice(-30);
    const at = Date.now() + minutes * 60000;
    data.oneoffs.push({ id: 'snz_' + Date.now().toString(36), rid: body.rid ? String(body.rid).slice(0, 40) : null, at, title: String(body.title || 'Muistutus').slice(0, 80), body: String(body.body || 'Torkutettu muistutus').slice(0, 240) });
    await saveUserData(env, user.id, data);
    return json({ ok: true, at });
  }

  if (path === '/api/cancel') {
    const user = await auth(env, body);
    const data = user.data;
    data.oneoffs = (data.oneoffs || []).filter(o => o.rid !== body.rid);
    await saveUserData(env, user.id, data);
    return json({ ok: true });
  }

  if (path === '/api/test') {
    const user = await auth(env, body);
    const delay = Math.max(0, Math.min(3600, Math.round(+body.delaySeconds || 0)));
    if (delay > 0) {
      const data = user.data;
      data.oneoffs = (data.oneoffs || []).slice(-30);
      const at = Date.now() + delay * 1000;
      data.oneoffs.push({ id: 'test_' + Date.now().toString(36), at, title: 'GymTrack-testi', body: 'Tämä ilmoitus lähetettiin palvelimelta ajastettuna. Ilmoitukset toimivat myös sovelluksen ollessa suljettuna.' });
      await saveUserData(env, user.id, data);
      return json({ ok: true, scheduledAt: at });
    }
    const r = await sendToUser(env, user.id, { title: 'GymTrack-testi', body: 'Push-ilmoitukset toimivat tällä laitteella.', tag: 'test', url: './index.html#/today' });
    return json({ ok: r.sent > 0, ...r });
  }

  if (path === '/api/status') {
    const user = await auth(env, body);
    const subs = await env.DB.prepare('SELECT endpoint, created, last_ok, last_error FROM subs WHERE user_id = ?').bind(user.id).all();
    const log = await env.DB.prepare('SELECT at, title, status, info FROM log WHERE user_id = ? ORDER BY id DESC LIMIT 10').bind(user.id).all();
    const last = await env.DB.prepare('SELECT v FROM meta WHERE k = ?').bind('lastRun').first();
    return json({
      ok: true,
      lastRun: last ? +last.v : null,
      subscriptions: (subs.results || []).map(s => ({ host: new URL(s.endpoint).host, created: s.created, lastOk: s.last_ok, lastError: s.last_error })),
      log: log.results || [],
      pending: (user.data.oneoffs || []).map(o => ({ at: o.at, title: o.title }))
    });
  }

  return json({ error: 'Not found' }, 404);
}

async function applySync(env, user, state) {
  const data = user.data;
  if (state.tz && typeof state.tz === 'string') data.tz = state.tz.slice(0, 64);
  if (state.reminders) data.reminders = cleanReminders(state.reminders);
  if (state.done && typeof state.done === 'object') {
    const done = {};
    Object.keys(state.done).slice(-3).forEach(d => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(d) && Array.isArray(state.done[d])) done[d] = state.done[d].slice(0, 60).map(String);
    });
    data.done = done;
    // Tehdyksi merkityn muistutuksen torkku perutaan
    const today = Object.values(done).flat();
    data.oneoffs = (data.oneoffs || []).filter(o => !o.rid || !today.includes(o.rid) || o.id.startsWith('test_'));
  }
  if (state.summary && typeof state.summary === 'object') {
    const s = state.summary;
    data.summary = {
      date: String(s.date || '').slice(0, 10),
      kcal: +s.kcal || 0, protein: +s.protein || 0,
      goalKcal: +s.goalKcal || 0, goalProtein: +s.goalProtein || 0,
      tasksDone: +s.tasksDone || 0, tasksTotal: +s.tasksTotal || 0
    };
  }
  await saveUserData(env, user.id, data);
}

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (e) {
      return json({ error: e.message || 'Virhe' }, e.status || 500);
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runSchedule(env, event.scheduledTime || Date.now()));
  }
};
