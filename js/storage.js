/* GymTrack – tallennuskerros
 *
 * Kaikki tallennus kulkee tämän moduulin kautta. Sovelluksen muu koodi ei
 * koske localStorageen suoraan. Pilvisynkronointi voidaan lisätä myöhemmin
 * rekisteröimällä uusi adapteri (Store.registerSync), jolle välitetään jokainen
 * tallennettu tila. Adapterin pitää toteuttaa push(state) ja halutessaan
 * pull() → Promise<state|null>.
 */
(function () {
  'use strict';

  const KEY = 'gymtrack.v1';
  const SCHEMA_VERSION = 1;

  const localAdapter = {
    name: 'local',
    read() {
      try {
        const raw = localStorage.getItem(KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        console.error('Lukuvirhe', e);
        return null;
      }
    },
    write(state) {
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
        return true;
      } catch (e) {
        console.error('Tallennusvirhe', e);
        return false;
      }
    }
  };

  const syncAdapters = [];
  const listeners = [];
  let state = null;
  let saveTimer = null;

  function migrate(data) {
    if (!data || typeof data !== 'object') return null;
    if (!data.schema) data.schema = 1;
    // Tulevat skeemamuutokset tähän: if (data.schema < 2) { ...; data.schema = 2; }
    return data;
  }

  function flush() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!state) return;
    state.updatedAt = new Date().toISOString();
    const ok = localAdapter.write(state);
    if (!ok && window.GT && GT.ui) GT.ui.toast('Tallennus epäonnistui – tallennustila voi olla täynnä', 'error');
    syncAdapters.forEach(a => {
      try { a.push && a.push(state); } catch (e) { console.warn('Synkronointivirhe', a.name, e); }
    });
  }

  const Store = {
    SCHEMA_VERSION,

    init(createDefault) {
      state = migrate(localAdapter.read());
      if (!state) {
        state = createDefault();
        state.schema = SCHEMA_VERSION;
        flush();
      }
      // Tallenna aina ennen kuin sivu suljetaan tai siirtyy taustalle
      window.addEventListener('pagehide', flush);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flush();
      });
      return state;
    },

    get() { return state; },

    /** Muutos tilaan + automaattinen tallennus (debounce 250 ms). */
    update(mutator) {
      if (mutator) mutator(state);
      clearTimeout(saveTimer);
      saveTimer = setTimeout(flush, 250);
      listeners.forEach(fn => fn(state));
    },

    saveNow() { flush(); },

    onChange(fn) { listeners.push(fn); },

    exportJSON() {
      flush();
      return JSON.stringify({
        app: 'GymTrack',
        exportedAt: new Date().toISOString(),
        schema: SCHEMA_VERSION,
        data: state
      }, null, 2);
    },

    importJSON(text) {
      const parsed = JSON.parse(text);
      const data = parsed && parsed.app === 'GymTrack' ? parsed.data : parsed;
      if (!data || !Array.isArray(data.workouts) || !Array.isArray(data.sessions)) {
        throw new Error('Tiedosto ei ole GymTrack-varmuuskopio');
      }
      state = migrate(data);
      flush();
      listeners.forEach(fn => fn(state));
      return state;
    },

    reset(createDefault) {
      state = createDefault();
      state.schema = SCHEMA_VERSION;
      flush();
      listeners.forEach(fn => fn(state));
    },

    /** Pilvisynkronoinnin liityntäkohta tulevaisuutta varten. */
    registerSync(adapter) {
      syncAdapters.push(adapter);
      if (adapter.pull) {
        adapter.pull().then(remote => {
          if (remote && (!state.updatedAt || remote.updatedAt > state.updatedAt)) {
            state = migrate(remote);
            localAdapter.write(state);
            listeners.forEach(fn => fn(state));
          }
        }).catch(e => console.warn('Synkronoinnin haku epäonnistui', e));
      }
    }
  };

  window.GT = window.GT || {};
  GT.Store = Store;
})();
