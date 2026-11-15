/* GymTrack – Open Food Facts -haku (verkko). Tiedot: openfoodfacts.org, lisenssi ODbL.
 * Käytetään vain, kun käyttäjä hakee ruokaa tai syöttää viivakoodin.
 * Palauttaa tuotteet samassa muodossa kuin sisäinen ruokatietokanta (arvot / 100 g). */
(function () {
  'use strict';
  const BASE = 'https://world.openfoodfacts.org';
  const FIELDS = 'code,product_name,product_name_fi,brands,nutriments';

  const num = x => { const n = Number(x); return x !== null && x !== '' && Number.isFinite(n) ? n : null; };
  const round = v => Math.round(v * 10) / 10;

  // Muuntaa Open Food Facts -tuotteen GymTrackin ruokariviksi. Palauttaa null, jos arvot puuttuvat.
  function toItem(p) {
    if (!p) return null;
    const n = p.nutriments || {};
    let kcal = num(n['energy-kcal_100g']);
    if (kcal === null) { const kj = num(n['energy_100g']); if (kj !== null) kcal = kj / 4.184; }
    const pr = num(n.proteins_100g), c = num(n.carbohydrates_100g), f = num(n.fat_100g);
    const name = String(p.product_name_fi || p.product_name || '').trim();
    if (!name || kcal === null || pr === null || c === null || f === null) return null;
    const brand = String(p.brands || '').split(',')[0].trim();
    const full = brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${name} (${brand})` : name;
    return {
      name: full, amount: 100, unit: 'g',
      per100: { kcal: round(kcal), p: round(pr), c: round(c), f: round(f) },
      por: null, db: false, src: 'off', code: String(p.code || '')
    };
  }

  async function get(url) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 7000);
    try {
      const r = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(timer); }
  }

  // Nimihaku: vaatii vähintään 3 merkkiä.
  async function search(q) {
    q = String(q || '').trim();
    if (q.length < 3) return [];
    const url = `${BASE}/api/v2/search?search_terms=${encodeURIComponent(q)}&page_size=12&fields=${FIELDS}`;
    const data = await get(url);
    return (data.products || []).map(toItem).filter(Boolean).slice(0, 10);
  }

  // Viivakoodihaku (EAN-8/12/13/14). Palauttaa null, jos tuotetta ei löydy tai tiedot puuttuvat.
  async function byCode(code) {
    code = String(code || '').replace(/\D/g, '');
    if (code.length < 8) return null;
    const data = await get(`${BASE}/api/v2/product/${code}.json?fields=${FIELDS}`);
    return data.status === 1 ? toItem(data.product) : null;
  }

  GT.OFF = { toItem, search, byCode };
})();
