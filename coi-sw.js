/*
 * Cross-origin isolation service worker.
 * Adds COOP/COEP headers to every same-origin response so the page becomes
 * crossOriginIsolated, which unlocks SharedArrayBuffer and the multithreaded
 * ffmpeg engine (several times faster than the single-threaded one).
 * COEP is "credentialless" so cross-origin assets (fonts, ffmpeg core) keep loading.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  // Skip requests the browser forbids us to touch.
  if (request.cache === "only-if-cached" && request.mode !== "same-origin") return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Opaque cross-origin responses can't be modified; credentialless COEP allows them as-is.
        if (response.status === 0) return response;
        const headers = new Headers(response.headers);
        headers.set("Cross-Origin-Embedder-Policy", "credentialless");
        headers.set("Cross-Origin-Opener-Policy", "same-origin");
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      })
      .catch(() => Response.error()),
  );
});
