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
