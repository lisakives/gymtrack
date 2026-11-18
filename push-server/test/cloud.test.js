// Käyttäjätilien ja salatun pilvivarmuuskopion testit: node --test test/
// Asiakaspuolen salaus (js/cloud.js) ajetaan Nodessa samoilla WebCrypto-rajapinnoilla kuin selaimessa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/index.js';
await import('../../js/cloud.js');
const C = globalThis.GT.cloudCrypto;

function makeD1() {
  const db = new DatabaseSync(':memory:');
  const stmt = (sql) => {
    let args = [];
    const s = {
      bind(...a) { args = a; return s; },
      async first() { return db.prepare(sql).get(...args) || null; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
      async run() { const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes } }; }
    };
    return s;
  };
  return { prepare: stmt, async batch(list) { for (const s of list) await s.run(); }, raw: db };
}
async function call(env, path, body) {
  const res = await worker.fetch(new Request('https://push.test' + path, { method: 'POST', body: JSON.stringify(body) }), env);
  return { status: res.status, body: await res.json() };
}

const state = { schema: 1, workouts: [{ id: 'w1', name: 'PULL', exercises: [] }], sessions: [{ id: 's1', endedAt: '2026-11-17T10:00:00Z' }], measurements: [{ id: 'm1', type: 'weight', value: 82.1 }], food: { entries: [{ id: 'f1', name: 'Kaurapuuro', kcal: 350 }] } };

test('salaus: avainten johtaminen, lukitus ja datan salaus', async () => {
  const a = await C.derive('salasana123', 'Roni', 'pw');
  const b = await C.derive('salasana123', 'roni', 'pw');
  assert.equal(a.authKey, b.authKey, 'käyttäjänimen kirjainkoko ei vaikuta');
  const c = await C.derive('salasana124', 'roni', 'pw');
  assert.notEqual(a.authKey, c.authKey);
  const rc = await C.derive('salasana123', 'roni', 'rc');
  assert.notEqual(a.authKey, rc.authKey, 'salasana- ja palautusavain eroavat');

  const dek = crypto.getRandomValues(new Uint8Array(32));
  const w = await C.wrapKey(dek, a.kek);
  assert.deepEqual(await C.unwrapKey(w, b.kek), dek);
  await assert.rejects(C.unwrapKey(w, c.kek), /avaus/);

  const text = JSON.stringify(state);
  const sealed = await C.encryptText(text, dek);
  assert.ok(!sealed.includes('Kaurapuuro') && !Buffer.from(sealed, 'base64').toString('latin1').includes('Kaurapuuro'), 'data ei ole selväkielistä');
  assert.equal(await C.decryptText(sealed, dek), text);
  await assert.rejects(C.decryptText(sealed, crypto.getRandomValues(new Uint8Array(32))), /avaus/);

  const code = C.recoveryCode();
  assert.match(code, /^[A-HJKMNP-Z2-9]{5}(-[A-HJKMNP-Z2-9]{5}){3}$/);
  assert.equal(C.normCode(code.toLowerCase().replace(/-/g, ' ')), code.replace(/-/g, ''));
});

