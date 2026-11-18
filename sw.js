/* Applications PWA — instant offline-first shell.
   All five PWAs share a GitHub Pages origin, so caches are strictly namespaced.
   This service worker controls ONLY /applications/. */
const PREFIX = "applications-shell-";
const CACHE = PREFIX + "v12-sudoku-tab";
const SHELL = ["./", "./index.html", "./manifest.webmanifest",
  "./icon.svg", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(Promise.all([
    caches.keys().then(names => Promise.all(names
      .filter(name => name.startsWith(PREFIX) && name !== CACHE)
      .map(name => caches.delete(name)))),
    self.clients.claim()
  ]));
});

self.addEventListener("fetch", event => {
  const req = event.request;
  const url = new URL(req.url);
  const scope = new URL(self.registration.scope);
  if (req.method !== "GET" || url.origin !== scope.origin ||
      !url.pathname.startsWith(scope.pathname)) return;

  // Always request the latest launcher HTML online. Keep a saved fallback
  // for offline opening, without touching any of the independent apps' data.
  if(req.mode==="navigate"){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      try{
        const response=await fetch(req,{cache:"no-store"});
        if(response.ok&&response.type==="basic"){
          try{await cache.put("./index.html",response.clone())}catch(_){}
        }
        return response;
      }catch{
        return await cache.match("./index.html")||await cache.match("./")||Response.error();
      }
    })());
    return;
  }
  const network = fetch(req, {cache:"no-cache"}).then(async response => {
    if(response.ok && response.type === "basic") {
      try {
        const cache = await caches.open(CACHE);
        await cache.put(req, response.clone());
      } catch (_) {}
    }
    return response;
  });
  event.waitUntil(network.then(() => {}, () => {}));

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (req.cache !== "reload" && req.cache !== "no-store") {
      const cached = await cache.match(req, {ignoreSearch:req.mode === "navigate"}) ||
        (req.mode === "navigate" ? await cache.match("./index.html") : null);
      if (cached) return cached;
    }
    try { return await network; }
    catch {
      return await cache.match(req, {ignoreSearch:req.mode === "navigate"}) ||
        (req.mode === "navigate" ? await cache.match("./index.html") : null) ||
        Response.error();
    }
  })());
});
