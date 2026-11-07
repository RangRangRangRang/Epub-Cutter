/* Chạy offline. Khi sửa code, đổi số V để máy người dùng cập nhật. */
const V='epub-cut-v7';
const FILES=['./','index.html','manifest.json','assets/style.css','assets/icon-192.png','assets/icon-512.png','assets/js/jszip.min.js','assets/js/epub-read.js','assets/js/epub-clean.js','assets/js/epub-build.js','assets/js/app.js'];
self.addEventListener('install',e=>e.waitUntil(caches.open(V).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method==='GET')e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)))});