test('tili: luonti, kirjautuminen, varmuuskopio, salasanan vaihto, unohtunut salasana ja poisto', async () => {
  const env = { DB: makeD1() };
  const dev = { userId: 'u_' + 'a'.repeat(22), secret: 'b'.repeat(32) };
  const user = 'roni';
  const code = C.recoveryCode();
  const pw = await C.derive('Salainen-1', user, 'pw');
  const rc = await C.derive(C.normCode(code), user, 'rc');
  const dek = crypto.getRandomValues(new Uint8Array(32));

  let r = await call(env, '/api/account/register', { ...dev, username: 'Roni', pwKey: pw.authKey, recoveryKey: rc.authKey, pwWrap: await C.wrapKey(dek, pw.kek), rcWrap: await C.wrapKey(dek, rc.kek) });
  assert.equal(r.status, 200); assert.equal(r.body.username, 'roni');
  r = await call(env, '/api/account/register', { userId: 'u_' + 'c'.repeat(22), secret: 'd'.repeat(32), username: 'roni', pwKey: pw.authKey, recoveryKey: rc.authKey, pwWrap: await C.wrapKey(dek, pw.kek), rcWrap: await C.wrapKey(dek, rc.kek) });
  assert.equal(r.status, 409, 'varattu käyttäjänimi');
  r = await call(env, '/api/account/register', { ...dev, username: 'x', pwKey: pw.authKey, recoveryKey: rc.authKey, pwWrap: 'a'.repeat(60), rcWrap: 'a'.repeat(60) });
  assert.equal(r.status, 400, 'liian lyhyt käyttäjänimi');

  assert.equal((await call(env, '/api/account/available', { username: 'RONI' })).body.available, false, 'varattu nimi');
  assert.equal((await call(env, '/api/account/available', { username: 'vapaa_nimi' })).body.available, true, 'vapaa nimi');
  assert.equal((await call(env, '/api/account/available', { username: 'x' })).body.available, false, 'liian lyhyt');

  // Palvelin ei tallenna salasanaa, palautuskoodia eikä avaimia sellaisenaan
  const row = env.DB.raw.prepare('SELECT * FROM accounts').get();
  const dump = JSON.stringify(row);
  assert.ok(!dump.includes(pw.authKey) && !dump.includes(rc.authKey) && !dump.includes('Salainen-1') && !dump.includes(C.normCode(code)));

  // Varmuuskopio: palvelin saa vain salattua dataa
  const text = JSON.stringify(state);
  const data = await C.encryptText(text, dek);
  const hash = await C.keyedHash(text, dek);
  r = await call(env, '/api/backup/put', { ...dev, data, hash });
  assert.equal(r.status, 200);
  const stored = env.DB.raw.prepare('SELECT data FROM backups').get().data;
  assert.ok(!stored.includes('Kaurapuuro'));
  r = await call(env, '/api/backup/put', { ...dev, data: 'not base64!', hash });
  assert.equal(r.status, 400);
  r = await call(env, '/api/backup/put', { ...dev, secret: 'z'.repeat(32), data, hash });
  assert.equal(r.status, 403, 'väärä laitesalaisuus');
  r = await call(env, '/api/backup/head', dev);
  assert.equal(r.body.latest.hash, hash);

  // Kirjautuminen toisella laitteella
  r = await call(env, '/api/account/login', { username: 'roni', pwKey: (await C.derive('väärä-salasana', user, 'pw')).authKey });
  assert.equal(r.status, 401);
  r = await call(env, '/api/account/login', { username: 'eiole', pwKey: pw.authKey });
  assert.equal(r.status, 401, 'tuntematon käyttäjä: sama virhe');
  assert.match(r.body.error, /Väärä käyttäjänimi tai salasana/);
  r = await call(env, '/api/account/login', { username: 'RONI', pwKey: pw.authKey });
  assert.equal(r.status, 200);
  assert.equal(r.body.userId, dev.userId); assert.equal(r.body.secret, dev.secret);
  const dek2 = await C.unwrapKey(r.body.wrap, pw.kek);
  r = await call(env, '/api/backup/get', dev);
  assert.equal(await C.decryptText(r.body.data, dek2), text, 'toinen laite avaa varmuuskopion');
  r = await call(env, '/api/backup/list', dev);
  assert.equal(r.body.backups.length, 1);

  // Salasanan vaihto
  const pw2 = await C.derive('Uusi-salasana-2', user, 'pw');
  r = await call(env, '/api/account/password', { username: user, pwKey: pw.authKey, newPwKey: pw2.authKey, newPwWrap: await C.wrapKey(dek2, pw2.kek) });
  assert.equal(r.status, 200);
  assert.equal((await call(env, '/api/account/login', { username: user, pwKey: pw.authKey })).status, 401, 'vanha salasana ei enää käy');
  r = await call(env, '/api/account/login', { username: user, pwKey: pw2.authKey });
  assert.deepEqual(await C.unwrapKey(r.body.wrap, pw2.kek), dek);

  // Unohtunut salasana: palautuskoodilla
  assert.equal((await call(env, '/api/account/recover', { username: user, recoveryKey: (await C.derive('AAAAABBBBBCCCCCDDDDD', user, 'rc')).authKey })).status, 401);
  r = await call(env, '/api/account/recover', { username: user, recoveryKey: rc.authKey });
  assert.equal(r.status, 200);
  const dek3 = await C.unwrapKey(r.body.wrap, rc.kek);
  const pw3 = await C.derive('Kolmas-salasana', user, 'pw');
  r = await call(env, '/api/account/reset', { username: user, recoveryKey: rc.authKey, newPwKey: pw3.authKey, newPwWrap: await C.wrapKey(dek3, pw3.kek) });
  assert.equal(r.status, 200);
  assert.notEqual(r.body.secret, dev.secret, 'laitesalaisuus vaihtuu');
  const dev2 = { userId: r.body.userId, secret: r.body.secret };
  assert.equal((await call(env, '/api/backup/head', dev)).status, 403, 'vanha laite joutuu kirjautumaan uudelleen');
  r = await call(env, '/api/backup/get', dev2);
  assert.equal(await C.decryptText(r.body.data, await C.unwrapKey((await call(env, '/api/account/login', { username: user, pwKey: pw3.authKey })).body.wrap, pw3.kek)), text, 'tiedot säilyvät salasanan palautuksen jälkeen');

  // Poisto
  assert.equal((await call(env, '/api/account/delete', { username: user, pwKey: pw2.authKey })).status, 401);
  r = await call(env, '/api/account/delete', { username: user, pwKey: pw3.authKey });
  assert.equal(r.status, 200);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM backups').get().n, 0, 'varmuuskopiot poistettu');
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM accounts').get().n, 0);
});

