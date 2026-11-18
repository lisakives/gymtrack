/* GymTrack – pikakirjautuminen: Face ID (pääsyavain / WebAuthn) ja Google
 *
 * Face ID:
 *  - Pääsyavain luodaan puhelimessa (iCloud-avainnippu synkronoi sen muille
 *    Apple-laitteille). Palvelin tallentaa vain julkisen avaimen.
 *  - Salaus säilyy päästä päähän: pääsyavaimen PRF-laajennus antaa puhelimessa
 *    salaisen arvon, jolla tietoavain lukitaan. Palvelin ei näe sitä.
 *
 * Google:
 *  - Sovellus saa Googlelta allekirjoitetun ID-tunnisteen, jonka palvelin
 *    tarkistaa Googlen julkisilla avaimilla. Palvelin tallentaa vain Googlen
 *    tunnisteen (sub), ei sähköpostia eikä nimeä.
 *  - Koska Google-kirjautumisessa ei ole salasanaa, josta salausavain voitaisiin
 *    johtaa, tietoavain säilytetään palvelimella palvelimen omalla avaimella
 *    lukittuna. Tällöin palvelin pystyy teknisesti avaamaan varmuuskopion.
 *    Sovellus kertoo tämän käyttäjälle ennen Google-kirjautumisen käyttöönottoa.
 */
import { cleanUsername, randomHex, randomToken, digest, getAccount, identityOf, cleanWrap, cleanKey } from './cloud.js';

const enc = new TextEncoder(), dec = new TextDecoder();
const CHALLENGE_MS = 5 * 60 * 1000;

const b64u = buf => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64u = s => { s = String(s || '').replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
const err = (status, msg) => { const e = new Error(msg); e.status = status; return e; };
const sha256 = async bytes => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));

function allowedOrigins(env) {
  return String(env.APP_ORIGINS || 'https://lisakives.github.io').split(',').map(s => s.trim()).filter(Boolean);
}

async function accountByUser(env, userId) {
  const acc = await env.DB.prepare('SELECT * FROM accounts WHERE user_id = ?').bind(userId).first();
  if (!acc) throw err(404, 'Kirjaudu ensin tilillesi');
  return acc;
}

/* ---------- Haasteet ---------- */
async function newChallenge(env, purpose, username = null) {
  const id = randomToken(32);
  const now = Date.now();
  await env.DB.prepare('DELETE FROM challenges WHERE exp < ?').bind(now).run();
  await env.DB.prepare('INSERT INTO challenges (id, purpose, username, exp) VALUES (?, ?, ?, ?)').bind(id, purpose, username, now + CHALLENGE_MS).run();
  return id;
}
async function useChallenge(env, id, purpose) {
  const row = await env.DB.prepare('SELECT * FROM challenges WHERE id = ? AND purpose = ?').bind(String(id || ''), purpose).first();
  if (!row) throw err(400, 'Kirjautumisyritys vanheni. Yritä uudelleen.');
  await env.DB.prepare('DELETE FROM challenges WHERE id = ?').bind(row.id).run();
  if (row.exp < Date.now()) throw err(400, 'Kirjautumisyritys vanheni. Yritä uudelleen.');
  return row;
}

/* ---------- WebAuthn ---------- */
function parseClientData(env, b64, type) {
  let cd;
  try { cd = JSON.parse(dec.decode(unb64u(b64))); } catch (e) { throw err(400, 'Virheellinen pääsyavainvastaus'); }
  if (cd.type !== type) throw err(400, 'Virheellinen pääsyavainvastaus');
  if (!allowedOrigins(env).includes(cd.origin)) throw err(403, 'Pääsyavain on luotu toiselle sivustolle');
  return cd;
}

/** ECDSA-allekirjoitus DER-muodosta WebCryptoa varten (r || s, 64 tavua). */
export function derToRaw(der) {
  if (der[0] !== 0x30) return der;
  let i = 2;
  if (der[1] & 0x80) i = 2 + (der[1] & 0x7f);
  const read = () => {
    if (der[i] !== 0x02) throw err(400, 'Virheellinen allekirjoitus');
    const len = der[i + 1];
    let v = der.slice(i + 2, i + 2 + len);
    i += 2 + len;
    while (v.length > 32 && v[0] === 0) v = v.slice(1);
    const out = new Uint8Array(32); out.set(v, 32 - v.length);
    return out;
  };
  const r = read(), s = read();
  const raw = new Uint8Array(64); raw.set(r); raw.set(s, 32);
  return raw;
}

