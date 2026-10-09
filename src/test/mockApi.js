import { vi } from 'vitest'

const REPLY = Symbol('reply')
const SEQUENCE = Symbol('sequence')

/** Status kodu, başlıqlar və ya xam (JSON olmayan) gövdə ilə cavab. */
export function reply(status, body, { headers = {}, raw } = {}) {
  return { [REPLY]: true, status, body, headers, raw }
}

/** Hər çağırışda növbəti cavab; sonuncu təkrarlanır. */
export function sequence(...responses) {
  return { [SEQUENCE]: responses }
}

/**
 * Saxta backend: global fetch-i əvəz edir və sorğuları "METHOD /path" açarı ilə cavablandırır.
 *
 *   const server = mockApi({
 *     'GET /api/cases/': { results: [] },                       // 200 JSON
 *     'POST /api/cases/': reply(201, newCase),                  // status + gövdə
 *     'POST /api/cases/:id/compare/': (request) => ({ ... }),   // funksiya: sorğuya görə cavab
 *   })
 *   server.calls('POST /api/cases/:id/compare/')[0].json       // göndərilən JSON
 *
 * Yolda ":id" istənilən seqmentə uyğun gəlir. Ardıcıl fərqli cavablar üçün sequence(a, b) istifadə edin.
 */
export function mockApi(routes = {}) {
  const table = { ...routes }
  const log = []
  const counters = {}

  function find(method, path) {
    return Object.keys(table).find((key) => {
      const [routeMethod, routePath] = key.split(' ')
      if (routeMethod !== method) return false
      const pattern = new RegExp(`^${routePath.replace(/:[a-z_]+/g, '[^/]+').replace(/\?/g, '\\?')}$`)
      return pattern.test(path)
    })
  }

  const fetchMock = vi.fn(async (url, init = {}) => {
    const method = (init.method || 'GET').toUpperCase()
    const path = String(url).replace(/^https?:\/\/[^/]+/, '')
    const request = {
      method,
      path,
      headers: init.headers || {},
      body: init.body,
      json: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      form: init.body instanceof FormData ? init.body : undefined,
    }
    const key = find(method, path)
    log.push({ ...request, key })
    if (!key) throw new Error(`mockApi: gözlənilməyən sorğu ${method} ${path}`)

    let spec = table[key]
    if (spec?.[SEQUENCE]) {
      const responses = spec[SEQUENCE]
      counters[key] = (counters[key] || 0) + 1
      spec = responses[Math.min(counters[key], responses.length) - 1]
    }
    if (typeof spec === 'function') spec = await spec(request)
    if (spec instanceof Error) throw spec
    const envelope = spec?.[REPLY] ? spec : reply(200, spec)
    const { status, headers } = envelope
    if (envelope.raw !== undefined) return new Response(envelope.raw, { status, headers })
    const body = envelope.body
    return new Response(status === 204 || body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...headers },
    })
  })

  vi.stubGlobal('fetch', fetchMock)

  return {
    fetch: fetchMock,
    on(key, spec) {
      table[key] = spec
      delete counters[key]
    },
    calls(key) {
      return log.filter((entry) => entry.key === key)
    },
    get log() {
      return log
    },
  }
}
