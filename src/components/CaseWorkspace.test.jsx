import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  CASE_ID, documentData, extractedDocument, makeCase, makeDocument, matchedReport, mismatchReport, readyCase, unmatchedReport,
} from '../test/fixtures'
import { mockApi, reply, sequence } from '../test/mockApi'
import CaseWorkspace from './CaseWorkspace'

const CASE = `/api/cases/${CASE_ID}/`
const LABELS = { order: 'Satınalma sifarişi', receipt: 'Qəbul sənədi', invoice: 'Faktura' }

async function renderWorkspace(caseData = makeCase(), routes = {}, props = {}) {
  const server = mockApi({ [`GET ${CASE}`]: caseData, [`GET ${CASE}history/`]: [], ...routes })
  const handlers = { onBack: vi.fn(), onChanged: vi.fn(), onDelete: vi.fn(), ...props }
  const user = userEvent.setup()
  render(<CaseWorkspace caseId={CASE_ID} {...handlers} />)
  await screen.findByRole('heading', { level: 1, name: caseData.title })
  return { server, user, ...handlers }
}

const card = (kind) => screen.getByRole('heading', { level: 3, name: LABELS[kind] }).closest('.doc-card')
const fileInput = (kind) => within(card(kind)).getByLabelText(/Fayl seç|Faylı əvəzlə/)
const pdf = (name = 'sened.pdf') => new File(['%PDF-1.7'], name, { type: 'application/pdf' })
const button = (name) => screen.getByRole('button', { name })
/** Səhifənin yuxarısındakı əməliyyat bildirişi (sənəd kartlarındakı xətalardan fərqli). */
async function notice() {
  await waitFor(() => expect(document.querySelector('.sticky-notice .notice')).not.toBeNull())
  return document.querySelector('.sticky-notice .notice')
}

describe('yüklənmə və başlıq', () => {
  it('yüklənərkən gözləmə mətni, sonra başlıq, təchizatçı, status və revision', async () => {
    mockApi({ [`GET ${CASE}`]: readyCase({ status: 'mismatch', revision: 7 }), [`GET ${CASE}history/`]: [] })
    render(<CaseWorkspace caseId={CASE_ID} />)
    expect(screen.getByText('Yüklənir…')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 1, name: 'Ofis kağızı alışı' })).toBeInTheDocument()
    expect(screen.getByText('Təchizatçı: Demo Təchizatçı MMC')).toBeInTheDocument()
    expect(screen.getByText('Uyğunsuzluq', { selector: '.header-meta strong' })).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
  })

  it('yükləmə xətasında mesaj və geri düyməsi', async () => {
    mockApi({ [`GET ${CASE}`]: reply(404, { detail: 'Tapılmadı.' }), [`GET ${CASE}history/`]: [] })
    const onBack = vi.fn()
    render(<CaseWorkspace caseId={CASE_ID} onBack={onBack} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Tapılmadı.')
    await userEvent.click(button('← Yoxlamalara qayıt'))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('"Yenilə" yoxlamanı yenidən yükləyir, "Yoxlamanı sil" onDelete çağırır', async () => {
    const { server, user, onDelete } = await renderWorkspace()
    const header = within(screen.getByRole('heading', { level: 1 }).closest('header'))
    await user.click(header.getByRole('button', { name: 'Yenilə' }))
    await waitFor(() => expect(server.calls(`GET ${CASE}`)).toHaveLength(2))
    await user.click(button('Yoxlamanı sil'))
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: CASE_ID }))
  })
})

