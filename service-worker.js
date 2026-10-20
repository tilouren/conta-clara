"use strict";

const CACHE_PREFIX = "conta-clara-app-";
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./statement-import.js",
  "./market-quotes.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./vendor/pdf.mjs",
  "./vendor/pdf.worker.mjs"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const requestUrl = new URL(request.url);
  if (request.method !== "GET" || requestUrl.origin !== self.location.origin
    || requestUrl.pathname.startsWith("/api/")) return;

  const networkResponse = fetch(request).then(response => {
    if (!response.ok || response.type === "opaque") return response;
    return caches.open(CACHE_NAME).then(cache => {
      return cache.put(request, response.clone()).catch(error => {
        console.warn("Não foi possível guardar um recurso para utilização offline.", error);
      }).then(() => response);
    });
  });
  event.waitUntil(networkResponse.then(() => undefined).catch(() => undefined));
  event.respondWith(networkResponse.catch(async () => {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) return cachedResponse;
    if (request.mode === "navigate") {
      const cachedApp = await caches.match("./index.html");
      if (cachedApp) return cachedApp;
    }
    return new Response("Este recurso ainda não está disponível neste dispositivo sem ligação.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }));
});