test('tili lukittuu toistuvista vääristä salasanoista', async () => {
  const env = { DB: makeD1() };
  const dev = { userId: 'u_' + 'e'.repeat(22), secret: 'f'.repeat(32) };
  const pw = await C.derive('oikea-salasana', 'testi', 'pw');
  const w = await C.wrapKey(new Uint8Array(32), pw.kek);
  await call(env, '/api/account/register', { ...dev, username: 'testi', pwKey: pw.authKey, recoveryKey: pw.authKey, pwWrap: w, rcWrap: w });
  const bad = (await C.derive('väärä', 'testi', 'pw')).authKey;
  for (let i = 0; i < 8; i++) assert.equal((await call(env, '/api/account/login', { username: 'testi', pwKey: bad })).status, 401);
  const r = await call(env, '/api/account/login', { username: 'testi', pwKey: pw.authKey });
  assert.equal(r.status, 429, 'lukittu myös oikealla salasanalla');
  assert.match(r.body.error, /minuutin/);
});

test('varmuuskopiot: yksi versio päivässä, 30 päivää', async () => {
  const env = { DB: makeD1() };
  const dev = { userId: 'u_' + 'g'.repeat(22), secret: 'h'.repeat(32) };
  const realNow = Date.now;
  try {
    const base = Date.parse('2026-10-01T09:00:00Z');
    for (let d = 0; d < 35; d++) {
      for (let k = 0; k < 2; k++) {
        Date.now = () => base + d * 86400000 + k * 3600000;
        const r = await call(env, d === 0 && k === 0 ? '/api/account/register' : '/api/backup/put', d === 0 && k === 0
          ? { ...dev, username: 'paivat', pwKey: 'a'.repeat(43), recoveryKey: 'b'.repeat(43), pwWrap: 'c'.repeat(60), rcWrap: 'c'.repeat(60) }
          : { ...dev, data: 'QUJD' + d + 'x' + k, hash: 'h' + d + k });
        assert.equal(r.status, 200);
      }
    }
    const list = (await call(env, '/api/backup/list', dev)).body.backups;
    assert.ok(list.length <= 31 && list.length >= 30, 'noin 30 päivää: ' + list.length);
    assert.equal(list[0].hash, 'h341', 'uusin päivän viimeisin versio ensin');
    assert.equal(list[0].day, '2026-11-04');
  } finally { Date.now = realNow; }
});