describe('sənəd kartları', () => {
  it('hər sənədin vəziyyətini, faylını və AI istifadəsini göstərir', async () => {
    await renderWorkspace(makeCase({
      documents: [
        extractedDocument('order'),
        makeDocument('receipt', { original_name: 'grn.jpg', extraction_status: 'failed', error: 'Şəkil oxunmur.' }),
      ],
    }))
    expect(within(card('order')).getByText('AI ilə oxundu')).toBeInTheDocument()
    expect(within(card('order')).getByText(/order\.pdf/)).toBeInTheDocument()
    expect(within(card('order')).getByText(/1800 token/)).toBeInTheDocument()
    expect(within(card('receipt')).getByText('Çıxarış uğursuz')).toBeInTheDocument()
    expect(within(card('receipt')).getByRole('alert')).toHaveTextContent('Şəkil oxunmur.')
    expect(within(card('invoice')).getByText('Yüklənməyib')).toBeInTheDocument()
  })

  it('oxunmuş məlumatı cədvəl, ƏDV, qeydlər və xəbərdarlıqlarla göstərir', async () => {
    const data = documentData('invoice', { tax_total: '0.00', notes: ['Ödəniş 15 gün ərzində'], warnings: ['Səhifə 2 bulanıqdır'] })
    await renderWorkspace(makeCase({ documents: [extractedDocument('invoice', { data })] }))
    const invoice = within(card('invoice'))
    expect(invoice.getByText('DEMO-INVOICE-001')).toBeInTheDocument()
    expect(invoice.getByText(/ƏDV:/).querySelector('b')).toHaveTextContent(/^0[,.]00 AZN$/)
    expect(invoice.getByRole('cell', { name: /A4 kağız 80 q\/m²/ })).toBeInTheDocument()
    expect(invoice.getByText('Ödəniş 15 gün ərzində').closest('ul')).toHaveClass('note-list')
    expect(invoice.getByText('Səhifə 2 bulanıqdır').closest('ul')).toHaveClass('warning-list')
  })

  it('birləşmiş fayldan gələn sənədin səhifələrini göstərir', async () => {
    await renderWorkspace(makeCase({ documents: [extractedDocument('receipt', { original_name: 'scan.pdf', usage: { bundle: true, pages: [2, 3] } })] }))
    expect(within(card('receipt')).getByText('Birləşmiş fayldan · səh. 2, 3')).toBeInTheDocument()
  })

  it('faylı multipart göndərir, yoxlamanı yeniləyir və bildiriş verir', async () => {
    const updated = makeCase({ revision: 1, documents: [makeDocument('order', { original_name: 'sifaris.pdf' })] })
    const { server, user, onChanged } = await renderWorkspace(makeCase(), {
      [`POST ${CASE}documents/`]: reply(201, makeDocument('order')),
      [`GET ${CASE}`]: sequence(makeCase(), updated),
    })
    await user.upload(fileInput('order'), pdf('sifaris.pdf'))
    expect(await notice()).toHaveTextContent('Satınalma sifarişi yükləndi.')
    const form = server.calls(`POST ${CASE}documents/`)[0].form
    expect(form.get('kind')).toBe('order')
    expect(form.get('file').name).toBe('sifaris.pdf')
    expect(within(card('order')).getByText(/sifaris\.pdf/)).toBeInTheDocument()
    expect(onChanged).toHaveBeenCalled()
  })

  it('10 MB-dan böyük faylı serverə göndərmir', async () => {
    const { server, user } = await renderWorkspace()
    const big = pdf('big.pdf')
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 })
    await user.upload(fileInput('invoice'), big)
    expect(await notice()).toHaveTextContent('Maksimum fayl ölçüsü 10 MB-dır.')
    expect(server.calls(`POST ${CASE}documents/`)).toHaveLength(0)
  })

  it('server faylı rədd edəndə səbəbi göstərir', async () => {
    const { user } = await renderWorkspace(makeCase(), {
      [`POST ${CASE}documents/`]: reply(400, { file: ['Etibarlı fayl yükləyin.'] }),
    })
    await user.upload(fileInput('order'), pdf())
    expect(await notice()).toHaveTextContent('Fayl: Etibarlı fayl yükləyin.')
  })

  it('"Endir" orijinal faylı endirir', async () => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }))
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const { server, user } = await renderWorkspace(readyCase(), {
      [`GET ${CASE}documents/doc-order/download/`]: reply(200, undefined, { raw: '%PDF-' }),
    })
    await user.click(within(card('order')).getByRole('button', { name: 'Endir' }))
    await waitFor(() => expect(server.calls(`GET ${CASE}documents/doc-order/download/`)).toHaveLength(1))
  })
})

