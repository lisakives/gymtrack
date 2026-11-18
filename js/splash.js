/* Latausnäyttö: näytetään vähintään 1,6 s, sitten häivytetään */
(function () {
  const el = document.getElementById('splash'); if (!el) return;
  const t0 = performance.now();
  const hide = () => setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 500); }, Math.max(0, 1600 - (performance.now() - t0)));
  if (document.readyState === 'complete') hide(); else window.addEventListener('load', hide);
})();
