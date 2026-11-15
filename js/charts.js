/* GymTrack – kevyet SVG-graafit ilman ulkoisia kirjastoja */
(function () {
  'use strict';

  const H = 180;
  const chartWidth = () => Math.max(260, Math.min(window.innerWidth, 560) - 72);

  function niceRange(min, max) {
    if (min === max) { const pad = Math.max(1, Math.abs(min) * 0.05); return [min - pad, max + pad]; }
    const pad = (max - min) * 0.12;
    return [min - pad, max + pad];
  }

  /**
   * points: [{ t: Date|ISO, y: number, label?: string }]
   * opts: { unit, height, id }
   */
  function line(points, opts = {}) {
    const h = opts.height || H;
    const W = opts.width || chartWidth();
    if (!points.length) {
      return `<div class="chart-empty">Ei vielä dataa valitulla jaksolla</div>`;
    }
    const pts = points.map(p => ({ ...p, x: +new Date(p.t) })).sort((a, b) => a.x - b.x);
    const padL = 8, padR = 8, padT = 22, padB = 26;
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    let x0 = Math.min(...xs), x1 = Math.max(...xs);
    if (x0 === x1) { x0 -= 86400000; x1 += 86400000; }
    const [y0, y1] = niceRange(Math.min(...ys), Math.max(...ys));
    const sx = x => padL + (x - x0) / (x1 - x0) * (W - padL - padR);
    const sy = y => padT + (1 - (y - y0) / (y1 - y0)) * (h - padT - padB);

    const coords = pts.map(p => [sx(p.x), sy(p.y)]);
    const path = coords.map((c, i) => (i ? 'L' : 'M') + c[0].toFixed(1) + ' ' + c[1].toFixed(1)).join(' ');
    const area = path + ` L ${coords[coords.length - 1][0].toFixed(1)} ${h - padB} L ${coords[0][0].toFixed(1)} ${h - padB} Z`;
    const gid = 'g' + Math.random().toString(36).slice(2, 8);

    // vaakaviivat
    const grid = [0.25, 0.5, 0.75].map(f => {
      const y = padT + f * (h - padT - padB);
      return `<line x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}" class="c-grid"/>`;
    }).join('');

    const fmtD = x => new Date(x).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' });
    const maxIdx = ys.indexOf(Math.max(...ys));
    const last = coords[coords.length - 1];
    const dots = pts.length <= 40
      ? coords.map((c, i) => `<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="${i === coords.length - 1 ? 4 : 2.4}" class="${i === coords.length - 1 ? 'c-dot-last' : 'c-dot'}"/>`).join('')
      : `<circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="4" class="c-dot-last"/>`;

    const data = encodeURIComponent(JSON.stringify(pts.map((p, i) => ({ cx: coords[i][0], cy: coords[i][1], y: p.y, t: p.x, l: p.label || '' }))));
    const unit = opts.unit || '';
    const fmtY = v => v.toLocaleString('fi-FI', { maximumFractionDigits: 1 }) + (unit ? ' ' + unit : '');

    return `<div class="chart" data-points="${data}" data-unit="${unit}" data-h="${h}" data-w="${W}">
      <svg viewBox="0 0 ${W} ${h}" preserveAspectRatio="xMidYMid meet" class="chart-svg" role="img" aria-label="Kehitysgraafi">
        <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.22"/>
          <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
        </linearGradient></defs>
        ${grid}
        <path d="${area}" fill="url(#${gid})" stroke="none"/>
        <path d="${path}" class="c-line" vector-effect="non-scaling-stroke"/>
        ${dots}
        <line class="c-cursor" x1="0" x2="0" y1="${padT - 6}" y2="${h - padB}" style="display:none" vector-effect="non-scaling-stroke"/>
      </svg>
      <div class="chart-axis"><span>${fmtD(x0 + (pts.length === 1 ? 86400000 : 0))}</span><span>${fmtD(x1 - (pts.length === 1 ? 86400000 : 0))}</span></div>
      <div class="chart-hi" style="left:${(coords[maxIdx][0] / W * 100).toFixed(1)}%;top:${Math.max(0, coords[maxIdx][1] - 20).toFixed(0)}px">${fmtY(ys[maxIdx])}</div>
      <div class="chart-tip" hidden></div>
    </div>`;
  }

  function spark(values, opts = {}) {
    const w = opts.width || 120, h = opts.height || 36;
    if (values.length < 2) return `<svg viewBox="0 0 ${w} ${h}" class="spark"><line x1="0" x2="${w}" y1="${h / 2}" y2="${h / 2}" class="c-grid"/></svg>`;
    const min = Math.min(...values), max = Math.max(...values);
    const r = max - min || 1;
    const c = values.map((v, i) => [i / (values.length - 1) * (w - 6) + 3, h - 4 - (v - min) / r * (h - 8)]);
    const d = c.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const l = c[c.length - 1];
    return `<svg viewBox="0 0 ${w} ${h}" class="spark"><path d="${d}" class="c-line" vector-effect="non-scaling-stroke"/><circle cx="${l[0]}" cy="${l[1]}" r="3" class="c-dot-last"/></svg>`;
  }

  /** Lisää kosketus-/hiiriseurannan graafeille annetun juuren sisällä. */
  function bind(root) {
    root.querySelectorAll('.chart[data-points]').forEach(el => {
      if (el._bound) return; el._bound = true;
      const pts = JSON.parse(decodeURIComponent(el.dataset.points));
      const unit = el.dataset.unit;
      const W = +el.dataset.w;
      const svg = el.querySelector('svg');
      const cursor = el.querySelector('.c-cursor');
      const tip = el.querySelector('.chart-tip');
      const hi = el.querySelector('.chart-hi');
      const show = ev => {
        const rect = svg.getBoundingClientRect();
        const cx = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left) / rect.width * W;
        let best = pts[0];
        pts.forEach(p => { if (Math.abs(p.cx - cx) < Math.abs(best.cx - cx)) best = p; });
        cursor.setAttribute('x1', best.cx); cursor.setAttribute('x2', best.cx);
        cursor.style.display = '';
        const d = new Date(best.t).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric', year: '2-digit' });
        tip.innerHTML = `<b>${best.y.toLocaleString('fi-FI', { maximumFractionDigits: 1 })}${unit ? ' ' + unit : ''}</b><span>${best.l ? best.l + ' · ' : ''}${d}</span>`;
        tip.hidden = false;
        const pct = best.cx / W * 100;
        tip.style.left = Math.min(78, Math.max(22, pct)) + '%';
        if (hi) hi.style.opacity = 0;
      };
      const hide = () => { cursor.style.display = 'none'; tip.hidden = true; if (hi) hi.style.opacity = 1; };
      el.addEventListener('pointerdown', show);
      el.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' || e.buttons) show(e); });
      el.addEventListener('pointerleave', hide);
      el.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') setTimeout(hide, 1600); });
    });
  }


  /**
   * Pylväsgraafi: items [{ label, v, hint? }], opts { goal, unit, height }
   * Tavoiteviiva piirretään katkoviivana.
   */
  function bars(items, opts = {}) {
    const h = opts.height || 150;
    const W = opts.width || chartWidth();
    if (!items.length) return `<div class="chart-empty">Ei dataa</div>`;
    const padT = 16, padB = 22;
    const max = Math.max(opts.goal || 0, ...items.map(i => i.v || 0)) * 1.1 || 1;
    const bw = (W - 8) / items.length;
    const sy = v => padT + (1 - v / max) * (h - padT - padB);
    const rects = items.map((it, i) => {
      const x = 4 + i * bw + bw * 0.18, w = Math.max(2, bw * 0.64);
      const y = sy(it.v || 0), hh = (h - padB) - y;
      const over = opts.goal && it.v > opts.goal * 1.1;
      return `<rect style="--i:${i}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(0, hh).toFixed(1)}" rx="3" class="${it.v ? (over ? 'c-bar over' : 'c-bar') : 'c-bar empty'}"><title>${it.hint || ''}</title></rect>` +
        (items.length <= 14 ? `<text x="${(x + w / 2).toFixed(1)}" y="${h - 6}" class="c-lbl" text-anchor="middle">${it.label}</text>` : '');
    }).join('');
    const goal = opts.goal ? `<line x1="4" x2="${W - 4}" y1="${sy(opts.goal).toFixed(1)}" y2="${sy(opts.goal).toFixed(1)}" class="c-goal"/>` : '';
    return `<div class="chart bars"><svg viewBox="0 0 ${W} ${h}" class="chart-svg" role="img" aria-label="Pylväsgraafi">${rects}${goal}</svg>
      ${items.length > 14 ? `<div class="chart-axis"><span>${items[0].label}</span><span>${items[items.length - 1].label}</span></div>` : ''}</div>`;
  }

  /** Edistymisrengas: arvo 0–1 (yli 1 = ylitys) */
  function ring(frac, opts = {}) {
    const size = opts.size || 76, sw = opts.stroke || 7, r = (size - sw) / 2 - 1, c = 2 * Math.PI * r;
    const f = Math.max(0, Math.min(1, frac || 0));
    return `<svg class="ring ${opts.cls || ''}" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-bg" style="stroke-width:${sw}"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-fg ${f <= 0 ? 'zero' : ''} ${frac > 1.1 ? 'over' : ''}" style="stroke-width:${sw};--circ:${c.toFixed(1)};stroke-dasharray:${c.toFixed(1)};stroke-dashoffset:${(c * (1 - f)).toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    </svg>`;
  }

  window.GT = window.GT || {};
  GT.charts = { line, spark, bind, bars, ring };
})();