/* ---------- Face ID (WebAuthn) ja Google ---------- */
const b64 = C.b64u;
const ORIGIN = 'https://lisakives.github.io';
function rawToDer(raw) {
  const int = b => { let i = 0; while (i < b.length - 1 && b[i] === 0) i++; b = b.slice(i); if (b[0] & 0x80) b = Uint8Array.of(0, ...b); return Uint8Array.of(0x02, b.length, ...b); };
  const r = int(raw.slice(0, 32)), s = int(raw.slice(32));
  return Uint8Array.of(0x30, r.length + s.length, ...r, ...s);
}
async function makeAuthenticator() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', kp.publicKey));
  const credId = b64(crypto.getRandomValues(new Uint8Array(32)));
  let counter = 0;
  return {
    credId, spki: b64(spki),
    clientData: (type, challenge, origin = ORIGIN) => b64(new TextEncoder().encode(JSON.stringify({ type, challenge, origin }))),
    async assert(challenge, { origin = ORIGIN, rpId = 'lisakives.github.io', flags = 0x05 } = {}) {
      const cdj = this.clientData('webauthn.get', challenge, origin);
      const rpHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rpId)));
      counter++;
      const ad = new Uint8Array(37); ad.set(rpHash); ad[32] = flags; ad[36] = counter;
      const cdHash = new Uint8Array(await crypto.subtle.digest('SHA-256', C.unb64u(cdj)));
      const msg = new Uint8Array(ad.length + 32); msg.set(ad); msg.set(cdHash, ad.length);
      const raw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, msg));
      return { credId, clientDataJSON: cdj, authenticatorData: b64(ad), signature: b64(rawToDer(raw)) };
    }
  };
}

