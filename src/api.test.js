import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api, saveBlob } from './api'
import { CASE_ID, makeCase } from './test/fixtures'
import { mockApi, reply, sequence } from './test/mockApi'

const CASE = `/api/cases/${CASE_ID}/`

describe('sorğular', () => {
  it('JSON göndərir; brauzer token göndərmir (onu Vite proxy əlavə edir)', async () => {
    const server = mockApi({ 'POST /api/cases/': reply(201, makeCase()) })
    const created = await api.createCase({ title: 'Ofis', supplier: 'MMC' })
    const [request] = server.calls('POST /api/cases/')
    expect(request.headers).toEqual({ Accept: 'application/json', 'Content-Type': 'application/json' })
    expect(request.json).toEqual({ title: 'Ofis', supplier: 'MMC' })
    expect(created.id).toBe(CASE_ID)
  })

  it.each([
    ['listCases', () => api.listCases(2), 'GET', '/api/cases/?page=2'],
    ['getCase', () => api.getCase(CASE_ID), 'GET', CASE],
    ['deleteCase', () => api.deleteCase(CASE_ID), 'DELETE', CASE],
    ['extract', () => api.extract(CASE_ID), 'POST', `${CASE}extract/`],
    ['suggestions', () => api.suggestions(CASE_ID), 'POST', `${CASE}suggestions/`],
    ['getReport', () => api.getReport(CASE_ID), 'GET', `${CASE}report/`],
    ['disputeLetter', () => api.disputeLetter(CASE_ID), 'POST', `${CASE}dispute-letter/`],
  ])('%s → %s %s', async (_, call, method, path) => {
    const server = mockApi({ [`${method} ${path}`]: method === 'DELETE' ? reply(204) : {} })
    await call()
    expect(server.log).toHaveLength(1)
    expect(server.log[0]).toMatchObject({ method, path })
  })

  it('204 cavabı null qaytarır', async () => {
    mockApi({ [`DELETE ${CASE}`]: reply(204) })
    await expect(api.deleteCase(CASE_ID)).resolves.toBeNull()
  })

  it('compare, review və document-data JSON gövdəsini Swagger-dəki kimi göndərir', async () => {
    const server = mockApi({
      [`POST ${CASE}compare/`]: makeCase(),
      [`POST ${CASE}review/`]: makeCase(),
      [`POST ${CASE}document-data/`]: {},
    })
    await api.compare(CASE_ID)
    await api.compare(CASE_ID, { revision: 3, mappings: [{ order: 0, invoice: 0 }] })
    await api.review(CASE_ID, { revision: 4, decision: 'disputed', note: 'Etiraz', extra: 'ignored' })
    await api.saveDocumentData(CASE_ID, { kind: 'order', data: { lines: [] }, note: 'Manual' })
    const [auto, manual] = server.calls(`POST ${CASE}compare/`)
    expect(auto.json).toEqual({})
    expect(manual.json).toEqual({ revision: 3, mappings: [{ order: 0, invoice: 0 }] })
    expect(server.calls(`POST ${CASE}review/`)[0].json).toEqual({ revision: 4, decision: 'disputed', note: 'Etiraz' })
    expect(server.calls(`POST ${CASE}document-data/`)[0].json).toEqual({ kind: 'order', data: { lines: [] }, note: 'Manual' })
  })

  it('fayl yükləmələri multipart göndərir (Content-Type brauzerə qalır)', async () => {
    const server = mockApi({ [`POST ${CASE}documents/`]: reply(201, {}), [`POST ${CASE}bundle/`]: makeCase() })
    const file = new File(['%PDF-'], 'sifaris.pdf', { type: 'application/pdf' })
    await api.uploadDocument(CASE_ID, 'order', file)
    await api.uploadBundle(CASE_ID, file)
    const upload = server.calls(`POST ${CASE}documents/`)[0]
    expect(upload.form.get('kind')).toBe('order')
    expect(upload.form.get('file').name).toBe('sifaris.pdf')
    expect(upload.headers['Content-Type']).toBeUndefined()
    expect(server.calls(`POST ${CASE}bundle/`)[0].form.get('file').name).toBe('sifaris.pdf')
  })

  it('tarixçəni həm massiv, həm səhifələnmiş formada qəbul edir', async () => {
    const event = { id: 1, action: 'created' }
    mockApi({ [`GET ${CASE}history/`]: sequence([event], { count: 1, results: [event] }, {}) })
    expect(await api.history(CASE_ID)).toEqual([event])
    expect(await api.history(CASE_ID)).toEqual([event])
    expect(await api.history(CASE_ID)).toEqual([])
  })
})

