import { describe, expect, it } from 'vitest'
import {
  CASE_STATUS, DECISIONS, EVENT_LABELS, ISSUE_LABELS, KINDS, KIND_LABELS,
  emptyDocumentData, formatAmount, formatDate, formatValue, statusInfo,
} from './format'

describe('formatAmount', () => {
  it('backend-in decimal string məbləğini iki rəqəmlə göstərir', () => {
    expect(formatAmount('240.00', 'AZN')).toMatch(/^240[,.]00 AZN$/)
    expect(formatAmount('12', 'AZN')).toMatch(/^12[,.]00 AZN$/)
    expect(formatAmount('0.125')).toMatch(/^0[,.]1[23]$/)
  })

  it('valyutasız və boş dəyərlər', () => {
    expect(formatAmount('5.5')).toMatch(/^5[,.]50$/)
    expect(formatAmount(null, 'AZN')).toBe('—')
    expect(formatAmount('', 'AZN')).toBe('—')
    expect(formatAmount(undefined)).toBe('—')
  })

  it('rəqəm olmayan dəyəri olduğu kimi saxlayır', () => {
    expect(formatAmount('naməlum', 'AZN')).toBe('naməlum AZN')
  })
})

describe('formatDate', () => {
  it('lokal saatla gün.ay.il saat:dəqiqə formatı (brauzer lokalından asılı deyil)', () => {
    const date = new Date(2026, 9, 9, 13, 5)
    expect(formatDate(date.toISOString())).toBe('09.10.2026 13:05')
  })

  it('boş və etibarsız tarixlər', () => {
    expect(formatDate('')).toBe('—')
    expect(formatDate(null)).toBe('—')
    expect(formatDate('not a date')).toBe('not a date')
  })
})

describe('formatValue və statusInfo', () => {
  it('boş dəyəri tire ilə göstərir', () => {
    expect(formatValue(null)).toBe('—')
    expect(formatValue('')).toBe('—')
    expect(formatValue(0)).toBe('0')
    expect(formatValue('80')).toBe('80')
  })

  it('naməlum statusu çökmədən göstərir', () => {
    expect(statusInfo(CASE_STATUS, 'mismatch')).toEqual({ label: 'Uyğunsuzluq', tone: 'bad' })
    expect(statusInfo(CASE_STATUS, 'archived')).toEqual({ label: 'archived', tone: 'blue' })
    expect(statusInfo(CASE_STATUS, undefined).label).toBe('—')
  })
})

describe('etiketlər backend dəyərlərini əhatə edir', () => {
  it('bütün sənəd növləri, qərarlar, hadisələr və qeyd kodları', () => {
    expect(KINDS.every((kind) => KIND_LABELS[kind])).toBe(true)
    expect(Object.keys(DECISIONS)).toEqual(['approved', 'disputed', 'needs_review'])
    for (const action of ['created', 'document_uploaded', 'document_corrected', 'extracted', 'bundle_extracted', 'compared', 'reviewed', 'letter_drafted']) {
      expect(EVENT_LABELS[action]).toBeTruthy()
    }
    for (const code of ['missing_document', 'tax_review', 'currency_review', 'incomplete_document', 'missing_evidence',
      'arithmetic_mismatch', 'missing_amount', 'missing_total', 'total_mismatch', 'unmatched_line']) {
      expect(ISSUE_LABELS[code]).toBeTruthy()
    }
  })
})

describe('emptyDocumentData', () => {
  it('backend sxeminə uyğun boş şablon qaytarır', () => {
    const data = emptyDocumentData()
    expect(Object.keys(data)).toEqual(['document_number', 'currency', 'total', 'tax_total', 'source', 'lines', 'warnings', 'notes'])
    expect(Object.keys(data.source)).toEqual(['document_number', 'currency', 'total'])
    const [line] = data.lines
    expect(Object.keys(line.source)).toEqual(['name', 'sku', 'quantity', 'unit', 'pack_size', 'unit_price', 'line_total'])
    expect(line.quantity).toBeNull()
  })

  it('hər çağırışda yeni obyekt yaradır', () => {
    expect(emptyDocumentData()).not.toBe(emptyDocumentData())
  })
})