test('Face ID: pääsyavaimen rekisteröinti ja kirjautuminen, salaus säilyy', async () => {
  const env = { DB: makeD1() };
  const dev = { userId: 'u_' + 'p'.repeat(22), secret: 'q'.repeat(32) };
  const pw = await C.derive('salasana-1', 'faceid', 'pw');
  const dek = crypto.getRandomValues(new Uint8Array(32));
  await call(env, '/api/account/register', { ...dev, username: 'faceid', pwKey: pw.authKey, recoveryKey: pw.authKey, pwWrap: await C.wrapKey(dek, pw.kek), rcWrap: await C.wrapKey(dek, pw.kek) });

  assert.equal((await call(env, '/api/passkey/challenge', { purpose: 'register' })).status, 400, 'rekisteröinti vaatii kirjautuneen laitteen');
  let r = await call(env, '/api/passkey/challenge', { ...dev, purpose: 'register' });
  assert.equal(r.body.username, 'faceid');
  const auth = await makeAuthenticator();
  const prfKek = await crypto.subtle.importKey('raw', crypto.getRandomValues(new Uint8Array(32)), 'AES-GCM', false, ['encrypt', 'decrypt']);
  const reg = { ...dev, credId: auth.credId, publicKey: auth.spki, alg: -7, prfWrap: await C.wrapKey(dek, prfKek) };
  r = await call(env, '/api/passkey/register', { ...reg, clientDataJSON: auth.clientData('webauthn.create', r.body.challenge, 'https://evil.example') });
  assert.equal(r.status, 403, 'vieras sivusto hylätään');
  r = await call(env, '/api/passkey/challenge', { ...dev, purpose: 'register' });
  const ch = r.body.challenge;
  r = await call(env, '/api/passkey/register', { ...reg, clientDataJSON: auth.clientData('webauthn.create', ch) });
  assert.equal(r.status, 200);
  r = await call(env, '/api/passkey/register', { ...reg, clientDataJSON: auth.clientData('webauthn.create', ch) });
  assert.equal(r.status, 400, 'haastetta ei voi käyttää kahdesti');

  // Kirjautuminen
  let c = (await call(env, '/api/passkey/challenge', { purpose: 'login' })).body.challenge;
  r = await call(env, '/api/passkey/login', await auth.assert(c));
  assert.equal(r.status, 200);
  assert.equal(r.body.userId, dev.userId);
  assert.deepEqual(await C.unwrapKey(r.body.wrap, prfKek), dek, 'PRF-avain avaa tietoavaimen');
  assert.ok(!JSON.stringify(env.DB.raw.prepare('SELECT * FROM passkeys').all()).includes(b64(dek)), 'palvelimella ei ole tietoavainta selväkielisenä');

  c = (await call(env, '/api/passkey/challenge', { purpose: 'login' })).body.challenge;
  const a = await auth.assert(c);
  a.signature = (await auth.assert(c)).signature.slice(0, -4) + 'AAAA';
  assert.equal((await call(env, '/api/passkey/login', a)).status, 403, 'väärä allekirjoitus');
  c = (await call(env, '/api/passkey/challenge', { purpose: 'login' })).body.challenge;
  assert.equal((await call(env, '/api/passkey/login', await auth.assert(c, { flags: 0x01 }))).status, 403, 'ilman Face ID -tunnistusta (UV) hylätään');
  c = (await call(env, '/api/passkey/challenge', { purpose: 'login' })).body.challenge;
  assert.equal((await call(env, '/api/passkey/login', await auth.assert(c, { rpId: 'evil.example' }))).status, 403, 'väärä rpId hylätään');
  assert.equal((await call(env, '/api/passkey/login', await auth.assert('keksitty'))).status, 400, 'tuntematon haaste hylätään');

  r = await call(env, '/api/passkey/list', dev);
  assert.equal(r.body.passkeys.length, 1);
  assert.equal(r.body.hasPassword, true);
  await call(env, '/api/passkey/delete', { ...dev, credId: auth.credId });
  c = (await call(env, '/api/passkey/challenge', { purpose: 'login' })).body.challenge;
  assert.equal((await call(env, '/api/passkey/login', await auth.assert(c))).status, 404, 'poistettu pääsyavain ei toimi');
});