async function importPublicKey(spkiB64, alg) {
  const spki = unb64u(spkiB64);
  if (alg === -7) return crypto.subtle.importKey('spki', spki, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  if (alg === -257) return crypto.subtle.importKey('spki', spki, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  throw err(400, 'Pääsyavaimen algoritmia ei tueta');
}

async function verifyAssertion(env, pk, body, cd) {
  const authData = unb64u(body.authenticatorData);
  if (authData.length < 37) throw err(400, 'Virheellinen pääsyavainvastaus');
  const rpId = new URL(cd.origin).hostname;
  const rpHash = await sha256(enc.encode(rpId));
  for (let i = 0; i < 32; i++) if (authData[i] !== rpHash[i]) throw err(403, 'Pääsyavain on luotu toiselle sivustolle');
  const flags = authData[32];
  if (!(flags & 0x01) || !(flags & 0x04)) throw err(403, 'Face ID -tunnistus vaaditaan');
  const counter = (authData[33] << 24 | authData[34] << 16 | authData[35] << 8 | authData[36]) >>> 0;
  const signed = new Uint8Array(authData.length + 32);
  signed.set(authData); signed.set(await sha256(unb64u(body.clientDataJSON)), authData.length);
  const key = await importPublicKey(pk.public_key, pk.alg);
  let sig = unb64u(body.signature);
  const algo = pk.alg === -7 ? { name: 'ECDSA', hash: 'SHA-256' } : { name: 'RSASSA-PKCS1-v1_5' };
  if (pk.alg === -7) sig = derToRaw(sig);
  const ok = await crypto.subtle.verify(algo, key, sig, signed);
  if (!ok) throw err(403, 'Pääsyavaimen tarkistus epäonnistui');
  if (counter && pk.counter && counter <= pk.counter) throw err(403, 'Pääsyavaimen laskuri ei kelpaa');
  return counter;
}

/* ---------- Google ---------- */
let jwksCache = null;
async function googleKeys(env, refresh) {
  if (!refresh && jwksCache && jwksCache.exp > Date.now()) return jwksCache.keys;
  const res = await fetch(env.GOOGLE_JWKS_URL || 'https://www.googleapis.com/oauth2/v3/certs');
  if (!res.ok) throw err(502, 'Googlen avainten haku epäonnistui');
  const keys = (await res.json()).keys || [];
  jwksCache = { keys, exp: Date.now() + 3600 * 1000 };
  return keys;
}

export async function verifyGoogleToken(env, token) {
  if (!env.GOOGLE_CLIENT_ID) throw err(503, 'Google-kirjautumista ei ole vielä otettu käyttöön');
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw err(400, 'Virheellinen Google-tunniste');
  let header, claims;
  try { header = JSON.parse(dec.decode(unb64u(parts[0]))); claims = JSON.parse(dec.decode(unb64u(parts[1]))); }
  catch (e) { throw err(400, 'Virheellinen Google-tunniste'); }
  if (header.alg !== 'RS256') throw err(400, 'Virheellinen Google-tunniste');
  let jwk = (await googleKeys(env)).find(k => k.kid === header.kid);
  if (!jwk) jwk = (await googleKeys(env, true)).find(k => k.kid === header.kid);
  if (!jwk) throw err(403, 'Google-tunnisteen avainta ei löytynyt');
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, unb64u(parts[2]), enc.encode(parts[0] + '.' + parts[1]));
  if (!ok) throw err(403, 'Google-tunnisteen allekirjoitus ei kelpaa');
  const now = Date.now() / 1000;
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss)) throw err(403, 'Google-tunnisteen myöntäjä ei kelpaa');
  const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!auds.includes(env.GOOGLE_CLIENT_ID)) throw err(403, 'Google-tunniste on tehty toiselle sovellukselle');
  if (!(claims.exp > now - 60)) throw err(403, 'Google-tunniste on vanhentunut');
  if (!claims.sub) throw err(400, 'Virheellinen Google-tunniste');
  return claims;
}

