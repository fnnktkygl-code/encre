const CACHE_NAME = 'encre-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Handle Web Share Target POST requests
  if (event.request.method === 'POST' && url.pathname === '/') {
    event.respondWith((async () => {
      const formData = await event.request.formData();
      const mediaFiles = formData.getAll('media');
      
      // Store in Cache Storage temporarily for main page to retrieve
      const cache = await caches.open('encre-shared-files');
      for (let i = 0; i < mediaFiles.length; i++) {
        const file = mediaFiles[i];
        if (file && file.size > 0) {
          const fileUrl = `/shared-file-${Date.now()}-${i}`;
          await cache.put(fileUrl, new Response(file, {
            headers: {
              'content-type': file.type || 'image/png',
              'x-file-name': encodeURIComponent(file.name || 'shared-image')
            }
          }));
        }
      }
      return Response.redirect('/?shared=true', 303);
    })());
    return;
  }

  // Handle GET requests (Cache First with Network Fallback)
  if (event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          // Fetch update in background (Stale-While-Revalidate)
          fetch(event.request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
            }
          }).catch(() => {/* offline fallback */});
          return cachedResponse;
        }

        return fetch(event.request).then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return networkResponse;
        }).catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
        });
      })
    );
  }
});
