/* Courses Arsenal : données et synchronisation.
   - Mode « démonstration » (pas de Supabase configuré) : tout reste dans ce navigateur.
   - Mode « partagé » : cache local + file d'attente des modifications + temps réel Supabase.
   L'application modifie directement l'objet renvoyé par Store.data() puis appelle Store.save().
   Store compare avec le dernier état connu du serveur et envoie seulement les différences. */
const Store = (() => {
  const CFG = window.COURSES_CONFIG || {};
  const LOCAL_KEY = 'courses-arsenal-maquette-v1';
  // Avec le faux Supabase de test, chaque onglet joue une personne différente : cache séparé par onglet.
  const NS = window.FakeSupabase ? (() => { let n = sessionStorage.getItem('fake-ns'); if (!n) { n = Math.random().toString(36).slice(2, 7); sessionStorage.setItem('fake-ns', n) } return n + ':' })() : '';
  const K = { me: NS + 'courses-me', data: NS + 'courses-data', base: NS + 'courses-base', out: NS + 'courses-outbox' };
  const PK = { articles: ['foyer_id', 'id'], listes: ['foyer_id', 'id'], lignes: ['foyer_id', 'liste_id', 'id'] };
  const TABLES = ['articles', 'listes', 'lignes'];

  let mode = 'local', sb = null, me = null, gate = null, BASE = null, hooks = {};
  let db = { articles: [], listes: [] }, base = {}, out = {};
  let status = 'ok', flushing = false, channel = null, timer = null;

  const read = k => { try { return JSON.parse(localStorage.getItem(k) || 'null') } catch (e) { return null } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true } catch (e) { return false } };
  const clone = o => JSON.parse(JSON.stringify(o));
  const configured = () => !!window.FakeSupabase || !!(CFG.supabaseUrl && CFG.supabaseKey && window.supabase);
  const setStatus = s => { status = s; hooks.onStatus && hooks.onStatus() };

  /* ---------- Conversion objets <-> lignes de tables ---------- */
  const rowArticle = a => ({ foyer_id: me.foyer_id, id: a.id, nom: a.nom, rayon: a.rayon, position: a.position ?? 0, unite: a.unite || 'unité',
    quantite: +a.quantite || 0, priorite: a.priorite ?? 1, propose: !!a['proposé'], commentaire: a.commentaire || '', photo: a.photo || null,
    emplacement_ordre: a.emplacement_ordre ?? null });
  const rowListe = l => ({ foyer_id: me.foyer_id, id: l.id, nom: l.nom, cree: l.cree, statut: l.statut, termine: l.termine || null });
  const rowLigne = (l, x) => ({ foyer_id: me.foyer_id, liste_id: l.id, id: x.id, article: x.article || null, nom: x.nom, rayon: x.rayon,
    quantite: +x.quantite || 0, unite: x.unite || 'unité', commentaire: x.commentaire || '', coche: !!x.coche, manquant: !!x.manquant,
    coche_par: x.coche_par || null, ajoute_par: x.ajoute_par || null, ajoute: x.ajoute || null });
  const artFrom = r => ({ id: r.id, nom: r.nom, rayon: r.rayon, position: r.position, unite: r.unite, quantite: +r.quantite, priorite: r.priorite,
    'proposé': !!r.propose, commentaire: r.commentaire || '', photo: r.photo || null, emplacement_ordre: r.emplacement_ordre ?? null });
  const ligneFrom = r => ({ id: r.id, article: r.article, nom: r.nom, rayon: r.rayon, quantite: +r.quantite, unite: r.unite, commentaire: r.commentaire || '',
    coche: !!r.coche, manquant: !!r.manquant, coche_par: r.coche_par || null, ajoute_par: r.ajoute_par || null, ajoute: r.ajoute || null });
  const sortLignes = l => l.lignes.sort((a, b) => String(a.ajoute || '').localeCompare(String(b.ajoute || '')));
  const keyOf = (t, r) => t === 'articles' ? 'a:' + r.id : t === 'listes' ? 'L:' + r.id : 'l:' + r.liste_id + ':' + r.id;
  const tableOf = k => k[0] === 'a' ? 'articles' : k[0] === 'L' ? 'listes' : 'lignes';

  function rowsOf() {
    const m = new Map();
    db.articles.forEach(a => m.set('a:' + a.id, { t: 'articles', row: rowArticle(a) }));
    db.listes.forEach(l => {
      m.set('L:' + l.id, { t: 'listes', row: rowListe(l) });
      l.lignes.forEach(x => m.set('l:' + l.id + ':' + x.id, { t: 'lignes', row: rowLigne(l, x) }));
    });
    return m;
  }
  function putInDb(t, r) {
    if (t === 'articles') { const i = db.articles.findIndex(a => a.id === r.id), a = artFrom(r); i >= 0 ? db.articles[i] = a : db.articles.push(a); return }
    if (t === 'listes') {
      const l = db.listes.find(x => x.id === r.id);
      const v = { nom: r.nom, cree: r.cree, statut: r.statut, termine: r.termine || undefined };
      if (l) Object.assign(l, v); else db.listes.push({ id: r.id, ...v, lignes: [] });
      return;
    }
    const l = db.listes.find(x => x.id === r.liste_id); if (!l) return;
    const i = l.lignes.findIndex(x => x.id === r.id), x = ligneFrom(r);
    i >= 0 ? l.lignes[i] = x : l.lignes.push(x); sortLignes(l);
  }
  function dropFromDb(t, r) {
    if (t === 'articles') db.articles = db.articles.filter(a => a.id !== r.id);
    else if (t === 'listes') db.listes = db.listes.filter(l => l.id !== r.id);
    else { const l = db.listes.find(x => x.id === r.liste_id); if (l) l.lignes = l.lignes.filter(x => x.id !== r.id) }
  }
  const persist = () => { write(K.data, db); write(K.base, base); write(K.out, out) };

  /* ---------- Envoi des modifications ---------- */
  function track() {
    const cur = rowsOf();
    for (const [k, v] of cur) { const j = JSON.stringify(v.row); if (base[k] !== j && !(out[k] && out[k].j === j)) out[k] = { t: v.t, op: 'up', row: v.row, j } }
    for (const k in base) if (!cur.has(k) && !(out[k] && out[k].op === 'del')) out[k] = { t: tableOf(k), op: 'del', row: JSON.parse(base[k]) };
    for (const k in out) if (out[k].op === 'up' && !cur.has(k)) delete out[k];   // créé puis supprimé avant l'envoi
    persist(); flush();
  }
  async function flush() {
    if (mode !== 'shared' || !me || flushing) return;
    if (!Object.keys(out).length) { if (status !== 'offline') setStatus('ok'); return }
    if (!navigator.onLine) { setStatus('offline'); return }
    flushing = true; setStatus('sync');
    try {
      const ops = Object.entries(out);
      for (const t of TABLES) {
        const batch = ops.filter(([, o]) => o.op === 'up' && o.t === t); if (!batch.length) continue;
        const { error } = await sb.from(t).upsert(batch.map(([, o]) => o.row), { onConflict: PK[t].join(',') });
        if (error) throw error;
        batch.forEach(([k, o]) => { base[k] = o.j; if (out[k] === o) delete out[k] });
      }
      for (const t of [...TABLES].reverse()) {
        for (const [k, o] of ops.filter(([, o]) => o.op === 'del' && o.t === t)) {
          let q = sb.from(t).delete(); PK[t].forEach(c => { q = q.eq(c, o.row[c]) });
          const { error } = await q; if (error) throw error;
          delete base[k]; if (out[k] === o) delete out[k];
        }
      }
      persist(); setStatus('ok');
    } catch (e) {
      console.warn('Synchronisation', e); persist(); setStatus(navigator.onLine ? 'error' : 'offline');
    } finally { flushing = false }
    if (Object.keys(out).length && status === 'ok') flush();
  }

  /* ---------- Réception ---------- */
  async function pull() {
    if (mode !== 'shared' || !me || !navigator.onLine) return;
    try {
      const res = await Promise.all(TABLES.map(t => sb.from(t).select('*').eq('foyer_id', me.foyer_id)));
      const err = res.find(r => r.error); if (err) throw err.error;
      const [A, L, X] = res.map(r => r.data || []);
      db.articles = A.map(artFrom);
      db.listes = L.map(r => ({ id: r.id, nom: r.nom, cree: r.cree, statut: r.statut, termine: r.termine || undefined,
        lignes: X.filter(x => x.liste_id === r.id).map(ligneFrom) }));
      db.listes.forEach(sortLignes);
      base = {}; for (const [k, v] of rowsOf()) base[k] = JSON.stringify(v.row);
      for (const k in out) { const o = out[k]; o.op === 'up' ? putInDb(o.t, o.row) : dropFromDb(o.t, o.row) }
      if (!A.length && !Object.keys(out).some(k => k[0] === 'a')) {   // nouveau foyer : on y verse le catalogue
        db.articles = clone(BASE.articles); track();
      } else { persist(); flush() }
      hooks.onChange && hooks.onChange();
      if (status !== 'sync') setStatus(Object.keys(out).length ? status : 'ok');
    } catch (e) { console.warn('Lecture', e); setStatus(navigator.onLine ? 'error' : 'offline') }
  }
  function onRemote(t, p) {
    const ev = p.eventType, r = ev === 'DELETE' ? p.old : p.new;
    if (!r || (r.foyer_id && r.foyer_id !== me.foyer_id)) return;
    const k = keyOf(t, r); if (out[k]) return;            // notre version locale en attente prime
    if (ev === 'DELETE') { dropFromDb(t, r); delete base[k] }
    else { putInDb(t, r); const v = rowsOf().get(k); if (v) base[k] = JSON.stringify(v.row) }
    persist(); hooks.onChange && hooks.onChange();
  }
  function connect() {
    if (channel) { try { sb.removeChannel(channel) } catch (e) {} }
    channel = sb.channel('foyer-' + me.foyer_id);
    TABLES.forEach(t => channel.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: 'foyer_id=eq.' + me.foyer_id }, p => onRemote(t, p)));
    channel.subscribe();
    pull();
    clearInterval(timer); timer = setInterval(() => { if (Object.keys(out).length) flush() }, 15000);
  }
  window.addEventListener('online', () => { if (mode === 'shared' && me) flush().then(pull) });
  window.addEventListener('offline', () => { if (mode === 'shared') setStatus('offline') });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && mode === 'shared' && me) flush().then(pull) });

  /* ---------- Connexion ---------- */
  const rpc = async (name, args) => { const { data, error } = await sb.rpc(name, args || {}); if (error) throw error; return data };
  async function afterAuth() {
    const p = await rpc('mon_profil');
    if (!p) { gate = 'foyer'; return }
    setProfile(p);
  }
  function setProfile(p) {
    if (me && me.foyer_id !== p.foyer_id) { db.articles = []; db.listes = []; base = {}; out = {} }
    me = p; write(K.me, me); gate = null; connect();
  }

  return {
    async init(catalogue, h) {
      BASE = catalogue; hooks = h || {};
      if (!configured()) {
        mode = 'local'; const saved = read(LOCAL_KEY);
        db = saved && saved.articles ? saved : clone({ articles: BASE.articles });
        return;
      }
      mode = 'shared';
      sb = window.FakeSupabase ? window.FakeSupabase.createClient() : window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey);
      me = read(K.me); db = read(K.data) || { articles: [], listes: [] }; base = read(K.base) || {}; out = read(K.out) || {};
      let session = null;
      try { session = (await sb.auth.getSession()).data.session } catch (e) {}
      if (!session) { me = null; gate = 'email'; return }
      if (!navigator.onLine && me) { gate = null; setStatus('offline'); return }
      try { await afterAuth() } catch (e) { if (me) { gate = null; connect() } else gate = 'email' }
    },
    isShared: () => mode === 'shared',
    gate: () => gate,
    data: () => db,
    save(d) {
      if (d !== db) Object.assign(db, { articles: d.articles, listes: d.listes });
      if (mode === 'local') return write(LOCAL_KEY, { articles: db.articles, listes: db.listes });
      if (!me) return true;
      track(); return true;
    },
    resetLocal() { try { localStorage.removeItem(LOCAL_KEY) } catch (e) {} db = clone({ articles: BASE.articles }) },
    prenom: () => (me && me.prenom) || '',
    profile: () => me,
    pending: () => Object.keys(out).length,
    statusText() {
      if (mode === 'local') return 'Sur cet appareil';
      const n = Object.keys(out).length, w = n ? ` · ${n} modification${n > 1 ? 's' : ''} en attente` : '';
      if (status === 'offline' || !navigator.onLine) return 'Hors connexion' + w;
      if (status === 'sync') return 'Synchronisation…';
      if (status === 'error') return 'Synchronisation en échec, nouvel essai bientôt' + w;
      return n ? 'En attente d\'envoi' + w : 'À jour';
    },
    async sendCode(email) { const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } }); if (error) throw error },
    async verify(email, token) { const { error } = await sb.auth.verifyOtp({ email, token, type: 'email' }); if (error) throw error; await afterAuth() },
    async createFoyer(prenom, nom) { setProfile(await rpc('creer_foyer', { p_prenom: prenom, p_nom: nom || 'Notre foyer' })) },
    async joinFoyer(code, prenom) { setProfile(await rpc('rejoindre_foyer', { p_code: code, p_prenom: prenom })) },
    async setPrenom(p) { me = await rpc('changer_prenom', { p_prenom: p }); write(K.me, me) },
    members: () => rpc('membres_du_foyer'),
    async syncNow() { await flush(); await pull() },
    async email() { try { return (await sb.auth.getSession()).data.session.user.email } catch (e) { return '' } },
    async logout() {
      try { if (channel) sb.removeChannel(channel) } catch (e) {}
      clearInterval(timer); channel = null;
      try { await sb.auth.signOut() } catch (e) {}
      Object.values(K).forEach(k => { try { localStorage.removeItem(k) } catch (e) {} });
      me = null; db = { articles: [], listes: [] }; base = {}; out = {}; gate = 'email';
    }
  };
})();
