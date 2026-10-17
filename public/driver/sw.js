// No caches, background sync or private-response storage. Offline navigation is generic.
self.addEventListener("install", (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || event.request.mode !== "navigate" || url.origin !== self.location.origin || (url.pathname !== "/driver" && !url.pathname.startsWith("/driver/"))) return;
  event.respondWith(fetch(event.request).catch(() => new Response(
    '<!doctype html><html lang="pt"><meta name="viewport" content="width=device-width, initial-scale=1"><title>TourFlow — sem ligação</title><main><h1>Sem ligação</h1><p>Volte a ligar à internet e atualize a página. Nenhuma etapa foi guardada offline.</p><button onclick="location.reload()">Tentar novamente</button></main></html>',
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }, status: 503 },
  )));
});