test('Google: tunnisteen tarkistus, tilin luonti, kirjautuminen ja yhdistäminen', async () => {
  const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const CLIENT = 'test-client.apps.googleusercontent.com';
  const env = { DB: makeD1(), GOOGLE_CLIENT_ID: CLIENT, GOOGLE_JWKS_URL: 'https://jwks.test/certs' };
  const enc = new TextEncoder();
  const token = async (claims, key = kp.privateKey) => {
    const h = b64(enc.encode(JSON.stringify({ alg: 'RS256', kid: 'k1', typ: 'JWT' })));
    const p = b64(enc.encode(JSON.stringify({ iss: 'https://accounts.google.com', aud: CLIENT, exp: Math.floor(Date.now() / 1000) + 600, email: 'salainen@example.com', ...claims })));
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(h + '.' + p));
    return h + '.' + p + '.' + b64(sig);
  };
  const origFetch = globalThis.fetch;
  globalThis.fetch = async url => url === 'https://jwks.test/certs' ? new Response(JSON.stringify({ keys: [{ ...jwk, kid: 'k1' }] })) : origFetch(url);
  try {
    assert.equal((await call({ DB: makeD1() }, '/api/google/login', { credential: await token({ sub: '1' }) })).status, 503, 'pois käytöstä ilman Client ID:tä');
    let r = await call(env, '/api/google/login', { credential: await token({ sub: 'g-123' }) });
    assert.equal(r.status, 200); assert.equal(r.body.linked, false);
    assert.equal((await call(env, '/api/google/login', { credential: await token({ sub: 'g-123', aud: 'toinen' }) })).status, 403, 'väärä aud');
    assert.equal((await call(env, '/api/google/login', { credential: await token({ sub: 'g-123', exp: 1000 }) })).status, 403, 'vanhentunut');
    assert.equal((await call(env, '/api/google/login', { credential: await token({ sub: 'g-123', iss: 'https://evil' }) })).status, 403, 'väärä myöntäjä');
    const other = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign']);
    assert.equal((await call(env, '/api/google/login', { credential: await token({ sub: 'g-123' }, other.privateKey) })).status, 403, 'väärä allekirjoitus');

    const dev = { userId: 'u_' + 'r'.repeat(22), secret: 's'.repeat(32) };
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const code = C.recoveryCode();
    const rc = await C.derive(C.normCode(code), 'google-abc123', 'rc');
    r = await call(env, '/api/google/signup', { ...dev, credential: await token({ sub: 'g-123' }), username: 'google-abc123', recoveryKey: rc.authKey, rcWrap: await C.wrapKey(dek, rc.kek), dek: b64(dek) });
    assert.equal(r.status, 200); assert.equal(r.body.username, 'google-abc123');
    const dump = JSON.stringify([env.DB.raw.prepare('SELECT * FROM google_links').all(), env.DB.raw.prepare('SELECT * FROM accounts').all()]);
    assert.ok(!dump.includes('salainen@example.com') && !dump.includes(b64(dek)), 'sähköpostia tai avainta ei tallenneta');

    r = await call(env, '/api/google/login', { credential: await token({ sub: 'g-123' }) });
    assert.equal(r.body.linked, true); assert.equal(r.body.userId, dev.userId);
    assert.equal(r.body.dek, b64(dek), 'toinen laite saa tietoavaimen');
    assert.equal((await call(env, '/api/account/login', { username: 'google-abc123', pwKey: 'a'.repeat(43) })).status, 401, 'Google-tilillä ei ole salasanaa');
    // Salasanan voi asettaa palautuskoodilla
    const w = (await call(env, '/api/account/recover', { username: 'google-abc123', recoveryKey: rc.authKey })).body.wrap;
    const pw = await C.derive('uusi-salasana', 'google-abc123', 'pw');
    assert.equal((await call(env, '/api/account/reset', { username: 'google-abc123', recoveryKey: rc.authKey, newPwKey: pw.authKey, newPwWrap: await C.wrapKey(await C.unwrapKey(w, rc.kek), pw.kek) })).status, 200);
    r = await call(env, '/api/account/login', { username: 'google-abc123', pwKey: pw.authKey });
    assert.equal(r.status, 200);
    const dev2 = { userId: r.body.userId, secret: r.body.secret };

    // Yhdistäminen olemassa olevaan tiliin ja poisto
    const devB = { userId: 'u_' + 't'.repeat(22), secret: 'v'.repeat(32) };
    const pwB = await C.derive('salasana-b', 'tiliB', 'pw');
    await call(env, '/api/account/register', { ...devB, username: 'tiliB', pwKey: pwB.authKey, recoveryKey: pwB.authKey, pwWrap: await C.wrapKey(dek, pwB.kek), rcWrap: await C.wrapKey(dek, pwB.kek) });
    assert.equal((await call(env, '/api/google/link', { ...devB, credential: await token({ sub: 'g-123' }), dek: b64(dek) })).status, 409, 'sama Google-tili ei kahteen tiliin');
    assert.equal((await call(env, '/api/google/link', { ...devB, credential: await token({ sub: 'g-999' }), dek: b64(dek) })).status, 200);
    assert.equal((await call(env, '/api/google/login', { credential: await token({ sub: 'g-999' }) })).body.userId, devB.userId);
    await call(env, '/api/google/unlink', devB);
    assert.equal((await call(env, '/api/google/login', { credential: await token({ sub: 'g-999' }) })).body.linked, false);

    // Tilin poisto ilman salasanaa kirjautuneelta laitteelta
    assert.equal((await call(env, '/api/account/delete', dev2)).status, 200);
    assert.equal((await call(env, '/api/google/login', { credential: await token({ sub: 'g-123' }) })).body.linked, false, 'poisto poistaa Google-yhteyden');
  } finally { globalThis.fetch = origFetch; }
});