/** Palvelimen oma avain Google-tilien tietoavaimen lukitsemiseen (ympäristömuuttuja tai luodaan kerran). */
async function serverKey(env) {
  let raw = env.SERVER_WRAP_KEY;
  if (!raw) {
    const row = await env.DB.prepare('SELECT v FROM meta WHERE k = ?').bind('serverWrapKey').first();
    if (row) raw = row.v;
    else {
      raw = b64u(crypto.getRandomValues(new Uint8Array(32)));
      await env.DB.prepare('INSERT OR IGNORE INTO meta (k, v) VALUES (?, ?)').bind('serverWrapKey', raw).run();
      raw = (await env.DB.prepare('SELECT v FROM meta WHERE k = ?').bind('serverWrapKey').first()).v;
    }
  }
  return crypto.subtle.importKey('raw', unb64u(raw), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function serverWrap(env, dek) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await serverKey(env), dek));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return b64u(out);
}
async function serverUnwrap(env, w) {
  const all = unb64u(w);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12) }, await serverKey(env), all.slice(12)));
}
function cleanDek(d) {
  const raw = unb64u(d);
  if (raw.length !== 32) throw err(400, 'Virheellinen tietoavain');
  return raw;
}

/* ---------- Reitit ---------- */
export async function handleSso(path, body, env, auth) {
  /* Face ID */
  if (path === '/api/passkey/challenge') {
    const purpose = body.purpose === 'register' ? 'register' : 'login';
    let username = null;
    if (purpose === 'register') username = (await accountByUser(env, (await auth(env, body)).id)).username;
    return { ok: true, challenge: await newChallenge(env, purpose, username), username };
  }

  if (path === '/api/passkey/register') {
    const user = await auth(env, body);
    const acc = await accountByUser(env, user.id);
    const cd = parseClientData(env, body.clientDataJSON, 'webauthn.create');
    const ch = await useChallenge(env, cd.challenge, 'register');
    if (ch.username !== acc.username) throw err(403, 'Haaste ei kuulu tälle tilille');
    const alg = +body.alg;
    await importPublicKey(String(body.publicKey || ''), alg);
    const credId = String(body.credId || '');
    if (!/^[A-Za-z0-9_-]{16,1400}$/.test(credId)) throw err(400, 'Virheellinen pääsyavain');
    await env.DB.prepare('INSERT INTO passkeys (cred_id, username, public_key, alg, counter, prf_wrap, name, created) VALUES (?, ?, ?, ?, 0, ?, ?, ?) ON CONFLICT(cred_id) DO UPDATE SET public_key = excluded.public_key, alg = excluded.alg, prf_wrap = excluded.prf_wrap, username = excluded.username')
      .bind(credId, acc.username, String(body.publicKey), alg, cleanWrap(body.prfWrap), String(body.name || 'Face ID').slice(0, 60), Date.now()).run();
    return { ok: true };
  }

  if (path === '/api/passkey/login') {
    const cd = parseClientData(env, body.clientDataJSON, 'webauthn.get');
    await useChallenge(env, cd.challenge, 'login');
    const pk = await env.DB.prepare('SELECT * FROM passkeys WHERE cred_id = ?').bind(String(body.credId || '')).first();
    if (!pk) throw err(404, 'Tätä pääsyavainta ei löydy. Kirjaudu salasanalla ja ota Face ID uudelleen käyttöön.');
    const counter = await verifyAssertion(env, pk, body, cd);
    await env.DB.prepare('UPDATE passkeys SET counter = ?, last_used = ? WHERE cred_id = ?').bind(counter, Date.now(), pk.cred_id).run();
    const acc = await getAccount(env, pk.username);
    if (!acc) throw err(404, 'Tiliä ei löytynyt');
    return { ok: true, ...(await identityOf(env, acc)), wrap: pk.prf_wrap };
  }

  if (path === '/api/passkey/list') {
    const acc = await accountByUser(env, (await auth(env, body)).id);
    const rows = await env.DB.prepare('SELECT cred_id, name, created, last_used FROM passkeys WHERE username = ? ORDER BY created').bind(acc.username).all();
    const g = await env.DB.prepare('SELECT created FROM google_links WHERE username = ?').bind(acc.username).first();
    return { ok: true, passkeys: rows.results || [], google: g ? { created: g.created } : null, hasPassword: !acc.pw_hash.startsWith('!') };
  }

  if (path === '/api/passkey/delete') {
    const acc = await accountByUser(env, (await auth(env, body)).id);
    await env.DB.prepare('DELETE FROM passkeys WHERE cred_id = ? AND username = ?').bind(String(body.credId || ''), acc.username).run();
    return { ok: true };
  }

  /* Google */
  if (path === '/api/google/login') {
    const claims = await verifyGoogleToken(env, body.credential);
    const link = await env.DB.prepare('SELECT * FROM google_links WHERE sub = ?').bind(String(claims.sub)).first();
    if (!link) return { ok: true, linked: false };
    const acc = await getAccount(env, link.username);
    if (!acc) throw err(404, 'Tiliä ei löytynyt');
    return { ok: true, linked: true, ...(await identityOf(env, acc)), dek: b64u(await serverUnwrap(env, link.server_wrap)) };
  }

  if (path === '/api/google/signup') {
    const claims = await verifyGoogleToken(env, body.credential);
    if (await env.DB.prepare('SELECT sub FROM google_links WHERE sub = ?').bind(String(claims.sub)).first()) throw err(409, 'Tämä Google-tili on jo käytössä');
    const user = await auth(env, body, true);
    if (await env.DB.prepare('SELECT username FROM accounts WHERE user_id = ?').bind(user.id).first()) throw err(409, 'Tällä laitteella on jo tili');
    let username = body.username ? cleanUsername(body.username) : null;
    if (username && await getAccount(env, username)) throw err(409, 'Käyttäjänimi on jo käytössä');
    if (!username) {
      for (let i = 0; i < 5 && !username; i++) {
        const u = 'google-' + randomHex(3);
        if (!(await getAccount(env, u))) username = u;
      }
    }
    const dek = cleanDek(body.dek);
    const rs = randomHex();
    // Ei salasanaa: tiiviste, jota mikään avain ei vastaa ('!'-alku). Salasanan voi asettaa palautuskoodilla.
    await env.DB.batch([
      env.DB.prepare('INSERT INTO accounts (username, user_id, pw_salt, pw_hash, rc_salt, rc_hash, pw_wrap, rc_wrap, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(username, user.id, randomHex(), '!' + randomHex(32), rs, await digest(rs, cleanKey(body.recoveryKey, 'Palautuskoodi')), 'x'.repeat(40), cleanWrap(body.rcWrap), Date.now()),
      env.DB.prepare('INSERT INTO google_links (sub, username, server_wrap, created) VALUES (?, ?, ?, ?)').bind(String(claims.sub), username, await serverWrap(env, dek), Date.now())
    ]);
    return { ok: true, username };
  }

  if (path === '/api/google/link') {
    const acc = await accountByUser(env, (await auth(env, body)).id);
    const claims = await verifyGoogleToken(env, body.credential);
    const other = await env.DB.prepare('SELECT username FROM google_links WHERE sub = ?').bind(String(claims.sub)).first();
    if (other && other.username !== acc.username) throw err(409, 'Tämä Google-tili on jo yhdistetty toiseen GymTrack-tiliin');
    await env.DB.prepare('DELETE FROM google_links WHERE username = ?').bind(acc.username).run();
    await env.DB.prepare('INSERT INTO google_links (sub, username, server_wrap, created) VALUES (?, ?, ?, ?)')
      .bind(String(claims.sub), acc.username, await serverWrap(env, cleanDek(body.dek)), Date.now()).run();
    return { ok: true };
  }

  if (path === '/api/google/unlink') {
    const acc = await accountByUser(env, (await auth(env, body)).id);
    await env.DB.prepare('DELETE FROM google_links WHERE username = ?').bind(acc.username).run();
    return { ok: true };
  }

  return { error: 'Not found', status: 404 };
}
