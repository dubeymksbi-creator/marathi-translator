const CACHE_NAME = 'bhashasetu-cache-v3';
const urlsToCache = [
  './',
  './index.html',
  './styles.css',
  './frontend.js',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  // Only intercept GET requests (ignore API POST requests etc.)
  if (event.request.method !== 'GET') {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
