// Backend cavablarının (Swagger sxeminə uyğun) test nümunələri.
import demoInvoice from '../demo/invoice.json'
import demoOrder from '../demo/order.json'
import demoReceipt from '../demo/receipt.json'

export const CASE_ID = '11111111-1111-4111-8111-111111111111'
const DEMO = { order: demoOrder, receipt: demoReceipt, invoice: demoInvoice }

/** Demo sənəd məlumatı (100 sifariş / 80 qəbul / 100 faktura, 12 AZN). */
export function documentData(kind, overrides = {}) {
  return { ...structuredClone(DEMO[kind].data), ...overrides }
}

export function makeDocument(kind, overrides = {}) {
  return {
    id: `doc-${kind}`,
    kind,
    original_name: '',
    data: {},
    extraction_status: 'pending',
    error: '',
    usage: {},
    created_at: '2026-10-09T10:00:00Z',
    case: CASE_ID,
    ...overrides,
  }
}

/** Faylı yüklənmiş, AI ilə oxunmuş sənəd. */
export function extractedDocument(kind, overrides = {}) {
  return makeDocument(kind, {
    original_name: `${kind}.pdf`,
    data: documentData(kind),
    extraction_status: 'extracted',
    usage: { model: 'gemini-3.5-flash-lite', total_tokens: 1800, elapsed_seconds: 2.5 },
    ...overrides,
  })
}

export function makeCase(overrides = {}) {
  return {
    id: CASE_ID,
    title: 'Ofis kağızı alışı',
    supplier: 'Demo Təchizatçı MMC',
    status: 'draft',
    revision: 0,
    report: {},
    decision: '',
    decision_note: '',
    documents: [],
    created_at: '2026-10-09T09:00:00Z',
    updated_at: '2026-10-09T09:30:00Z',
    ...overrides,
  }
}

function source(kind, line = 0) {
  return { document_id: `doc-${kind}`, line, values: documentData(kind).lines[line] }
}

/** Üçtərəfli: 20 ədəd çatışmır → 240.00 AZN. */
export function mismatchReport(overrides = {}) {
  return {
    status: 'mismatch',
    mode: 'three_way',
    currency: 'AZN',
    disputed_amount: '240.00',
    amount_complete: true,
    issues: [],
    notes: [],
    revision: 4,
    generated_at: '2026-10-09T10:05:00Z',
    scope: 'Vergi, endirim və daşınma haqqı olmayan mal sətirləri; bir sənəd/növ.',
    matches: [{
      sources: { order: source('order'), receipt: source('receipt'), invoice: source('invoice') },
      status: 'mismatch',
      differences: ['Sifariş, qəbul və faktura miqdarları fərqlidir.'],
      disputed_amount: '240.00',
    }],
    ...overrides,
  }
}

export function matchedReport() {
  return mismatchReport({
    status: 'matched',
    disputed_amount: '0.00',
    matches: [{ ...mismatchReport().matches[0], status: 'matched', differences: [], disputed_amount: '0.00' }],
  })
}

export function twoWayReport() {
  const match = mismatchReport().matches[0]
  return mismatchReport({
    mode: 'two_way',
    disputed_amount: '100.00',
    notes: ['Qəbul sənədi olmadan sifariş ↔ faktura müqayisəsi: malların faktiki qəbulu yoxlanmayıb.'],
    matches: [{ ...match, sources: { order: match.sources.order, invoice: match.sources.invoice }, disputed_amount: '100.00',
      differences: ['Fakturanın vahid qiyməti sifarişdən fərqlidir.'] }],
  })
}

/** Adları fərqli, kodsuz sətirlər: heç nə uyğunlaşdırılmayıb. */
export function unmatchedReport(kinds = ['order', 'receipt', 'invoice']) {
  return mismatchReport({
    status: 'needs_review',
    mode: kinds.length === 2 ? 'two_way' : 'three_way',
    disputed_amount: '0.00',
    amount_complete: false,
    matches: [],
    issues: kinds.map((kind) => ({
      code: 'unmatched_line', message: 'Məhsul sətri insan tərəfindən uyğunlaşdırılmalıdır.', document_id: `doc-${kind}`, kind, line: 0,
    })),
  })
}

/** Hər üç sənədi oxunmuş yoxlama. */
export function readyCase(overrides = {}) {
  return makeCase({ revision: 3, documents: ['order', 'receipt', 'invoice'].map((kind) => extractedDocument(kind)), ...overrides })
}
