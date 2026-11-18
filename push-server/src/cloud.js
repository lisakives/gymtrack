/* GymTrack – käyttäjätilit ja automaattinen pilvivarmuuskopio
 *
 * Tietosuoja:
 *  - Salasana ja palautuskoodi eivät koskaan lähde laitteelta. Sovellus johtaa
 *    niistä PBKDF2:lla (150 000 kierrosta) kaksi avainta: kirjautumisavaimen,
 *    josta palvelin tallentaa vain suolatun SHA-256-tiivisteen, ja salausavaimen,
 *    joka ei lähde laitteelta.
 *  - Varmuuskopiot salataan laitteella (AES-256-GCM) satunnaisella tietoavaimella.
 *    Palvelin säilyttää vain salatun datan ja salasanalla/palautuskoodilla
 *    lukitut kopiot tietoavaimesta, joten se ei pysty lukemaan tietoja.
 *  - Sähköpostia tai muita henkilötietoja ei kysytä. Tilin voi poistaa
 *    sovelluksesta, jolloin myös kaikki varmuuskopiot poistetaan.
 *
 * Tili sitoo käyttäjänimen laitetunnisteeseen (users-taulun id + secret).
 * Kirjautuminen palauttaa tunnisteen, jolla varmuuskopiot ja muistutukset
 * kulkevat samalle käyttäjälle kaikilta laitteilta.
 *
 * Varmuuskopiot: yksi rivi päivää kohden (päivän viimeisin tila), 30 päivää.
 */

export const BACKUP_DAYS = 30;
export const MAX_BACKUP_BYTES = 1900000; // D1:n rivikoko on enintään 2 Mt
const MAX_WRAP = 512;
const MAX_FAILS = 8;
const LOCK_MS = 15 * 60 * 1000;

import { handleSso } from './sso.js';

const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

const cloudReady = new WeakSet();
export async function ensureCloudSchema(env) {
  if (cloudReady.has(env.DB)) return;
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS accounts (username TEXT PRIMARY KEY, user_id TEXT NOT NULL, pw_salt TEXT NOT NULL, pw_hash TEXT NOT NULL, rc_salt TEXT NOT NULL, rc_hash TEXT NOT NULL, pw_wrap TEXT NOT NULL, rc_wrap TEXT NOT NULL, created INTEGER, fails INTEGER DEFAULT 0, locked_until INTEGER DEFAULT 0)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS passkeys (cred_id TEXT PRIMARY KEY, username TEXT NOT NULL, public_key TEXT NOT NULL, alg INTEGER NOT NULL, counter INTEGER DEFAULT 0, prf_wrap TEXT NOT NULL, name TEXT, created INTEGER, last_used INTEGER)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS google_links (sub TEXT PRIMARY KEY, username TEXT NOT NULL, server_wrap TEXT NOT NULL, created INTEGER)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS challenges (id TEXT PRIMARY KEY, purpose TEXT NOT NULL, username TEXT, exp INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS backups (user_id TEXT NOT NULL, day TEXT NOT NULL, at INTEGER NOT NULL, hash TEXT, size INTEGER, data TEXT NOT NULL, PRIMARY KEY (user_id, day))')
  ]);
  cloudReady.add(env.DB);
}

export function cleanUsername(u) {
  const name = String(u || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(name)) {
    const e = new Error('Käyttäjänimessä saa olla 3–32 merkkiä: kirjaimia a–z, numeroita, piste, viiva tai alaviiva');
    e.status = 400; throw e;
  }
  return name;
}

export function cleanKey(k, what = 'Salasana') {
  const key = String(k || '');
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(key)) { const e = new Error(what + ' puuttuu tai on virheellinen'); e.status = 400; throw e; }
  return key;
}

export async function digest(salt, key) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(salt + ':' + key)));
}
export function cleanWrap(w) {
  const v = String(w || '');
  if (!/^[A-Za-z0-9_-]{40,512}$/.test(v) || v.length > MAX_WRAP) { const e = new Error('Salausavain puuttuu'); e.status = 400; throw e; }
  return v;
}

