/* Faux Supabase pour les tests locaux uniquement (ouvrir l'application avec ?fake).
   - « Base » partagée entre onglets dans localStorage, temps réel par BroadcastChannel.
   - Session par onglet (sessionStorage) : deux onglets = deux personnes.
   - Le code reçu par e-mail est toujours 123456.
   - window.FAKE_OFFLINE = true simule une coupure réseau. */
(() => {
  const DBK = 'fake-sb-db', SK = 'fake-sb-session';
  const bc = new BroadcastChannel('fake-sb');
  const listeners = [];
  const load = () => JSON.parse(localStorage.getItem(DBK) || 'null') || { users: {}, foyers: [], membres: [], articles: [], listes: [], lignes: [] };
  const store = db => localStorage.setItem(DBK, JSON.stringify(db));
  const session = () => JSON.parse(sessionStorage.getItem(SK) || 'null');
  const uid = () => (session() || {}).user?.id;
  const myFoyer = db => (db.membres.find(m => m.user_id === uid()) || {}).foyer_id;
  const offline = () => window.FAKE_OFFLINE ? { data: null, error: { message: 'Failed to fetch' } } : null;
  const PK = { articles: ['foyer_id', 'id'], listes: ['foyer_id', 'id'], lignes: ['foyer_id', 'liste_id', 'id'] };
  const same = (t, a, b) => PK[t].every(c => a[c] === b[c]);
  const emit = msg => { bc.postMessage(msg); setTimeout(() => deliver(msg), 0) };
  const deliver = msg => listeners.forEach(l => { if (l.table === msg.table) l.cb({ eventType: msg.eventType, new: msg.new, old: msg.old }) });
  bc.onmessage = e => deliver(e.data);
  const profil = db => {
    const m = db.membres.find(x => x.user_id === uid()); if (!m) return null;
    const f = db.foyers.find(x => x.id === m.foyer_id);
    return { user_id: m.user_id, foyer_id: m.foyer_id, prenom: m.prenom, foyer_nom: f.nom, code: f.code };
  };
  const delay = v => new Promise(r => setTimeout(() => r(v), 60));

  class Q {
    constructor(t) { this.t = t; this.f = []; this.op = 'select' }
    select() { this.op = 'select'; return this }
    eq(c, v) { this.f.push([c, v]); return this }
    upsert(rows) { this.op = 'upsert'; this.rows = rows; return this }
    delete() { this.op = 'delete'; return this }
    then(ok, ko) { return delay(this.run()).then(ok, ko) }
    run() {
      const off = offline(); if (off) return off;
      const db = load(), f = myFoyer(db), t = this.t;
      if (!uid() || !f) return { data: null, error: { message: 'Non autorisé' } };
      const match = r => r.foyer_id === f && this.f.every(([c, v]) => r[c] === v);
      if (this.op === 'select') return { data: db[t].filter(match).map(r => ({ ...r })), error: null };
      if (this.op === 'upsert') {
        for (const r of this.rows) {
          if (r.foyer_id !== f) return { data: null, error: { message: 'RLS : foyer interdit' } };
          if (t === 'lignes' && !db.listes.some(l => l.foyer_id === f && l.id === r.liste_id)) return { data: null, error: { message: 'Liste inconnue' } };
        }
        for (const r of this.rows) {
          const i = db[t].findIndex(x => same(t, x, r)), row = { ...r, maj: new Date().toISOString() };
          const ev = i >= 0 ? 'UPDATE' : 'INSERT'; i >= 0 ? db[t][i] = row : db[t].push(row);
          emit({ table: t, eventType: ev, new: row, old: {} });
        }
        store(db); return { data: null, error: null };
      }
      if (this.op === 'delete') {
        const gone = db[t].filter(match); db[t] = db[t].filter(r => !match(r));
        if (t === 'listes') gone.forEach(l => { const g = db.lignes.filter(x => x.foyer_id === f && x.liste_id === l.id);
          db.lignes = db.lignes.filter(x => !(x.foyer_id === f && x.liste_id === l.id));
          g.forEach(x => emit({ table: 'lignes', eventType: 'DELETE', new: {}, old: { foyer_id: x.foyer_id, liste_id: x.liste_id, id: x.id } })) });
        store(db); gone.forEach(r => emit({ table: t, eventType: 'DELETE', new: {}, old: Object.fromEntries(PK[t].map(c => [c, r[c]])) }));
        return { data: null, error: null };
      }
    }
  }

  const RPC = {
    mon_profil: db => ({ data: profil(db), error: null }),
    creer_foyer(db, a) {
      if (!a.p_prenom) return { data: null, error: { message: 'Prénom requis' } };
      const id = crypto.randomUUID(), code = Math.random().toString(16).slice(2, 8).toUpperCase();
      db.foyers.push({ id, nom: a.p_nom || 'Notre foyer', code }); db.membres.push({ user_id: uid(), foyer_id: id, prenom: a.p_prenom, cree: Date.now() });
      store(db); return { data: profil(db), error: null };
    },
    rejoindre_foyer(db, a) {
      const f = db.foyers.find(x => x.code === String(a.p_code).toUpperCase()); if (!f) return { data: null, error: { message: 'Code inconnu' } };
      db.membres = db.membres.filter(m => m.user_id !== uid()); db.membres.push({ user_id: uid(), foyer_id: f.id, prenom: a.p_prenom, cree: Date.now() });
      store(db); return { data: profil(db), error: null };
    },
    changer_prenom(db, a) { const m = db.membres.find(x => x.user_id === uid()); m.prenom = a.p_prenom; store(db); return { data: profil(db), error: null } },
    membres_du_foyer(db) { const f = myFoyer(db); return { data: db.membres.filter(m => m.foyer_id === f).map(m => ({ prenom: m.prenom, moi: m.user_id === uid() })), error: null } }
  };

  window.FakeSupabase = {
    createClient: () => ({
      auth: {
        getSession: async () => ({ data: { session: session() }, error: null }),
        signInWithOtp: async ({ email }) => offline() || (console.info('[faux Supabase] code pour', email, ': 123456'), { data: {}, error: null }),
        verifyOtp: async ({ email, token }) => {
          const off = offline(); if (off) return off;
          if (token !== '123456') return { data: null, error: { message: 'Token has expired or is invalid' } };
          const db = load(); db.users[email] = db.users[email] || crypto.randomUUID(); store(db);
          sessionStorage.setItem(SK, JSON.stringify({ user: { id: db.users[email], email } })); return { data: {}, error: null };
        },
        signOut: async () => { sessionStorage.removeItem(SK); return { error: null } }
      },
      rpc: async (name, args) => offline() || delay(RPC[name](load(), args || {})),
      from: t => new Q(t),
      channel: () => { const subs = []; const ch = {
        on: (_, cfg, cb) => { subs.push({ table: cfg.table, cb }); return ch },
        subscribe: () => { subs.forEach(s => listeners.push(s)); return ch },
        _subs: subs }; return ch },
      removeChannel: ch => { (ch._subs || []).forEach(s => { const i = listeners.indexOf(s); if (i >= 0) listeners.splice(i, 1) }) }
    })
  };
})();
