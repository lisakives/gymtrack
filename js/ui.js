/* GymTrack – käyttöliittymän apurit: ikonit, ilmoitukset, alapaneelit */
(function () {
  'use strict';

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const P = {
    cloud: '<path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4.5 4.5 0 0 1-.5 9.5z"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
    dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
    chart: '<path d="M3 20h18"/><path d="m5 15 4-4 4 3 6-7"/>',
    body: '<circle cx="12" cy="4.5" r="2"/><path d="M8 22v-8l-2-1V9a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4l-2 1v8M12 14v8"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    back: '<path d="m15 6-6 6 6 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4M12 13v4M8 21h8M9 17h6v4H9z"/>',
    note: '<path d="M5 4h14v16H5z"/><path d="M9 9h6M9 13h6M9 17h3"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    up: '<path d="m6 15 6-6 6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    play: '<path d="M7 4.5v15l12-7.5z"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
    swap: '<path d="M7 7h11l-3-3M17 17H6l3 3"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    food: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M16 21V3c-2 1.5-3 4-3 7v4h3"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    fire: '<path d="M12 3s5 4.5 5 9.5a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3 1-6 1-8z"/>'
  };
  const icon = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || ''}</svg>`;

  /* ---------- Ilmoitukset ---------- */
  function toast(text, kind = '', ms = 2600) {
    const host = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.innerHTML = (kind === 'pr' ? icon('trophy') : kind === 'error' ? icon('x') : icon('check')) + `<span>${text}</span>`;
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 350); }, ms);
  }

  /* ---------- Alapaneeli (sheet) ---------- */
  function sheet(html, { onMount, dismissable = true } = {}) {
    return new Promise(resolve => {
      const root = document.getElementById('sheets');
      const wrap = document.createElement('div');
      wrap.className = 'sheet-wrap';
      wrap.innerHTML = `<div class="sheet-backdrop"></div><div class="sheet" role="dialog" aria-modal="true"><div class="sheet-grip"></div>${html}</div>`;
      root.appendChild(wrap);
      requestAnimationFrame(() => wrap.classList.add('open'));
      let closed = false;
      const close = (val) => {
        if (closed) return; closed = true;
        wrap.classList.remove('open');
        setTimeout(() => wrap.remove(), 280);
        resolve(val);
      };
      if (dismissable) {
        wrap.querySelector('.sheet-backdrop').addEventListener('click', () => close(null));
        // Pyyhkäisy alas sulkee paneelin (kuten iOS:ssä)
        const sh = wrap.querySelector('.sheet');
        let y0 = null, dy = 0, t0 = 0;
        sh.addEventListener('touchstart', e => {
          const t = e.touches[0];
          if (sh.scrollTop > 0 || (t.clientY - sh.getBoundingClientRect().top > 80 && !e.target.closest('.sheet-grip'))) return;
          if (e.target.closest('input,textarea,select')) return;
          y0 = t.clientY; dy = 0; t0 = Date.now(); sh.style.transition = 'none';
        }, { passive: true });
        sh.addEventListener('touchmove', e => {
          if (y0 === null) return;
          dy = Math.max(0, e.touches[0].clientY - y0);
          sh.style.transform = `translateY(${dy}px)`;
          wrap.querySelector('.sheet-backdrop').style.opacity = String(Math.max(0.2, 1 - dy / 400));
        }, { passive: true });
        sh.addEventListener('touchend', () => {
          if (y0 === null) return;
          y0 = null; sh.style.transition = '';
          wrap.querySelector('.sheet-backdrop').style.opacity = '';
          const fast = dy > 40 && dy / Math.max(1, Date.now() - t0) > 0.6;
          if (dy > 120 || fast) { sh.style.transform = 'translateY(100%)'; close(null); }
          else sh.style.transform = '';
        });
      }
      wrap.addEventListener('click', e => {
        const b = e.target.closest('[data-sheet]');
        if (b) { e.preventDefault(); close(b.dataset.sheet); }
      });
      onMount && onMount(wrap.querySelector('.sheet'), close);
    });
  }

  function confirm({ title, text = '', ok = 'Vahvista', cancel = 'Peruuta', danger = false }) {
    return sheet(`
      <h3 class="sheet-title">${title}</h3>
      ${text ? `<p class="sheet-text">${text}</p>` : ''}
      <div class="sheet-actions">
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-block" data-sheet="ok">${ok}</button>
        <button class="btn btn-ghost btn-block" data-sheet="cancel">${cancel}</button>
      </div>`).then(v => v === 'ok');
  }

  /** Lomakepaneeli: fields = [{name,label,type,value,placeholder,step,options}] → Promise<obj|null> */
  function form({ title, fields, ok = 'Tallenna', extra = '' }) {
    const f = fields.map(fl => {
      const id = 'f_' + fl.name;
      if (fl.type === 'select') {
        return `<label class="field"><span>${fl.label}</span><select id="${id}" name="${fl.name}">${fl.options.map(o => `<option value="${esc(o.value)}" ${o.value === fl.value ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>`;
      }
      if (fl.type === 'checkbox') {
        return `<label class="toggle"><span>${fl.label}</span><input type="checkbox" id="${id}" name="${fl.name}" ${fl.value ? 'checked' : ''}><i></i></label>`;
      }
      if (fl.type === 'textarea') {
        return `<label class="field"><span>${fl.label}</span><textarea id="${id}" name="${fl.name}" rows="3" placeholder="${esc(fl.placeholder || '')}">${esc(fl.value || '')}</textarea></label>`;
      }
      const num = fl.type === 'number';
      return `<label class="field ${fl.half ? 'half' : fl.third ? 'third' : ''}"><span>${fl.label}</span><input id="${id}" name="${fl.name}" type="${num ? 'text' : (fl.type || 'text')}" ${num ? `inputmode="${fl.int ? 'numeric' : 'decimal'}"` : ''} value="${esc(fl.value ?? '')}" placeholder="${esc(fl.placeholder || '')}" ${fl.required ? 'required' : ''} autocomplete="${fl.autocomplete || 'off'}" ${fl.attrs || ''}>${fl.hint ? `<small class="muted sm">${fl.hint}</small>` : ''}</label>`;
    }).join('');
    return new Promise(resolve => {
      sheet(`<form class="sheet-form" novalidate>
        <h3 class="sheet-title">${title}</h3>
        <div class="fields">${f}</div>
        ${extra}
        <div class="sheet-actions">
          <button class="btn btn-primary btn-block" type="submit">${ok}</button>
          <button class="btn btn-ghost btn-block" type="button" data-sheet="cancel">Peruuta</button>
        </div></form>`, {
        onMount(el, close) {
          const formEl = el.querySelector('form');
          const first = formEl.querySelector('input,textarea');
          if (first && !('ontouchstart' in window)) setTimeout(() => first.focus(), 300);
          formEl.addEventListener('submit', e => {
            e.preventDefault();
            const out = {};
            let valid = true;
            fields.forEach(fl => {
              const input = formEl.elements[fl.name];
              if (fl.type === 'checkbox') { out[fl.name] = input.checked; return; }
              let v = input.value.trim();
              if (fl.type === 'number') {
                v = GT.model.num(v);
                if (fl.required && v === null) valid = false;
              } else if (fl.required && !v) valid = false;
              if (fl.required && (v === null || v === '')) input.classList.add('invalid'); else input.classList.remove('invalid');
              out[fl.name] = v;
            });
            if (!valid) { toast('Täytä pakolliset kentät', 'error'); return; }
            close('submit');
            resolve(out);
          });
        }
      }).then(v => { if (v !== 'submit') resolve(v && v !== 'cancel' ? { __action: v } : null); });
    });
  }

  /* ---------- Pieni valikko (popover) ---------- */
  // items: [{ label, icon?, action? (data-action), href?, danger? }]
  let popEl = null;
  function closeMenu() {
    if (!popEl) return;
    popEl.classList.remove('open');
    const el = popEl; popEl = null;
    setTimeout(() => el.remove(), 180);
    document.removeEventListener('pointerdown', onOutside, true);
    window.removeEventListener('resize', closeMenu);
  }
  function onOutside(e) { if (popEl && !popEl.contains(e.target)) closeMenu(); }
  function menu(anchor, items) {
    closeMenu();
    const el = document.createElement('div');
    el.className = 'pop-menu';
    el.setAttribute('role', 'menu');
    el.innerHTML = items.map(it => {
      const cls = 'pop-item' + (it.danger ? ' danger' : '');
      const inner = `${it.icon ? icon(it.icon) : ''}<span>${esc(it.label)}</span>`;
      return it.href
        ? `<a class="${cls}" role="menuitem" href="${it.href}">${inner}</a>`
        : `<button class="${cls}" role="menuitem" data-action="${it.action}"${it.data ? ' ' + it.data : ''}>${inner}</button>`;
    }).join('');
    document.body.appendChild(el);
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth, h = el.offsetHeight;
    const left = Math.min(Math.max(8, r.right - w), window.innerWidth - w - 8);
    const below = r.bottom + 8 + h < window.innerHeight - 8;
    el.style.left = left + 'px';
    el.style.top = (below ? r.bottom + 8 : Math.max(8, r.top - h - 8)) + 'px';
    el.style.transformOrigin = below ? 'top right' : 'bottom right';
    popEl = el;
    requestAnimationFrame(() => el.classList.add('open'));
    el.addEventListener('click', e => { if (e.target.closest('.pop-item')) setTimeout(closeMenu, 0); });
    document.addEventListener('pointerdown', onOutside, true);
    window.addEventListener('resize', closeMenu);
    return el;
  }

  function haptic(ms = 12) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* iOS ei tue */ } }

  window.GT = window.GT || {};
  GT.ui = { esc, icon, toast, sheet, confirm, form, haptic, menu, closeMenu };
})();