export function randomHex(n = 16) { return hex(crypto.getRandomValues(new Uint8Array(n))); }
export function randomToken(n) {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(n)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
/** Vakioaikainen vertailu */
function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function getAccount(env, username) {
  return env.DB.prepare('SELECT * FROM accounts WHERE username = ?').bind(username).first();
}

/** Tarkistaa salasanan (field='pw') tai palautuskoodin (field='rc'). Lukitsee tilin hetkeksi toistuvista virheistä. */
async function verify(env, username, key, field) {
  const acc = await getAccount(env, username);
  const now = Date.now();
  const fail = (msg, status = 401) => { const e = new Error(msg); e.status = status; return e; };
  if (!acc) {
    await digest('x', key); // sama työmäärä kuin oikealla tilillä
    throw fail(field === 'pw' ? 'Väärä käyttäjänimi tai salasana' : 'Väärä käyttäjänimi tai palautuskoodi');
  }
  if (acc.locked_until && acc.locked_until > now) {
    const min = Math.ceil((acc.locked_until - now) / 60000);
    throw fail(`Liian monta virheellistä yritystä. Yritä uudelleen ${min} minuutin kuluttua.`, 429);
  }
  const ok = same(await digest(acc[field + '_salt'], key), acc[field + '_hash']);
  if (!ok) {
    const fails = (acc.fails || 0) + 1;
    const lock = fails >= MAX_FAILS ? now + LOCK_MS : 0;
    await env.DB.prepare('UPDATE accounts SET fails = ?, locked_until = ? WHERE username = ?').bind(lock ? 0 : fails, lock, username).run();
    throw fail(field === 'pw' ? 'Väärä käyttäjänimi tai salasana' : 'Väärä käyttäjänimi tai palautuskoodi');
  }
  if (acc.fails || acc.locked_until) await env.DB.prepare('UPDATE accounts SET fails = 0, locked_until = 0 WHERE username = ?').bind(username).run();
  return acc;
}

export async function identityOf(env, acc) {
  const u = await env.DB.prepare('SELECT id, secret FROM users WHERE id = ?').bind(acc.user_id).first();
  return { userId: u.id, secret: u.secret, username: acc.username };
}

async function setPassword(env, username, pwKey, pwWrap) {
  const salt = randomHex();
  await env.DB.prepare('UPDATE accounts SET pw_salt = ?, pw_hash = ?, pw_wrap = ?, fails = 0, locked_until = 0 WHERE username = ?')
    .bind(salt, await digest(salt, pwKey), pwWrap, username).run();
}

function helsinkiDay(ms, tz) {
  try { return new Intl.DateTimeFormat('sv-SE', { timeZone: tz || 'Europe/Helsinki', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms)); }
  catch (e) { return new Date(ms).toISOString().slice(0, 10); }
}

/**
 * Käsittelee /api/account/* ja /api/backup/* -pyynnöt. Palauttaa vastausolion tai null, jos polku ei kuulu tänne.
 * auth(env, body, create) on index.js:n laitetunnistus.
 */
export async function handleCloud(path, body, env, auth) {
  if (path.startsWith('/api/passkey/') || path.startsWith('/api/google/')) {
    await ensureCloudSchema(env);
    return handleSso(path, body, env, auth);
  }
  if (!path.startsWith('/api/account/') && !path.startsWith('/api/backup/')) return null;
  await ensureCloudSchema(env);

  /* ----- Tilit ----- */
  if (path === '/api/account/register') {
    const username = cleanUsername(body.username);
    const pwKey = cleanKey(body.pwKey);
    const rcKey = cleanKey(body.recoveryKey, 'Palautuskoodi');
    const pwWrap = cleanWrap(body.pwWrap), rcWrap = cleanWrap(body.rcWrap);
    const user = await auth(env, body, true);
    if (await getAccount(env, username)) { const e = new Error('Käyttäjänimi on jo käytössä'); e.status = 409; throw e; }
    const taken = await env.DB.prepare('SELECT username FROM accounts WHERE user_id = ?').bind(user.id).first();
    if (taken) { const e = new Error('Tällä laitteella on jo tili (' + taken.username + ')'); e.status = 409; throw e; }
    const ps = randomHex(), rs = randomHex();
    await env.DB.prepare('INSERT INTO accounts (username, user_id, pw_salt, pw_hash, rc_salt, rc_hash, pw_wrap, rc_wrap, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(username, user.id, ps, await digest(ps, pwKey), rs, await digest(rs, rcKey), pwWrap, rcWrap, Date.now()).run();
    return { ok: true, username };
  }

  if (path === '/api/account/available') {
    let username;
    try { username = cleanUsername(body.username); } catch (e) { return { ok: true, available: false, reason: e.message }; }
    return { ok: true, available: !(await getAccount(env, username)), username };
  }

  if (path === '/api/account/login') {
    const username = cleanUsername(body.username);
    const acc = await verify(env, username, cleanKey(body.pwKey), 'pw');
    return { ok: true, ...(await identityOf(env, acc)), wrap: acc.pw_wrap };
  }

  if (path === '/api/account/password') {
    const username = cleanUsername(body.username);
    await verify(env, username, cleanKey(body.pwKey), 'pw');
    await setPassword(env, username, cleanKey(body.newPwKey, 'Uusi salasana'), cleanWrap(body.newPwWrap));
    return { ok: true };
  }

  // Unohtunut salasana, vaihe 1: palautuskoodilla saadaan lukittu tietoavain, jotta se voidaan lukita uudella salasanalla
  if (path === '/api/account/recover') {
    const username = cleanUsername(body.username);
    const acc = await verify(env, username, cleanKey(body.recoveryKey, 'Palautuskoodi'), 'rc');
    return { ok: true, wrap: acc.rc_wrap };
  }

  if (path === '/api/account/reset') {
    const username = cleanUsername(body.username);
    const acc = await verify(env, username, cleanKey(body.recoveryKey, 'Palautuskoodi'), 'rc');
    await setPassword(env, username, cleanKey(body.newPwKey, 'Uusi salasana'), cleanWrap(body.newPwWrap));
    // Vaihdetaan laitesalaisuus, jolloin muut kirjautuneet laitteet joutuvat kirjautumaan uudelleen
    const secret = randomToken(24);
    await env.DB.prepare('UPDATE users SET secret = ? WHERE id = ?').bind(secret, acc.user_id).run();
    return { ok: true, userId: acc.user_id, secret, username, wrap: body.newPwWrap };
  }

  if (path === '/api/account/delete') {
    // Vahvistus salasanalla tai (Google-/Face ID -tileillä) kirjautuneen laitteen tunnisteella
    let acc;
    if (body.pwKey) acc = await verify(env, cleanUsername(body.username), cleanKey(body.pwKey), 'pw');
    else {
      const user = await auth(env, body);
      acc = await env.DB.prepare('SELECT * FROM accounts WHERE user_id = ?').bind(user.id).first();
      if (!acc) { const e = new Error('Tiliä ei löytynyt'); e.status = 404; throw e; }
    }
    const username = acc.username;
    await env.DB.batch([
      env.DB.prepare('DELETE FROM backups WHERE user_id = ?').bind(acc.user_id),
      env.DB.prepare('DELETE FROM passkeys WHERE username = ?').bind(username),
      env.DB.prepare('DELETE FROM google_links WHERE username = ?').bind(username),
      env.DB.prepare('DELETE FROM accounts WHERE username = ?').bind(username)
    ]);
    return { ok: true };
  }

  /* ----- Varmuuskopiot (laitetunnisteella) ----- */
  const user = await auth(env, body);

  if (path === '/api/backup/put') {
    // data on laitteella pakattu ja salattu (base64url), palvelin ei näe sisältöä
    const data = String(body.data || '');
    if (!/^[A-Za-z0-9_-]+$/.test(data)) { const e = new Error('Varmuuskopio puuttuu tai on virheellinen'); e.status = 400; throw e; }
    if (data.length > MAX_BACKUP_BYTES) { const e = new Error('Varmuuskopio on liian suuri'); e.status = 413; throw e; }
    const now = Date.now();
    const tz = user.data && user.data.tz;
    const day = helsinkiDay(now, tz);
    const hash = String(body.hash || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
    await env.DB.prepare('INSERT INTO backups (user_id, day, at, hash, size, data) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, day) DO UPDATE SET at = excluded.at, hash = excluded.hash, size = excluded.size, data = excluded.data')
      .bind(user.id, day, now, hash, data.length, data).run();
    const cutoff = helsinkiDay(now - BACKUP_DAYS * 86400000, tz);
    await env.DB.prepare('DELETE FROM backups WHERE user_id = ? AND day < ?').bind(user.id, cutoff).run();
    return { ok: true, at: now, day, hash };
  }

  if (path === '/api/backup/head') {
    const row = await env.DB.prepare('SELECT day, at, hash, size FROM backups WHERE user_id = ? ORDER BY at DESC LIMIT 1').bind(user.id).first();
    return { ok: true, latest: row || null };
  }

  if (path === '/api/backup/list') {
    const rows = await env.DB.prepare('SELECT day, at, hash, size FROM backups WHERE user_id = ? ORDER BY at DESC').bind(user.id).all();
    return { ok: true, backups: rows.results || [] };
  }

  if (path === '/api/backup/get') {
    const row = body.day
      ? await env.DB.prepare('SELECT * FROM backups WHERE user_id = ? AND day = ?').bind(user.id, String(body.day)).first()
      : await env.DB.prepare('SELECT * FROM backups WHERE user_id = ? ORDER BY at DESC LIMIT 1').bind(user.id).first();
    if (!row) { const e = new Error('Varmuuskopiota ei löytynyt'); e.status = 404; throw e; }
    return { ok: true, day: row.day, at: row.at, hash: row.hash, data: row.data };
  }

  return { error: 'Not found', status: 404 };
}
