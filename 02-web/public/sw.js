const CACHE = 'chatcal-v3'
const SHELL = ['/', '/app.js', '/style.css', '/manifest.json']

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  // 非 GET 不攔截，直接走網路
  if (e.request.method !== 'GET') return

  const url = new URL(e.request.url)

  // API 走 network-first；/api/auth 不快取（密碼狀態會變動）
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (url.pathname !== '/api/auth') {
            const clone = res.clone()
            caches.open(CACHE).then(c => c.put(e.request, clone))
          }
          return res
        })
        .catch(() => caches.match(e.request))
    )
    return
  }

  // 靜態資源 cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached
      return fetch(e.request).then(res => {
        const clone = res.clone()
        caches.open(CACHE).then(c => c.put(e.request, clone))
        return res
      })
    })
  )
})