describe('manual məlumat redaktoru', () => {
  it('boş şablonla açılır, nümunə yükləyir və qeydlə yadda saxlayır', async () => {
    const { server, user } = await renderWorkspace(makeCase(), {
      [`POST ${CASE}document-data/`]: makeDocument('order'),
      [`GET ${CASE}`]: sequence(makeCase(), makeCase({ documents: [extractedDocument('order', { extraction_status: 'manual' })] })),
    })
    await user.click(within(card('order')).getByRole('button', { name: 'Manual daxil et' }))
    const editor = within(card('order'))
    const textarea = editor.getByRole('textbox', { name: '' })
    expect(JSON.parse(textarea.value).lines[0].quantity).toBeNull()
    expect(editor.getByLabelText('Düzəliş qeydi (məcburi)')).toHaveValue('Manual daxil edildi')
    await user.click(editor.getByRole('button', { name: 'Nümunə yüklə' }))
    expect(JSON.parse(textarea.value).document_number).toBe('DEMO-ORDER-001')
    await user.click(editor.getByRole('button', { name: 'Yadda saxla' }))
    const body = server.calls(`POST ${CASE}document-data/`)[0].json
    expect(body).toMatchObject({ kind: 'order', note: 'Manual daxil edildi' })
    expect(body.data.lines[0].quantity).toBe('100')
    expect(await within(card('order')).findByText('Manual daxil edilib')).toBeInTheDocument()
  })

  it('etibarsız JSON-u göndərmir, qeyd boş olanda düymə bağlıdır', async () => {
    const { server, user } = await renderWorkspace(readyCase())
    await user.click(within(card('invoice')).getByRole('button', { name: 'Məlumatı düzəlt' }))
    const editor = within(card('invoice'))
    const note = editor.getByLabelText('Düzəliş qeydi (məcburi)')
    expect(note).toHaveValue('')
    expect(editor.getByRole('button', { name: 'Yadda saxla' })).toBeDisabled()
    const textarea = editor.getByRole('textbox', { name: '' })
    await user.clear(textarea)
    await user.click(textarea)
    await user.paste('{ bu JSON deyil')
    await user.type(note, 'Düzəliş')
    await user.click(editor.getByRole('button', { name: 'Yadda saxla' }))
    expect(editor.getByRole('alert')).toHaveTextContent('JSON düzgün deyil')
    expect(server.calls(`POST ${CASE}document-data/`)).toHaveLength(0)
  })

  it('"Demo məlumatla doldur" üç sənədi ardıcıl yazır', async () => {
    const { server, user } = await renderWorkspace(makeCase(), { [`POST ${CASE}document-data/`]: {} })
    await user.click(button('Demo məlumatla doldur'))
    expect(await notice()).toHaveTextContent('Demo məlumatları üç sənədə yazıldı')
    expect(server.calls(`POST ${CASE}document-data/`).map((call) => call.json.kind)).toEqual(['order', 'receipt', 'invoice'])
  })
})

