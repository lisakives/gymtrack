/* GymTrack – liike ja sulavuus
 *  - morph: päivittää näkymän paikallaan (ei välähdystä, CSS-siirtymät toimivat)
 *  - lukujen laskuri-animaatio, onnistumisanimaatiot, painallustuntuma
 */
(function () {
  'use strict';

  const reduce = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Kevyt DOM-morph ---------- */
  function syncAttrs(from, to) {
    const fa = from.attributes, ta = to.attributes;
    for (let i = fa.length - 1; i >= 0; i--) { const n = fa[i].name; if (!to.hasAttribute(n)) from.removeAttribute(n); }
    for (let i = 0; i < ta.length; i++) { const { name, value } = ta[i]; if (from.getAttribute(name) !== value) from.setAttribute(name, value); }
  }

  const keyOf = n => n.nodeType === 1 ? (n.getAttribute('data-id') || n.getAttribute('data-key')) : null;

  function same(a, b) {
    if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) return false;
    if (a.nodeType !== 1) return true;
    if (keyOf(a) !== keyOf(b)) return false;
    // Graafit sidotaan uudelleen, jos data muuttuu
    if (a.classList.contains('chart') && a.getAttribute('data-points') !== b.getAttribute('data-points')) return false;
    if (a.nodeName === 'svg' && a.getAttribute('class') !== b.getAttribute('class')) return false;
    return true;
  }

  function morphNode(from, to) {
    if (from.nodeType === 3 || from.nodeType === 8) { if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue; return; }
    const focused = from === document.activeElement;
    syncAttrs(from, to);
    const tag = from.nodeName;
    if (tag === 'INPUT') {
      if (!focused) {
        if (from.type === 'checkbox' || from.type === 'radio') from.checked = to.hasAttribute('checked');
        else if (from.value !== (to.getAttribute('value') || '')) from.value = to.getAttribute('value') || '';
      }
      return;
    }
    if (tag === 'TEXTAREA') { if (!focused && from.value !== to.value) from.value = to.value; return; }
    morphChildren(from, to);
  }

  /** Avaimelliset rivit (data-id) säilyvät, vaikka niiden järjestys muuttuu. */
  function morphChildren(from, to) {
    const b = Array.from(to.childNodes);
    const keyed = new Map();
    from.childNodes.forEach(n => { const k = keyOf(n); if (k && !keyed.has(k)) keyed.set(k, n); });
    for (let i = 0; i < b.length; i++) {
      const tc = b[i], fc = from.childNodes[i] || null, k = keyOf(tc);
      const m = k ? keyed.get(k) : null;
      if (m && m.nodeName === tc.nodeName) {
        keyed.delete(k);
        if (m !== fc) from.insertBefore(m, fc);
        morphNode(m, tc);
      } else if (fc && same(fc, tc) && !keyOf(fc)) {
        morphNode(fc, tc);
      } else {
        from.insertBefore(tc, fc);
      }
    }
    while (from.childNodes.length > b.length) from.removeChild(from.lastChild);
  }

  /** Päivittää elementin sisällön uuteen HTML:ään säilyttäen olemassa olevat solmut. */
  function morph(el, html) {
    const tpl = document.createElement('div');
    tpl.innerHTML = html;
    morphChildren(el, tpl);
  }

  /* ---------- Lukujen laskuri ---------- */
  function countUp(root) {
    if (reduce()) return;
    root.querySelectorAll('[data-count]').forEach(el => {
      const target = parseFloat(el.dataset.count);
      if (!isFinite(target) || target === 0) return;
      const dec = +(el.dataset.dec || 0);
      const dur = 700, t0 = performance.now();
      const fmt = v => v.toLocaleString('fi-FI', { minimumFractionDigits: dec, maximumFractionDigits: dec });
      const step = t => {
        const p = Math.min(1, (t - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3);
        el.textContent = fmt(target * e);
        if (p < 1) requestAnimationFrame(step); else el.textContent = fmt(target);
      };
      el.textContent = fmt(0);
      requestAnimationFrame(step);
    });
  }

  /* ---------- Onnistumisanimaatio (konfetti) ---------- */
  function celebrate(x, y) {
    if (reduce()) return;
    const host = document.createElement('div');
    host.className = 'confetti';
    const colors = ['#9dd3ff', '#82d1ae', '#ffd38a', '#c8a8ff', '#ff9fb3'];
    const cx = x != null ? x : window.innerWidth / 2, cy = y != null ? y : window.innerHeight / 3;
    for (let i = 0; i < 28; i++) {
      const p = document.createElement('i');
      const ang = Math.random() * Math.PI * 2, dist = 70 + Math.random() * 120;
      p.style.left = cx + 'px'; p.style.top = cy + 'px';
      p.style.background = colors[i % colors.length];
      p.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
      p.style.setProperty('--dy', Math.sin(ang) * dist - 60 + 'px');
      p.style.setProperty('--r', (Math.random() * 720 - 360) + 'deg');
      p.style.animationDelay = (Math.random() * 60) + 'ms';
      host.appendChild(p);
    }
    document.body.appendChild(host);
    setTimeout(() => host.remove(), 1300);
  }

  /** Pieni "pomppu" painetulle elementille (esim. tehtävän kuittaus). */
  function pop(el) {
    if (!el || reduce()) return;
    el.classList.remove('popping'); void el.offsetWidth; el.classList.add('popping');
    setTimeout(() => el.classList.remove('popping'), 450);
  }

  /* ---------- Yläpalkin lasiefekti vierittäessä ---------- */
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => { document.body.classList.toggle('scrolled', window.scrollY > 8); ticking = false; });
  }, { passive: true });

  window.GT = window.GT || {};
  GT.motion = { morph, countUp, celebrate, pop, reduce };
})();