describe('xəta mesajları', () => {
  it.each([
    ['detail', { detail: 'Əvvəl müqayisəni başladın.' }, 'Əvvəl müqayisəni başladın.'],
    ['sahə xətası', { title: ['Bu sahə tələb olunur.'] }, 'Başlıq: Bu sahə tələb olunur.'],
    ['iç-içə sahə', { data: { data: 'currency: ISO kodu' } }, 'Məlumat: currency: ISO kodu'],
    ['non_field_errors', { non_field_errors: ['Giriş mümkün olmadı.'] }, 'Giriş mümkün olmadı.'],
    ['siyahı', ['Birinci.', 'İkinci.'], 'Birinci. İkinci.'],
    ['naməlum sahə', { foo: 'bar' }, 'foo: bar'],
    ['mətn cavab', 'Bad Gateway', 'Bad Gateway'],
    ['boş cavab', undefined, 'Server xətası (500).'],
  ])('%s', async (_, body, message) => {
    const raw = typeof body === 'string' ? body : body === undefined ? '' : JSON.stringify(body)
    mockApi({ 'GET /api/cases/?page=1': reply(body === undefined ? 500 : 400, undefined, { raw }) })
    const error = await api.listCases(1).catch((caught) => caught)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.message).toBe(message)
  })

  it('status və gövdəni saxlayır', async () => {
    mockApi({ [`POST ${CASE}compare/`]: reply(409, { detail: 'Köhnə revision' }) })
    const error = await api.compare(CASE_ID, {}).catch((caught) => caught)
    expect(error.status).toBe(409)
    expect(error.body).toEqual({ detail: 'Köhnə revision' })
  })

  it('şəbəkə xətasını anlaşılan mesaja çevirir', async () => {
    mockApi({ 'GET /api/cases/?page=1': new TypeError('Failed to fetch') })
    const error = await api.listCases(1).catch((caught) => caught)
    expect(error.status).toBe(0)
    expect(error.message).toMatch(/Serverə qoşulmaq alınmadı/)
  })

  it('401 olduqda .env-dəki backend hesabını yoxlamağı deyir', async () => {
    mockApi({ 'GET /api/cases/?page=1': reply(401, { detail: 'Authentication credentials were not provided.' }) })
    const error = await api.listCases(1).catch((caught) => caught)
    expect(error.status).toBe(401)
    expect(error.message).toMatch(/HESABCHECK_USERNAME və HESABCHECK_PASSWORD/)
  })
})

describe('fayl endirmə', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }))
  })

  it.each([
    ['attachment; filename="faktura.pdf"', 'faktura.pdf'],
    ["attachment; filename*=UTF-8''sifari%C5%9F.pdf", 'sifariş.pdf'],
    [null, 'ehtiyat.pdf'],
  ])('Content-Disposition %s → %s', async (disposition, expected) => {
    mockApi({
      [`GET ${CASE}documents/doc-1/download/`]: reply(200, undefined, { raw: '%PDF-', headers: disposition ? { 'Content-Disposition': disposition } : {} }),
    })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    let downloaded
    click.mockImplementation(function () { downloaded = this.download })
    await api.downloadDocument(CASE_ID, 'doc-1', 'ehtiyat.pdf')
    expect(downloaded).toBe(expected)
    expect(URL.createObjectURL).toHaveBeenCalled()
  })

  it('endirmə xətasını ApiError kimi qaytarır', async () => {
    mockApi({ [`GET ${CASE}documents/doc-1/download/`]: reply(400, { detail: 'Bu sənəd manual daxil edilib; fayl yoxdur.' }) })
    await expect(api.downloadDocument(CASE_ID, 'doc-1')).rejects.toThrow('fayl yoxdur')
  })

  it('saveBlob linki yaradıb silir', () => {
    vi.useFakeTimers()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    saveBlob(new Blob(['{}']), 'hesabat.json')
    expect(click).toHaveBeenCalledOnce()
    expect(document.querySelector('a')).toBeNull()
    vi.runAllTimers()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x')
    vi.useRealTimers()
  })
})