describe('AI oxuma və avtomatik müqayisə', () => {
  it('fayl yoxdursa oxuma bağlıdır və nəyin lazım olduğu yazılır', async () => {
    await renderWorkspace()
    expect(button('AI ilə oxu və müqayisə et')).toBeDisabled()
    expect(screen.getByText('Əvvəl ən azı bir fayl yükləyin.')).toBeInTheDocument()
    expect(button('Müqayisə et')).toBeDisabled()
    expect(screen.getByText('Lazımdır: Sifariş, Faktura.')).toBeInTheDocument()
  })

  it('bütün sənədlər oxunanda müqayisəni avtomatik aparır', async () => {
    const uploaded = makeCase({ documents: ['order', 'receipt', 'invoice'].map((kind) => makeDocument(kind, { original_name: `${kind}.pdf` })) })
    const { server, user } = await renderWorkspace(uploaded, {
      [`POST ${CASE}extract/`]: readyCase(),
      [`POST ${CASE}compare/`]: readyCase({ status: 'mismatch', revision: 4, report: mismatchReport() }),
    })
    await user.click(button('AI ilə oxu və müqayisə et'))
    expect(await notice()).toHaveTextContent('AI yüklənmiş sənədləri oxudu və müqayisə avtomatik aparıldı.')
    expect(server.calls(`POST ${CASE}compare/`)[0].json).toEqual({})
    expect(screen.getByRole('heading', { name: 'Uyğunsuzluq', level: 2 })).toBeInTheDocument()
    expect(screen.getAllByText(/240[,.]00 AZN/).length).toBeGreaterThan(0)
  })

  it('tək fayl oxunanda müqayisə etmir və çatışmayan sənədi deyir', async () => {
    const { server, user } = await renderWorkspace(makeCase({ documents: [makeDocument('order', { original_name: 'o.pdf' })] }), {
      [`POST ${CASE}extract/`]: makeCase({ documents: [extractedDocument('order')] }),
    })
    await user.click(button('AI ilə oxu və müqayisə et'))
    expect(await notice()).toHaveTextContent('Müqayisə üçün hələ lazımdır: Faktura')
    expect(server.calls(`POST ${CASE}compare/`)).toHaveLength(0)
  })

  it('oxunmayan sənədi adı ilə bildirir və müqayisə etmir', async () => {
    const { server, user } = await renderWorkspace(readyCase(), {
      [`POST ${CASE}extract/`]: readyCase({ documents: [extractedDocument('order'), makeDocument('invoice', { original_name: 'i.pdf', extraction_status: 'failed', error: 'Kvota' })] }),
    })
    await user.click(button('AI ilə oxu və müqayisə et'))
    expect(await notice()).toHaveTextContent('amma Faktura oxunmadı')
    expect(server.calls(`POST ${CASE}compare/`)).toHaveLength(0)
  })

  it('AI xidməti əlçatan olmayanda serverin mesajını göstərir', async () => {
    const { user } = await renderWorkspace(readyCase(), { [`POST ${CASE}extract/`]: reply(503, { detail: 'GEMINI_API_KEY təyin edilməyib.' }) })
    await user.click(button('AI ilə oxu və müqayisə et'))
    expect(await notice()).toHaveTextContent('GEMINI_API_KEY təyin edilməyib.')
  })

  it('revision konfliktində (409) məlumatı yeniləyir və yenidən cəhd etməyi deyir', async () => {
    const { server, user } = await renderWorkspace(readyCase(), {
      [`POST ${CASE}compare/`]: reply(409, { detail: 'Köhnə revision.' }),
    })
    await user.click(button('Müqayisə et'))
    expect(await notice()).toHaveTextContent('Köhnə revision. Məlumatlar yeniləndi, yenidən cəhd edin.')
    await waitFor(() => expect(server.calls(`GET ${CASE}`)).toHaveLength(2))
  })
})

