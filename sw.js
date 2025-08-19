const COURSE_CACHE = 'course-cache-v1'

self.addEventListener('install', e => {
  self.skipWaiting()
})
self.addEventListener('activate', e => {
  clients.claim()
})

self.addEventListener('message', async (event) => {
  const data = event.data || {}
  if (data.type === 'cacheCourse') {
    const cache = await caches.open(COURSE_CACHE)
    for (const f of data.files) {
      const resp = new Response(new Blob([f.data], { type: f.type || 'application/octet-stream' }))
      await cache.put(new Request(f.path, {mode:'same-origin'}), resp)
    }
    event.ports && event.ports[0] && event.ports[0].postMessage({ ok:true })
  }
  if (data.type === 'simulateXapi') {
    const ev = data.event || {}
    const all = await clients.matchAll()
    all.forEach(c => c.postMessage({ type:'xapi', event: ev }))
  }
})

// Intercept course asset requests + /xapi POST
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  // Serve cached uploaded course files
  if (url.pathname.startsWith('/courses/')) {
    event.respondWith((async () => {
      const cache = await caches.open(COURSE_CACHE)
      const hit = await cache.match(event.request)
      if (hit) return hit
      return new Response('Not found in cache', { status: 404 })
    })())
    return
  }

  // Fake xAPI endpoint (capture and notify app)
  if (url.pathname === '/xapi' && event.request.method === 'POST') {
    event.respondWith((async () => {
      try {
        const text = await event.request.clone().text()
        let stmt = {}
        try { stmt = JSON.parse(text) } catch {}
        const verbId = stmt?.verb?.id || ''
        const verb = verbId.split('/').pop()
        const msg = {
          verb,
          objectId: stmt?.object?.id || 'object',
          success: stmt?.result?.success,
          score: stmt?.result?.score || {},
          registration: stmt?.context?.registration
        }
        const all = await clients.matchAll()
        all.forEach(c => c.postMessage({ type:'xapi', event: msg }))
      } catch (e) {
        // ignore
      }
      return new Response('', { status: 204 })
    })())
    return
  }
})
