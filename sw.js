// Service worker: guarda la app en caché para que funcione sin conexión.
// IMPORTANTE: sube VERSION cada vez que publiques cambios, para que el iPhone descargue la nueva versión.

const VERSION = "v0.16.1";
const CACHE = `panel-de-vida-${VERSION}`;

const FILES = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/tokens.css",
  "css/base.css",
  "css/components.css",
  "css/desktop.css",
  "fonts/inter-latin.woff2",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
  "js/app.js",
  "js/db.js",
  "js/state.js",
  "js/game.js",
  "js/ui.js",
  "js/backup.js",
  "js/quickadd.js",
  "js/sidebar.js",
  "js/sync.js",
  "js/inbox.js",
  "js/hevy.js",
  "js/icons.js",
  "js/charts.js",
  "js/stats.js",
  "js/demo.js",
  "js/finance.js",
  "js/work.js",
  "js/forms.js",
  "js/habits.js",
  "js/sport.js",
  "js/agenda.js",
  "js/celebrate.js",
  "js/views/area.js",
  "js/views/resumen.js",
  "js/views/finanzas.js",
  "js/views/finanzas-forms.js",
  "js/views/trabajo.js",
  "js/views/trabajo-forms.js",
  "js/views/habitos.js",
  "js/views/habitos-forms.js",
  "js/views/deporte-forms.js",
  "js/views/agenda.js",
  "js/views/agenda-forms.js",
  "js/views/ajustes.js",
  "js/views/logros.js",
  "js/views/sync-ui.js",
  "js/views/atajos.js",
  "js/views/hevy-ui.js",
  "js/views/nutricion.js",
  "js/views/tendencia.js",
  "js/views/semana.js",
  "js/trends.js"
];

self.addEventListener("install", event => {
  // cache: "reload" evita copiar archivos viejos de la caché HTTP del navegador
  event.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("panel-de-vida-") && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Primero la red (para tener siempre la última versión) y, sin conexión, la copia guardada.
// Si la red tarda más de 3 s, se usa la copia para no dejar la app en blanco.
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  event.respondWith(networkFirst(event, req));
});

async function networkFirst(event, req) {
  const cache = await caches.open(CACHE);
  const network = fetch(req, { cache: "no-cache" }).then(res => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  event.waitUntil(network.catch(() => {}));
  const timeout = new Promise(resolve => setTimeout(resolve, 3000));
  try {
    const res = await Promise.race([network, timeout]);
    if (res) return res;
  } catch { /* sin conexión */ }
  const hit = await cache.match(req, { ignoreSearch: true }) ||
    (req.mode === "navigate" ? await cache.match("index.html") : null);
  if (hit) return hit;
  return network.catch(() => Response.error());
}