describe('AI uyğunlaşdırma təklifləri', () => {
  const suggestionsResponse = (items) => ({ suggestions: items, discarded: 0, revision: 4, requires_human_confirmation: true, usage: {} })
  const item = (extra = {}) => ({ order: 0, receipt: 0, invoice: 0, reason: 'Eyni A4 kağız', confidence: 0.95, ...extra })

  it('uyğunlaşdırılmayan sətirlər qalanda təklifləri özü gətirir və təsdiqlə müqayisə edir', async () => {
    const compared = readyCase({ status: 'needs_review', revision: 4, report: unmatchedReport() })
    const { server, user } = await renderWorkspace(readyCase(), {
      [`POST ${CASE}compare/`]: sequence(compared, readyCase({ status: 'mismatch', revision: 5, report: mismatchReport() })),
      [`POST ${CASE}suggestions/`]: suggestionsResponse([item()]),
    })
    await user.click(button('Müqayisə et'))
    expect(await notice()).toHaveTextContent('AI adları fərqli olan 1 məhsulu uyğunlaşdırdı')
    expect(screen.getByRole('heading', { name: 'AI 1 məhsulu uyğunlaşdırdı' })).toBeInTheDocument()
    expect(screen.getByText(/Eyni A4 kağız · Əminlik: 95%/)).toBeInTheDocument()
    expect(screen.getByText('AI uyğunlaşdırması təsdiq gözləyir')).toBeInTheDocument()

    await user.click(button('Təsdiqlə və müqayisə et'))
    expect(await notice()).toHaveTextContent('AI uyğunlaşdırması təsdiqləndi')
    expect(server.calls(`POST ${CASE}compare/`)[1].json).toEqual({ revision: 4, mappings: [{ order: 0, receipt: 0, invoice: 0 }] })
    expect(screen.queryByText('AI uyğunlaşdırması təsdiq gözləyir')).not.toBeInTheDocument()
  })

  it('banner düyməsi də bütün təklifləri təsdiqləyir', async () => {
    const { server, user } = await renderWorkspace(readyCase(), {
      [`POST ${CASE}compare/`]: sequence(readyCase({ status: 'needs_review', revision: 4, report: unmatchedReport() }), readyCase({ revision: 5, report: mismatchReport() })),
      [`POST ${CASE}suggestions/`]: suggestionsResponse([item()]),
    })
    await user.click(button('Müqayisə et'))
    await user.click(await screen.findByRole('button', { name: '1 uyğunlaşdırmanı təsdiqlə' }))
    await waitFor(() => expect(server.calls(`POST ${CASE}compare/`)).toHaveLength(2))
  })

  it('işarəsi götürülən təklif göndərilmir; heç biri seçilməyəndə təsdiq bağlıdır', async () => {
    const { server, user } = await renderWorkspace(readyCase(), {
      [`POST ${CASE}compare/`]: readyCase({ status: 'needs_review', revision: 4, report: unmatchedReport() }),
      [`POST ${CASE}suggestions/`]: suggestionsResponse([item(), item({ order: 1, receipt: 1, invoice: 1, reason: 'Toner' })]),
    })
    await user.click(button('Müqayisə et'))
    const [first, second] = await screen.findAllByRole('checkbox')
    await user.click(first)
    await user.click(second)
    expect(button('Təsdiqlə və müqayisə et')).toBeDisabled()
    await user.click(first)
    await user.click(button('Təsdiqlə və müqayisə et'))
    await waitFor(() => expect(server.calls(`POST ${CASE}compare/`)).toHaveLength(2))
    expect(server.calls(`POST ${CASE}compare/`)[1].json.mappings).toEqual([{ order: 0, receipt: 0, invoice: 0 }])
  })

  it('qəbul sənədi olmayanda uyğunlaşdırma yalnız sifariş və fakturanı göndərir', async () => {
    const twoWayCase = readyCase({ documents: [extractedDocument('order'), extractedDocument('invoice')] })
    const { server, user } = await renderWorkspace(twoWayCase, {
      [`POST ${CASE}compare/`]: { ...twoWayCase, status: 'needs_review', revision: 4, report: unmatchedReport(['order', 'invoice']) },
      [`POST ${CASE}suggestions/`]: suggestionsResponse([{ order: 0, invoice: 0, reason: 'Eyni', confidence: 0.9 }]),
    })
    expect(screen.getByText(/Qəbul sənədi yoxdur: sifariş ↔ faktura/)).toBeInTheDocument()
    await user.click(button('Müqayisə et'))
    await user.click(await screen.findByRole('button', { name: 'Təsdiqlə və müqayisə et' }))
    await waitFor(() => expect(server.calls(`POST ${CASE}compare/`)).toHaveLength(2))
    expect(server.calls(`POST ${CASE}compare/`)[1].json.mappings).toEqual([{ order: 0, invoice: 0 }])
  })

  it('təklif xidməti xəta versə də müqayisə nəticəsi göstərilir', async () => {
    const { user } = await renderWorkspace(readyCase(), {
      [`POST ${CASE}compare/`]: readyCase({ status: 'needs_review', revision: 4, report: unmatchedReport() }),
      [`POST ${CASE}suggestions/`]: reply(503, { detail: 'Kvota bitib' }),
    })
    await user.click(button('Müqayisə et'))
    expect(await notice()).toHaveTextContent('Avtomatik müqayisə tamamlandı.')
    expect(screen.queryByText('AI uyğunlaşdırması təsdiq gözləyir')).not.toBeInTheDocument()
  })

  it('"Təklif al" təklifləri əl ilə gətirir, "Əl ilə düzəlişə köçür" redaktoru doldurur', async () => {
    const { user } = await renderWorkspace(readyCase(), { [`POST ${CASE}suggestions/`]: suggestionsResponse([item()]) })
    await user.click(button('Təklif al'))
    await user.click(await screen.findByRole('button', { name: 'Əl ilə düzəlişə köçür' }))
    const editor = screen.getByRole('heading', { name: 'Sətir uyğunlaşdırması' }).closest('.mapping-editor')
    expect(within(editor).getAllByRole('combobox').map((select) => select.value)).toEqual(['0', '0', '0'])
  })

  it('AI heç nə tapmayanda bunu deyir', async () => {
    const { user } = await renderWorkspace(readyCase(), { [`POST ${CASE}suggestions/`]: suggestionsResponse([]) })
    await user.click(button('Təklif al'))
    expect(await screen.findByText('AI əmin olduğu uyğunluq tapmadı.')).toBeInTheDocument()
  })
})

