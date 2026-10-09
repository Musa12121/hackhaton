export const KINDS = ['order', 'receipt', 'invoice']

export const KIND_LABELS = {
  order: 'Satınalma sifarişi',
  receipt: 'Qəbul sənədi',
  invoice: 'Faktura',
}

export const KIND_SHORT = { order: 'Sifariş', receipt: 'Qəbul', invoice: 'Faktura' }

export const CASE_STATUS = {
  draft: { label: 'Qaralama', tone: 'blue' },
  matched: { label: 'Uyğundur', tone: 'green' },
  mismatch: { label: 'Uyğunsuzluq', tone: 'bad' },
  needs_review: { label: 'İnsan yoxlaması', tone: 'amber' },
}

export const MATCH_STATUS = {
  matched: { label: 'Uyğundur', tone: 'ok' },
  mismatch: { label: 'Uyğunsuzluq', tone: 'bad' },
  needs_review: { label: 'Yoxlama', tone: 'review' },
}

export const EXTRACTION_STATUS = {
  pending: { label: 'Yükləndi, oxunmayıb', tone: 'blue' },
  extracted: { label: 'AI ilə oxundu', tone: 'green' },
  failed: { label: 'Çıxarış uğursuz', tone: 'bad' },
  manual: { label: 'Manual daxil edilib', tone: 'amber' },
}

export const DECISIONS = {
  approved: 'Təsdiqləndi',
  disputed: 'Etiraz edildi',
  needs_review: 'Əlavə yoxlama',
}

export const EVENT_LABELS = {
  created: 'Yoxlama yaradıldı',
  document_uploaded: 'Sənəd yükləndi',
  document_corrected: 'Sənəd məlumatı düzəldildi',
  extracted: 'AI çıxarışı',
  compared: 'Müqayisə aparıldı',
  reviewed: 'Qərar verildi',
  letter_drafted: 'Etiraz məktubu hazırlandı',
  bundle_extracted: 'Birləşmiş fayl AI ilə bölündü',
}

export const ISSUE_LABELS = {
  missing_document: 'Sənəd çatışmır',
  tax_review: 'ƏDV',
  currency_review: 'Valyuta',
  incomplete_document: 'Natamam sənəd',
  missing_evidence: 'Mənbə yoxdur',
  arithmetic_mismatch: 'Hesab xətası',
  missing_amount: 'Məbləğ oxunmayıb',
  missing_total: 'Cəm oxunmayıb',
  total_mismatch: 'Cəm uyğun deyil',
  unmatched_line: 'Uyğunlaşdırılmayan sətir',
}

export function statusInfo(map, key) {
  return map[key] || { label: key || '—', tone: 'blue' }
}

export function formatAmount(value, currency) {
  if (value === null || value === undefined || value === '') return '—'
  const number = Number(value)
  const text = Number.isFinite(number)
    ? number.toLocaleString('az-AZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : String(value)
  return currency ? `${text} ${currency}` : text
}

export function formatValue(value) {
  return value === null || value === undefined || value === '' ? '—' : String(value)
}

export function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  // az-AZ lokalı bəzi brauzerlərdə "2026 M10 9" kimi görünür; formatı əl ilə qururuq.
  const pad = (number) => String(number).padStart(2, '0')
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function emptyDocumentData() {
  const source = () => ({ page: null, quote: null })
  const lineFields = ['name', 'sku', 'quantity', 'unit', 'pack_size', 'unit_price', 'line_total']
  return {
    document_number: null,
    currency: 'AZN',
    total: null,
    tax_total: null,
    source: { document_number: source(), currency: source(), total: source() },
    lines: [
      {
        ...Object.fromEntries(lineFields.map((field) => [field, null])),
        source: Object.fromEntries(lineFields.map((field) => [field, source()])),
      },
    ],
    warnings: [],
    notes: [],
  }
}
