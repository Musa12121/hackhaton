// HesabCheck REST API müştərisi. Bütün yollar Swagger sxemindəki (/api/docs/) endpoint-lərə uyğundur.
// Sorğular Vite proxy-dən keçir: proxy backend-ə .env-dəki hesabla özü qoşulub token əlavə edir,
// ona görə brauzerdə giriş ekranı və token yoxdur (bax: vite.config.js).

const BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
export class ApiError extends Error {
  constructor(message, status, body) {
    super(message)
    this.status = status
    this.body = body
  }
}

// DRF xətaları müxtəlif formada gəlir: {detail}, ["mesaj"], {sahə: ["mesaj"]}, {data: "mesaj"}.
function errorMessage(body, status) {
  if (!body) return `Server xətası (${status}).`
  if (typeof body === 'string') return body.slice(0, 300) || `Server xətası (${status}).`
  if (Array.isArray(body)) return body.map((item) => errorMessage(item, status)).join(' ')
  if (body.detail) return String(body.detail)
  const parts = Object.entries(body).map(([field, value]) => {
    const text = flatten(value)
    return field === 'non_field_errors' ? text : `${fieldLabel(field)}: ${text}`
  })
  return parts.join(' · ') || `Server xətası (${status}).`
}

function flatten(value) {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.map(flatten).join(' ')
  if (typeof value === 'object') return Object.values(value).map(flatten).join(' ')
  return String(value)
}

function fieldLabel(field) {
  return {
    title: 'Başlıq', supplier: 'Təchizatçı', kind: 'Sənəd növü',
    file: 'Fayl', data: 'Məlumat', note: 'Qeyd', revision: 'Revision', decision: 'Qərar', mappings: 'Uyğunlaşdırma',
  }[field] || field
}

const AUTH_HELP = 'Backend girişi alınmadı. hackhaton/.env faylında HESABCHECK_USERNAME və HESABCHECK_PASSWORD (və ya HESABCHECK_TOKEN) yazın və npm run dev-i yenidən başladın.'

async function request(path, { method = 'GET', json, form, raw = false } = {}) {
  const headers = { Accept: 'application/json' }

  let body
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(json)
  } else if (form) {
    body = form
  }

  let response
  try {
    response = await fetch(`${BASE_URL}${path}`, { method, headers, body })
  } catch {
    throw new ApiError('Serverə qoşulmaq alınmadı. İnternet bağlantısını və API ünvanını yoxlayın.', 0, null)
  }

  if (raw && response.ok) return response

  const text = await response.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  if (!response.ok) {
    const message = response.status === 401 ? AUTH_HELP : errorMessage(data, response.status)
    throw new ApiError(message, response.status, data)
  }
  return data
}

const casePath = (id, suffix = '') => `/api/cases/${encodeURIComponent(id)}/${suffix}`

export const api = {
  // GET /api/cases/?page= → PaginatedCaseList
  listCases(page = 1) {
    return request(`/api/cases/?page=${page}`)
  },

  // POST /api/cases/ → Case (201)
  createCase({ title, supplier }) {
    return request('/api/cases/', { method: 'POST', json: { title, supplier } })
  },

  // GET /api/cases/{id}/ → Case
  getCase(id) {
    return request(casePath(id))
  },

  // DELETE /api/cases/{id}/ → 204
  deleteCase(id) {
    return request(casePath(id), { method: 'DELETE' })
  },

  // POST /api/cases/{id}/documents/ (multipart: kind, file) → Document
  uploadDocument(id, kind, file) {
    const form = new FormData()
    form.append('kind', kind)
    form.append('file', file)
    return request(casePath(id, 'documents/'), { method: 'POST', form })
  },

  // POST /api/cases/{id}/bundle/ (multipart: file) → Case — bir faylda olan sənədləri AI ayırır
  uploadBundle(id, file) {
    const form = new FormData()
    form.append('file', file)
    return request(casePath(id, 'bundle/'), { method: 'POST', form })
  },

  // POST /api/cases/{id}/document-data/ { kind, data, note } → Document
  saveDocumentData(id, { kind, data, note }) {
    return request(casePath(id, 'document-data/'), { method: 'POST', json: { kind, data, note } })
  },

  // POST /api/cases/{id}/extract/ → Case (sinxron, uzun çəkə bilər)
  extract(id) {
    return request(casePath(id, 'extract/'), { method: 'POST' })
  },

  // POST /api/cases/{id}/suggestions/ → { suggestions[], usage, revision, requires_human_confirmation }
  suggestions(id) {
    return request(casePath(id, 'suggestions/'), { method: 'POST' })
  },

  // POST /api/cases/{id}/compare/ { revision?, mappings? } → Case (qəbul sənədi yoxdursa mappings-də receipt olmur)
  compare(id, payload = {}) {
    return request(casePath(id, 'compare/'), { method: 'POST', json: payload })
  },

  // POST /api/cases/{id}/review/ { revision, decision, note } → Case
  review(id, { revision, decision, note }) {
    return request(casePath(id, 'review/'), { method: 'POST', json: { revision, decision, note } })
  },

  // GET /api/cases/{id}/report/ → { case_id, title, supplier, report, decision, decision_note }
  getReport(id) {
    return request(casePath(id, 'report/'))
  },

  // POST /api/cases/{id}/dispute-letter/ → { subject, body, is_draft, generator, sent }
  disputeLetter(id) {
    return request(casePath(id, 'dispute-letter/'), { method: 'POST' })
  },

  // GET /api/cases/{id}/history/ → Event[] (server massiv qaytarır; səhifələnmiş formanı da qəbul edirik)
  async history(id) {
    const data = await request(casePath(id, 'history/'))
    return Array.isArray(data) ? data : data?.results || []
  },

  // GET /api/cases/{id}/documents/{document_id}/download/ → fayl
  async downloadDocument(id, documentId, fallbackName) {
    const response = await request(casePath(id, `documents/${encodeURIComponent(documentId)}/download/`), { raw: true })
    const blob = await response.blob()
    const disposition = response.headers.get('Content-Disposition') || ''
    const match = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i)
    const filename = match ? decodeURIComponent(match[1] || match[2]) : fallbackName || 'sened'
    saveBlob(blob, filename)
  },
}

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