describe('manual sətir uyğunlaşdırması', () => {
  it('sətir əlavə edib seçimləri revision ilə göndərir', async () => {
    const { server, user } = await renderWorkspace(readyCase(), { [`POST ${CASE}compare/`]: readyCase({ report: mismatchReport() }) })
    const compareManual = button('Bu uyğunlaşdırma ilə müqayisə et')
    expect(compareManual).toBeDisabled()
    await user.click(button('+ Sətir əlavə et'))
    const editor = within(screen.getByRole('heading', { name: 'Sətir uyğunlaşdırması' }).closest('.mapping-editor'))
    for (const label of ['Sifariş', 'Qəbul', 'Faktura']) {
      await user.selectOptions(editor.getByLabelText(label), '0')
    }
    expect(within(editor.getByLabelText('Qəbul')).getByRole('option', { name: /1\. A4 kağız 80 q\/m² \(80\)/ })).toBeInTheDocument()
    await user.click(compareManual)
    await waitFor(() => expect(server.calls(`POST ${CASE}compare/`)).toHaveLength(1))
    expect(server.calls(`POST ${CASE}compare/`)[0].json).toEqual({ revision: 3, mappings: [{ order: 0, receipt: 0, invoice: 0 }] })
  })

  it('cari hesabatdan doldurur və sətri silir', async () => {
    const { user } = await renderWorkspace(readyCase({ report: mismatchReport() }))
    await user.click(button('Cari hesabatdan götür'))
    const editor = within(screen.getByRole('heading', { name: 'Sətir uyğunlaşdırması' }).closest('.mapping-editor'))
    expect(editor.getAllByRole('combobox')).toHaveLength(3)
    await user.click(editor.getByRole('button', { name: 'Sətri sil' }))
    expect(editor.queryAllByRole('combobox')).toHaveLength(0)
  })
})

describe('birləşmiş fayl', () => {
  it('faylı göndərir, tapılan sənədləri səhifələri ilə bildirir və müqayisə edir', async () => {
    const bundled = (kind, pages) => extractedDocument(kind, { original_name: 'scan.pdf', usage: { bundle: true, pages } })
    const result = readyCase({ documents: [bundled('order', [1]), bundled('receipt', [2]), bundled('invoice', [3])] })
    const { server, user } = await renderWorkspace(makeCase(), {
      [`POST ${CASE}bundle/`]: result,
      [`POST ${CASE}compare/`]: { ...result, status: 'mismatch', report: mismatchReport() },
    })
    await user.upload(screen.getByLabelText(/Birləşmiş faylı yüklə/), pdf('scan.pdf'))
    expect(await notice()).toHaveTextContent('AI faylda bunları tapdı: Sifariş (səh. 1), Qəbul (səh. 2), Faktura (səh. 3) və müqayisə avtomatik aparıldı')
    expect(server.calls(`POST ${CASE}bundle/`)[0].form.get('file').name).toBe('scan.pdf')
  })

  it('böyük birləşmiş faylı göndərmir', async () => {
    const { server, user } = await renderWorkspace()
    const big = pdf('scan.pdf')
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 })
    await user.upload(screen.getByLabelText(/Birləşmiş faylı yüklə/), big)
    expect(await notice()).toHaveTextContent('10 MB')
    expect(server.calls(`POST ${CASE}bundle/`)).toHaveLength(0)
  })
})

