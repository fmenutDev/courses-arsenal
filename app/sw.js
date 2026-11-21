/* Cache hors connexion de Courses Arsenal.
   Les fichiers de l'application sont servis depuis le cache puis rafraîchis en arrière-plan.
   Les données passent par Supabase (jamais mises en cache ici) ; l'application garde sa propre copie locale.
   Changer VERSION à chaque mise en ligne pour forcer la mise à jour. */
const VERSION = 'courses-v1';
const SHELL = ['./', './index.html', './app.js', './store.js', './config.js', '../data/catalogue.json',
  './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET') return;
  const cacheable = u.origin === location.origin || u.host === 'cdn.jsdelivr.net' || u.host === 'fonts.googleapis.com' || u.host === 'fonts.gstatic.com';
  if (!cacheable) return;                      // Supabase et le reste : réseau direct
  e.respondWith(caches.open(VERSION).then(async c => {
    const hit = await c.match(r, { ignoreSearch: u.origin === location.origin });
    const net = fetch(r).then(res => { if (res && (res.ok || res.type === 'opaque')) c.put(r, res.clone()); return res }).catch(() => null);
    return hit || (await net) || new Response('Hors connexion', { status: 503 });
  }));
});
