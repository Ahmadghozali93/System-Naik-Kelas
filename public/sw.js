// Basic Service Worker for PWA — Network-first strategy
// Naikkan versi ini setiap rilis yang mengubah cara aplikasi menulis data.
// Handler 'activate' di bawah menghapus semua cache yang namanya != CACHE_NAME,
// jadi menaikkan angkanya memaksa setiap perangkat membuang aset lamanya saat
// service worker baru aktif. Selama nilainya tidak berubah, aset lama menumpuk
// di perangkat tanpa pernah dibersihkan — itu yang bikin sebagian guru masih
// memegang bundel JS lama berhari-hari setelah rilis 0017/0019.
const CACHE_NAME = 'bimbel-app-cache-v4';
const urlsToCache = [
    '/vite.svg'
];

self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                return cache.addAll(urlsToCache);
            })
    );
});

self.addEventListener('fetch', event => {
    const requestUrl = new URL(event.request.url);

    // Jangan cache panggilan API / lintas-origin (mis. Supabase) atau method non-GET.
    // Ini mencegah data basi dan respons sensitif tersimpan di disk browser.
    const isSameOrigin = requestUrl.origin === self.location.origin;
    if (event.request.method !== 'GET' || !isSameOrigin) {
        return; // biarkan browser menanganinya langsung ke jaringan
    }

    // For navigation requests (HTML pages), always go network-first
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).catch(() => {
                return caches.match('/index.html');
            })
        );
        return;
    }

    // For other requests, try network first, fallback to cache
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Optionally cache the response
                if (response.ok) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                return caches.match(event.request);
            })
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});