describe('insan qərarı', () => {
  it('hesabat yoxdursa forma göstərilmir', async () => {
    await renderWorkspace(readyCase())
    expect(screen.getByText('Qərar üçün əvvəl müqayisə hesabatı lazımdır.')).toBeInTheDocument()
  })

  it('uyğunsuz hesabat təsdiqlənə bilməz; etiraz revision ilə göndərilir', async () => {
    const mismatch = readyCase({ status: 'mismatch', revision: 4, report: mismatchReport() })
    const { server, user } = await renderWorkspace(mismatch, {
      [`POST ${CASE}review/`]: { ...mismatch, revision: 5, decision: 'disputed', decision_note: '20 ədəd çatışmır' },
    })
    expect(screen.getByRole('option', { name: /Təsdiqlə \(yalnız uyğun hesabat üçün\)/ })).toBeDisabled()
    expect(screen.getByLabelText('Qərar')).toHaveValue('disputed')
    const submit = button('Qərarı göndər')
    expect(submit).toBeDisabled()
    await user.type(screen.getByLabelText('Qeyd (məcburi)'), '20 ədəd çatışmır')
    await user.click(submit)
    expect(await notice()).toHaveTextContent('Qərar yadda saxlanıldı.')
    expect(server.calls(`POST ${CASE}review/`)[0].json).toEqual({ revision: 4, decision: 'disputed', note: '20 ədəd çatışmır' })
    expect(screen.getByText('Etiraz edildi')).toBeInTheDocument()
  })

  it('uyğun hesabatda təsdiq default seçilir', async () => {
    await renderWorkspace(readyCase({ status: 'matched', report: matchedReport() }))
    expect(screen.getByLabelText('Qərar')).toHaveValue('approved')
    expect(screen.getByRole('option', { name: 'Təsdiqlə' })).toBeEnabled()
  })
})

describe('etiraz məktubu', () => {
  const letter = { subject: 'Sənədlərdə uyğunsuzluq — Ofis kağızı alışı', body: 'Hörmətli Demo Təchizatçı MMC,\n240.00 AZN', is_draft: true, sent: false }

  it('uyğun hesabatda və hesabat olmadan bağlıdır', async () => {
    await renderWorkspace(readyCase({ status: 'matched', report: matchedReport() }))
    expect(button('Qaralama yarat')).toBeDisabled()
    expect(screen.getByText('Sənədlər uyğundur, etiraz lazım deyil.')).toBeInTheDocument()
  })

  it('qaralamanı göstərir və kopyalayır', async () => {
    const { user } = await renderWorkspace(readyCase({ status: 'mismatch', report: mismatchReport() }), {
      [`POST ${CASE}dispute-letter/`]: letter,
    })
    await user.click(button('Qaralama yarat'))
    expect(await screen.findByText(letter.subject)).toBeInTheDocument()
    expect(screen.getByText(/Hörmətli Demo Təchizatçı MMC,/)).toBeInTheDocument()
    await user.click(button('Kopyala'))
    expect(await notice()).toHaveTextContent('Məktub kopyalandı.')
    expect(await navigator.clipboard.readText()).toBe(`${letter.subject}\n\n${letter.body}`)
  })

  it('kopyalama alınmayanda xəbər verir', async () => {
    const { user } = await renderWorkspace(readyCase({ status: 'mismatch', report: mismatchReport() }), {
      [`POST ${CASE}dispute-letter/`]: letter,
    })
    await user.click(button('Qaralama yarat'))
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))
    await user.click(await screen.findByRole('button', { name: 'Kopyala' }))
    expect(await notice()).toHaveTextContent('Kopyalamaq alınmadı')
  })
})

describe('tarixçə', () => {
  it('hadisələri ən yenisi yuxarıda, detalları açılan şəkildə göstərir', async () => {
    const events = [
      { id: 1, action: 'created', payload: {}, created_at: '2026-10-09T09:00:00Z' },
      { id: 2, action: 'compared', payload: { disputed_amount: '240.00' }, created_at: '2026-10-09T09:05:00Z' },
      { id: 3, action: 'custom_action', payload: {}, created_at: '2026-10-09T09:06:00Z' },
    ]
    const { server, user } = await renderWorkspace(makeCase(), { [`GET ${CASE}history/`]: events })
    const items = within(screen.getByRole('heading', { name: 'Tarixçə' }).closest('article')).getAllByRole('listitem')
    expect(items.map((item) => item.querySelector('strong').textContent)).toEqual(['custom_action', 'Müqayisə aparıldı', 'Yoxlama yaradıldı'])
    expect(within(items[1]).getByText('Detallar')).toBeInTheDocument()
    expect(within(items[1]).getByText(/"disputed_amount": "240.00"/)).toBeInTheDocument()
    await user.click(within(screen.getByRole('heading', { name: 'Tarixçə' }).closest('article')).getByRole('button', { name: 'Yenilə' }))
    await waitFor(() => expect(server.calls(`GET ${CASE}history/`)).toHaveLength(2))
  })

  it('hadisə yoxdursa boş vəziyyət', async () => {
    await renderWorkspace()
    expect(screen.getByText('Hələ hadisə yoxdur.')).toBeInTheDocument()
  })
})
