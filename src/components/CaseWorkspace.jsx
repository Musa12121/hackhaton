import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import demoInvoice from '../demo/invoice.json'
import demoOrder from '../demo/order.json'
import demoReceipt from '../demo/receipt.json'
import {
  CASE_STATUS, DECISIONS, EVENT_LABELS, EXTRACTION_STATUS, KINDS, KIND_LABELS, KIND_SHORT,
  emptyDocumentData, formatAmount, formatDate, formatValue, statusInfo,
} from '../format'
import { IssuesList, MatchesTable, ReportSummary } from './ReportView'
import { EmptyState, Notice, PageHeader, Pill, SectionHeading } from './ui'

const DEMO = { order: demoOrder, receipt: demoReceipt, invoice: demoInvoice }
const TWO_WAY_KINDS = ['order', 'invoice']
const ACCEPTED_FILES = '.pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,.docx,.xlsx,.xls,.csv,.txt'

export default function CaseWorkspace({ caseId, onBack, onChanged, onDelete }) {
  const [caseData, setCaseData] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState(null)
  const [events, setEvents] = useState([])
  const [suggestions, setSuggestions] = useState(null)
  const [mappings, setMappings] = useState([])
  const [letter, setLetter] = useState(null)

  const loadHistory = useCallback(async () => {
    try {
      setEvents(await api.history(caseId))
    } catch {
      // Tarixçə ikinci dərəcəlidir; əsas əməliyyatın nəticəsini pozmasın.
    }
  }, [caseId])

  useEffect(() => {
    let active = true
    Promise.all([api.getCase(caseId), api.history(caseId)])
      .then(([data, history]) => {
        if (!active) return
        setCaseData(data)
        setEvents(history)
      })
      .catch((error) => active && setLoadError(error.message))
    return () => {
      active = false
    }
  }, [caseId])

  // Hər əməliyyat: busy göstəricisi, xəta/uğur mesajı, Case cavabını state-ə yazmaq, tarixçəni yeniləmək.
  async function run(name, action, successText) {
    setBusy(name)
    setNotice(null)
    try {
      const result = await action()
      if (result && result.id === caseId && Array.isArray(result.documents)) {
        setCaseData(result)
        onChanged?.()
      }
      if (successText) setNotice({ tone: 'success', text: typeof successText === 'function' ? successText(result) : successText })
      return result
    } catch (error) {
      if (error.status === 409) {
        setNotice({ tone: 'error', text: `${error.message} Məlumatlar yeniləndi, yenidən cəhd edin.` })
        try {
          setCaseData(await api.getCase(caseId))
        } catch {
          // ignore
        }
      } else {
        setNotice({ tone: 'error', text: error.message })
      }
      return null
    } finally {
      setBusy('')
      loadHistory()
    }
  }

  if (loadError) {
    return (
      <section className="page-layout">
        <button className="ghost-button back-button" onClick={onBack} type="button">← Yoxlamalara qayıt</button>
        <Notice>{loadError}</Notice>
      </section>
    )
  }
  if (!caseData) return <section className="page-layout"><p className="loading-text">Yüklənir…</p></section>

  const docs = Object.fromEntries(caseData.documents.map((doc) => [doc.kind, doc]))
  const hasData = (kind) => Boolean(docs[kind]?.data && Object.keys(docs[kind].data).length > 0)
  const anyFile = KINDS.some((kind) => docs[kind]?.original_name)
  // Backend ilə eyni qayda: qəbul sənədi ümumiyyətlə yoxdursa sifariş ↔ faktura müqayisəsi aparılır.
  const twoWay = !docs.receipt
  const activeKinds = twoWay ? TWO_WAY_KINDS : KINDS
  const canCompare = activeKinds.every(hasData)
  const missingText = activeKinds.filter((kind) => !hasData(kind)).map((kind) => KIND_SHORT[kind]).join(', ')
  const report = caseData.report && Object.keys(caseData.report).length > 0 ? caseData.report : null
  const status = statusInfo(CASE_STATUS, caseData.status)

  const refreshCase = () => api.getCase(caseId)

  function uploadFile(kind, file) {
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      setNotice({ tone: 'error', text: 'Maksimum fayl ölçüsü 10 MB-dır.' })
      return
    }
    setSuggestions(null)
    setLetter(null)
    return run(`upload-${kind}`, async () => {
      await api.uploadDocument(caseId, kind, file)
      return refreshCase()
    }, `${KIND_LABELS[kind]} yükləndi.`)
  }

  function saveData(kind, data, note) {
    setSuggestions(null)
    setLetter(null)
    return run(`data-${kind}`, async () => {
      await api.saveDocumentData(caseId, { kind, data, note })
      return refreshCase()
    }, `${KIND_LABELS[kind]} məlumatı yadda saxlanıldı.`)
  }

  function fillDemo() {
    setSuggestions(null)
    setLetter(null)
    return run('demo', async () => {
      for (const kind of KINDS) {
        await api.saveDocumentData(caseId, DEMO[kind])
      }
      return refreshCase()
    }, 'Demo məlumatları üç sənədə yazıldı. İndi müqayisəni başladın.')
  }

  // Sənədlərdən sonra müqayisə mümkündürsə, dərhal avtomatik aparılır.
  async function compareIfReady(updated) {
    const byKind = Object.fromEntries(updated.documents.map((doc) => [doc.kind, doc]))
    const kinds = byKind.receipt ? KINDS : TWO_WAY_KINDS
    const ready = kinds.every((kind) => byKind[kind]?.data && Object.keys(byKind[kind].data).length > 0)
    const missing = kinds.filter((kind) => !(byKind[kind]?.data && Object.keys(byKind[kind].data).length > 0))
    return ready ? { ...(await withSuggestions(await api.compare(caseId, {}))), compared: true } : { ...updated, missing }
  }

  // Adı/kodu fərqli olan sətirlər qalıbsa, AI uyğunlaşdırma təklifi avtomatik gətirilir (təsdiq istifadəçidədir).
  async function withSuggestions(compared) {
    if (!compared.report?.issues?.some((issue) => issue.code === 'unmatched_line')) return compared
    try {
      return { ...compared, autoSuggestions: await api.suggestions(caseId) }
    } catch {
      return compared
    }
  }

  function suggestionText(result) {
    const count = result.autoSuggestions?.suggestions?.length
    return count ? ` AI adları fərqli olan ${count} məhsulu uyğunlaşdırdı — aşağıda yoxlayıb təsdiqləyin.` : ''
  }

  function showSuggestions(result) {
    if (result?.autoSuggestions) setSuggestions({ ...result.autoSuggestions, key: Date.now() })
    return result
  }

  function extractMessage(result, prefix) {
    if (result.failed?.length) {
      return `${prefix}, amma ${result.failed.map((doc) => KIND_SHORT[doc.kind]).join(', ')} oxunmadı. Səbəbə sənəd kartında baxın, faylı yenidən yükləyin və ya məlumatı manual düzəldin.`
    }
    if (result.compared) {
      return `${prefix} və müqayisə avtomatik aparıldı${result.report?.mode === 'two_way' ? ' (qəbul sənədi olmadan: sifariş ↔ faktura)' : ''}.${suggestionText(result) || ' Nəticəyə aşağıda baxın.'}`
    }
    return `${prefix}. Müqayisə üçün hələ lazımdır: ${result.missing.map((kind) => KIND_SHORT[kind]).join(', ')} — faylını yükləyin və ya manual daxil edin.`
  }

  async function extract() {
    setSuggestions(null)
    setLetter(null)
    return showSuggestions(await run('extract', async () => {
      const extracted = await api.extract(caseId)
      const failed = extracted.documents.filter((doc) => doc.extraction_status === 'failed')
      if (failed.length) return { ...extracted, failed }
      return compareIfReady(extracted)
    }, (result) => extractMessage(result, 'AI yüklənmiş sənədləri oxudu')))
  }

  async function uploadBundle(file) {
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      setNotice({ tone: 'error', text: 'Maksimum fayl ölçüsü 10 MB-dır.' })
      return
    }
    setSuggestions(null)
    setLetter(null)
    return showSuggestions(await run('bundle', async () => {
      const updated = await api.uploadBundle(caseId, file)
      const found = updated.documents.filter((doc) => doc.usage?.bundle && doc.original_name === file.name)
      return { ...(await compareIfReady(updated)), found }
    }, (result) => {
      const found = result.found.map((doc) => `${KIND_SHORT[doc.kind]} (səh. ${doc.usage.pages?.join(', ') || '?'})`).join(', ')
      return extractMessage(result, `AI faylda bunları tapdı: ${found}`)
    }))
  }

  async function autoCompare() {
    setSuggestions(null)
    setLetter(null)
    return showSuggestions(await run('compare', async () => withSuggestions(await api.compare(caseId, {})),
      (result) => `Avtomatik müqayisə tamamlandı.${suggestionText(result)}`))
  }

  async function confirmSuggestions(items) {
    const payload = items.map((item) => Object.fromEntries(activeKinds.map((kind) => [kind, item[kind]])))
    setLetter(null)
    const result = await run('compare-manual', () => api.compare(caseId, { revision: caseData.revision, mappings: payload }),
      'AI uyğunlaşdırması təsdiqləndi və müqayisə aparıldı.')
    if (result) {
      setSuggestions(null)
      setMappings(payload.map((row) => Object.fromEntries(Object.entries(row).map(([kind, value]) => [kind, String(value)]))))
    }
  }

  function manualCompare() {
    const payload = mappings.map((row) => Object.fromEntries(activeKinds.map((kind) => [kind, Number(row[kind])])))
    setLetter(null)
    return run('compare-manual', () => api.compare(caseId, { revision: caseData.revision, mappings: payload }), 'Manual uyğunlaşdırma ilə müqayisə tamamlandı.')
  }

  async function loadSuggestions() {
    const result = await run('suggestions', () => api.suggestions(caseId))
    if (result) setSuggestions({ ...result, key: Date.now() })
  }

  function review(decision, note) {
    return run('review', () => api.review(caseId, { revision: caseData.revision, decision, note }), 'Qərar yadda saxlanıldı.')
  }

  async function draftLetter() {
    const result = await run('letter', () => api.disputeLetter(caseId))
    if (result) setLetter(result)
  }

  function removeCase() {
    return run('delete', () => onDelete(caseData))
  }

  function download(doc) {
    return run(`download-${doc.kind}`, () => api.downloadDocument(caseId, doc.id, doc.original_name))
  }

  return (
    <section className="page-layout">
      <button className="ghost-button back-button" onClick={onBack} type="button">← Yoxlamalara qayıt</button>

      <PageHeader title={caseData.title} text={caseData.supplier ? `Təchizatçı: ${caseData.supplier}` : 'Təchizatçı göstərilməyib'}>
        <div className="header-meta">
          <Pill tone={status.tone}>{status.label}</Pill>
          <span>Revision: <b>{caseData.revision}</b></span>
          <span>Yenilənib: <b>{formatDate(caseData.updated_at)}</b></span>
          <button className="secondary-button compact" disabled={Boolean(busy)} onClick={() => run('refresh', refreshCase)} type="button">Yenilə</button>
          <button className="delete-button" disabled={Boolean(busy)} onClick={removeCase} type="button">
            {busy === 'delete' ? 'Silinir…' : 'Yoxlamanı sil'}
          </button>
        </div>
      </PageHeader>

      <div className="sticky-notice">
        <Notice tone={notice?.tone} onClose={() => setNotice(null)}>{notice?.text}</Notice>
      </div>

      {/* 1. Sənədlər */}
      <article className="clean-panel">
        <SectionHeading kicker="Addım 1" title="Sənədlər" text="Hər növdən bir sənəd: fayl yükləyin (PDF, skan, telefon şəkli, Word, Excel, CSV, TXT — maks. 10 MB) və ya məlumatı manual daxil edin. Yeni yükləmə əvvəlkini əvəzləyir və hesabatı sıfırlayır.">
          <button className="secondary-button compact" disabled={Boolean(busy)} onClick={fillDemo} type="button">
            {busy === 'demo' ? 'Yazılır…' : 'Demo məlumatla doldur'}
          </button>
        </SectionHeading>
        <BundleUpload busy={busy} onUpload={uploadBundle} />
        <div className="doc-grid">
          {KINDS.map((kind) => (
            <DocumentCard
              busy={busy}
              doc={docs[kind]}
              key={kind}
              kind={kind}
              onDownload={download}
              onSave={saveData}
              onUpload={uploadFile}
            />
          ))}
        </div>
      </article>

      {/* 2. Çıxarış və müqayisə */}
      <article className="clean-panel">
        <SectionHeading kicker="Addım 2" title="AI çıxarışı və müqayisə" />
        <div className="action-grid">
          <div className="action-card">
            <strong>AI ilə oxu</strong>
            <p>Yüklənmiş faylları (1, 2 və ya 3) Gemini ilə oxuyur. Lazımi sənədlər hazırdırsa, avtomatik müqayisə edir. Manual daxil edilmiş sənədlərə toxunmur.</p>
            <button className="primary-button" disabled={Boolean(busy) || !anyFile} onClick={extract} type="button">
              {busy === 'extract' ? 'AI oxuyur… gözləyin' : 'AI ilə oxu və müqayisə et'}
            </button>
            {!anyFile && <small>Əvvəl ən azı bir fayl yükləyin.</small>}
          </div>
          <div className="action-card">
            <strong>Avtomatik müqayisə</strong>
            <p>Sətirlər eyni SKU və ya eyni məhsul adı ilə uyğunlaşdırılır, fərq hesablanır. {twoWay ? 'Qəbul sənədi yoxdur: sifariş ↔ faktura müqayisəsi aparılacaq.' : 'Üçtərəfli: sifariş ↔ qəbul ↔ faktura.'}</p>
            <button className="primary-button" disabled={Boolean(busy) || !canCompare} onClick={autoCompare} type="button">
              {busy === 'compare' ? 'Müqayisə edilir…' : 'Müqayisə et'}
            </button>
            {!canCompare && <small>Lazımdır: {missingText}.</small>}
          </div>
          <div className="action-card">
            <strong>AI uyğunlaşdırma təklifi</strong>
            <p>Fərqli dillərdə yazılmış məhsul adları üçün təklif verir. Təkliflər avtomatik tətbiq olunmur.</p>
            <button className="secondary-button" disabled={Boolean(busy) || !canCompare} onClick={loadSuggestions} type="button">
              {busy === 'suggestions' ? 'Hazırlanır…' : 'Təklif al'}
            </button>
          </div>
        </div>

        {suggestions && (
          <SuggestionsList
            docs={docs}
            key={suggestions.key}
            busy={busy}
            kinds={activeKinds}
            onConfirm={confirmSuggestions}
            onApply={(items) => setMappings(items.map((item) => Object.fromEntries(activeKinds.map((kind) => [kind, String(item[kind])]))))}
            suggestions={suggestions}
          />
        )}

        {canCompare && (
          <MappingEditor
            busy={busy}
            docs={docs}
            kinds={activeKinds}
            mappings={mappings}
            onCompare={manualCompare}
            onLoadFromReport={() => setMappings((report?.matches || []).map((match) => Object.fromEntries(
              activeKinds.map((kind) => [kind, String(match.sources[kind]?.line ?? '')]),
            )))}
            report={report}
            setMappings={setMappings}
          />
        )}
      </article>

      {/* 3. Hesabat */}
      {report && suggestions?.suggestions?.length > 0 && (
        <div className="pending-banner">
          <div>
            <strong>AI uyğunlaşdırması təsdiq gözləyir</strong>
            <span>Aşağıdakı nəticə hələ AI təklifi tətbiq olunmamışdan əvvəlkidir. Təsdiqləsəniz, fərqli adlı məhsullar uyğunlaşdırılıb yenidən müqayisə ediləcək.</span>
          </div>
          <button className="primary-button compact" disabled={Boolean(busy)} onClick={() => confirmSuggestions(suggestions.suggestions)} type="button">
            {busy === 'compare-manual' ? 'Müqayisə edilir…' : `${suggestions.suggestions.length} uyğunlaşdırmanı təsdiqlə`}
          </button>
        </div>
      )}

      {report ? (
        <>
          <ReportSummary report={report} />
          <article className="clean-panel">
            <SectionHeading kicker="Addım 3" title="Sətir üzrə nəticə" />
            <MatchesTable report={report} />
          </article>
          <article className="clean-panel">
            <SectionHeading kicker="Qeydlər" title="Yoxlama tələb edən məqamlar" />
            <IssuesList documents={caseData.documents} report={report} />
          </article>
        </>
      ) : (
        <article className="clean-panel">
          <SectionHeading kicker="Addım 3" title="Hesabat" />
          <EmptyState>Hesabat hələ yoxdur. Sənəd məlumatları hazır olduqdan sonra müqayisəni başladın.</EmptyState>
        </article>
      )}

      {/* 4. Qərar və məktub */}
      <section className="bottom-grid">
        <ReviewPanel busy={busy} caseData={caseData} key={caseData.revision} onSubmit={review} report={report} />
        <article className="letter-panel">
          <SectionHeading kicker="Addım 5" title="Etiraz məktubu" text="Şablon əsasında qaralama yaradılır; heç yerə göndərilmir.">
            <button className="secondary-button compact" disabled={Boolean(busy) || !report || caseData.status === 'matched'} onClick={draftLetter} type="button">
              {busy === 'letter' ? 'Hazırlanır…' : 'Qaralama yarat'}
            </button>
          </SectionHeading>
          {letter ? (
            <>
              <p className="letter-subject"><b>Mövzu:</b> {letter.subject}</p>
              <pre className="letter-body">{letter.body}</pre>
              <button className="ghost-button compact" onClick={() => copyText(`${letter.subject}\n\n${letter.body}`, setNotice)} type="button">Kopyala</button>
            </>
          ) : (
            <EmptyState>
              {!report ? 'Əvvəl müqayisə aparılmalıdır.' : caseData.status === 'matched' ? 'Sənədlər uyğundur, etiraz lazım deyil.' : 'Qaralama yaratmaq üçün düyməni basın.'}
            </EmptyState>
          )}
        </article>
      </section>

      {/* 5. Tarixçə */}
      <article className="clean-panel history-panel">
        <SectionHeading kicker="Audit" title="Tarixçə">
          <button className="ghost-button compact" onClick={loadHistory} type="button">Yenilə</button>
        </SectionHeading>
        <HistoryList events={events} />
      </article>
    </section>
  )
}

function BundleUpload({ busy, onUpload }) {
  return (
    <label className={busy ? 'bundle-upload disabled' : 'bundle-upload'}>
      <input
        accept={ACCEPTED_FILES}
        disabled={Boolean(busy)}
        onChange={(event) => {
          onUpload(event.target.files?.[0])
          event.target.value = ''
        }}
        type="file"
      />
      <span className="upload-icon">⇪</span>
      <span className="bundle-text">
        <strong>{busy === 'bundle' ? 'AI faylı bölür və oxuyur… gözləyin' : 'Bütün sənədlər bir fayldadır? Birləşmiş faylı yüklə'}</strong>
        <small>AI sifarişi, qəbul aktını və fakturanı məzmununa görə tapır, səhifələrini ayırır və hər birini aşağıdakı kartlara yerləşdirir. Faylda olmayan sənədlərə toxunulmur.</small>
      </span>
    </label>
  )
}

function DocumentCard({ kind, doc, busy, onUpload, onSave, onDownload }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  const [jsonError, setJsonError] = useState('')
  const hasData = doc?.data && Object.keys(doc.data).length > 0
  const status = doc ? statusInfo(EXTRACTION_STATUS, doc.extraction_status) : { label: 'Yüklənməyib', tone: 'blue' }

  function openEditor() {
    setText(JSON.stringify(hasData ? doc.data : emptyDocumentData(), null, 2))
    setNote(hasData ? '' : 'Manual daxil edildi')
    setJsonError('')
    setEditing(true)
  }

  async function submit(event) {
    event.preventDefault()
    let data
    try {
      data = JSON.parse(text)
    } catch (error) {
      setJsonError(`JSON düzgün deyil: ${error.message}`)
      return
    }
    setJsonError('')
    const result = await onSave(kind, data, note.trim())
    if (result) setEditing(false)
  }

  return (
    <div className="doc-card">
      <div className="doc-card-head">
        <div>
          <span className="section-kicker">{KIND_SHORT[kind]}</span>
          <h3>{KIND_LABELS[kind]}</h3>
        </div>
        <Pill tone={status.tone}>{status.label}</Pill>
      </div>

      {doc?.original_name && (
        <p className="doc-file">
          📄 {doc.original_name}
          {doc.usage?.bundle && <span className="bundle-tag">Birləşmiş fayldan · səh. {doc.usage.pages?.join(', ') || '?'}</span>}
        </p>
      )}
      {doc?.error && <Notice>{doc.error}</Notice>}

      <label className={busy ? 'dropzone small-dropzone disabled' : 'dropzone small-dropzone'}>
        <input
          accept={ACCEPTED_FILES}
          disabled={Boolean(busy)}
          onChange={(event) => {
            onUpload(kind, event.target.files?.[0])
            event.target.value = ''
          }}
          type="file"
        />
        <span className="upload-icon">↑</span>
        <strong>{busy === `upload-${kind}` ? 'Yüklənir…' : doc?.original_name ? 'Faylı əvəzlə' : 'Fayl seç'}</strong>
      </label>

      <div className="doc-actions">
        {doc?.original_name && (
          <button className="ghost-button compact" disabled={Boolean(busy)} onClick={() => onDownload(doc)} type="button">Endir</button>
        )}
        <button className="ghost-button compact" disabled={Boolean(busy)} onClick={editing ? () => setEditing(false) : openEditor} type="button">
          {editing ? 'Bağla' : hasData ? 'Məlumatı düzəlt' : 'Manual daxil et'}
        </button>
      </div>

      {editing && (
        <form className="json-editor" onSubmit={submit}>
          <div className="editor-toolbar">
            <span>Məlumat (JSON)</span>
            <button className="link-button" onClick={() => setText(JSON.stringify(DEMO[kind].data, null, 2))} type="button">Nümunə yüklə</button>
            <button className="link-button" onClick={() => setText(JSON.stringify(emptyDocumentData(), null, 2))} type="button">Boş şablon</button>
          </div>
          <textarea onChange={(event) => setText(event.target.value)} rows={14} spellCheck={false} value={text} />
          {jsonError && <Notice>{jsonError}</Notice>}
          <label className="form-field">
            <span>Düzəliş qeydi (məcburi)</span>
            <input maxLength={1000} onChange={(event) => setNote(event.target.value)} required value={note} />
          </label>
          <button className="primary-button compact" disabled={Boolean(busy) || !note.trim()} type="submit">
            {busy === `data-${kind}` ? 'Saxlanılır…' : 'Yadda saxla'}
          </button>
        </form>
      )}

      {hasData && !editing && <DocumentData data={doc.data} />}
      {doc?.usage?.total_tokens != null && (
        <small className="usage-text">AI: {doc.usage.model} · {doc.usage.total_tokens} token · {doc.usage.elapsed_seconds} san.</small>
      )}
    </div>
  )
}

function DocumentData({ data }) {
  return (
    <div className="doc-data">
      <div className="mini-fields">
        <span>Nömrə: <b>{formatValue(data.document_number)}</b></span>
        <span>Valyuta: <b>{formatValue(data.currency)}</b></span>
        <span>Cəm: <b>{formatAmount(data.total, data.currency)}</b></span>
        {data.tax_total != null && <span>ƏDV: <b>{formatAmount(data.tax_total, data.currency)}</b></span>}
      </div>
      {data.lines?.length > 0 ? (
        <div className="mini-table-wrap">
          <table className="mini-table">
            <thead>
              <tr><th>#</th><th>Məhsul</th><th>Miqdar</th><th>Vahid</th><th>Qiymət</th><th>Cəm</th></tr>
            </thead>
            <tbody>
              {data.lines.map((line, index) => (
                <tr key={index}>
                  <td>{index + 1}</td>
                  <td>{formatValue(line.name)}{line.sku && <small> · {line.sku}</small>}</td>
                  <td>{formatValue(line.quantity)}</td>
                  <td>{formatValue(line.unit)}{line.pack_size && line.pack_size !== '1' ? ` ×${line.pack_size}` : ''}</td>
                  <td>{formatAmount(line.unit_price)}</td>
                  <td>{formatAmount(line.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState>Məhsul sətri yoxdur.</EmptyState>
      )}
      {data.notes?.length > 0 && (
        <ul className="note-list">
          {data.notes.map((note) => <li key={note}>{note}</li>)}
        </ul>
      )}
      {data.warnings?.length > 0 && (
        <ul className="warning-list">
          {data.warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      )}
    </div>
  )
}

function lineLabel(doc, index) {
  const line = doc?.data?.lines?.[index]
  return line ? `${index + 1}. ${line.name || line.sku || 'Adsız'} (${formatValue(line.quantity)})` : `${index + 1}`
}

function SuggestionsList({ suggestions, docs, kinds, busy, onApply, onConfirm }) {
  const items = suggestions.suggestions || []
  const [selected, setSelected] = useState(() => items.map(() => true))

  return (
    <div className="suggestions">
      <SectionHeading kicker="AI təklifi" title={`AI ${items.length} məhsulu uyğunlaşdırdı`} text="Sənədlərdə eyni məhsul fərqli adla yazılıb. AI-nin uyğunlaşdırmasını yoxlayın, səhv olanın işarəsini götürün və təsdiqləyin." />
      {items.length === 0 ? (
        <EmptyState>AI əmin olduğu uyğunluq tapmadı.</EmptyState>
      ) : (
        <>
          <div className="suggestion-list">
            {items.map((item, index) => (
              <label className="suggestion-row" key={index}>
                <input
                  checked={selected[index]}
                  onChange={() => setSelected((current) => current.map((value, i) => (i === index ? !value : value)))}
                  type="checkbox"
                />
                <div>
                  <strong>{kinds.map((kind) => `${KIND_SHORT[kind]}: ${lineLabel(docs[kind], item[kind])}`).join(' ↔ ')}</strong>
                  <span>{item.reason} · Əminlik: {Math.round(item.confidence * 100)}%</span>
                </div>
              </label>
            ))}
          </div>
          <div className="doc-actions">
            <button className="primary-button compact" disabled={Boolean(busy) || !selected.some(Boolean)} onClick={() => onConfirm(items.filter((_, index) => selected[index]))} type="button">
              {busy === 'compare-manual' ? 'Müqayisə edilir…' : 'Təsdiqlə və müqayisə et'}
            </button>
            <button className="ghost-button compact" onClick={() => onApply(items.filter((_, index) => selected[index]))} type="button">
              Əl ilə düzəlişə köçür
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function MappingEditor({ docs, kinds, mappings, setMappings, onCompare, onLoadFromReport, busy, report }) {
  const valid = mappings.length > 0 && mappings.every((row) => kinds.every((kind) => row[kind] !== undefined && row[kind] !== ''))

  function update(index, kind, value) {
    setMappings((current) => current.map((row, i) => (i === index ? { ...row, [kind]: value } : row)))
  }

  return (
    <div className="mapping-editor">
      <SectionHeading kicker="Manual" title="Sətir uyğunlaşdırması" text={`Hansı sifariş sətrinin hansı ${kinds.length === 2 ? 'faktura' : 'qəbul və faktura'} sətrinə uyğun olduğunu seçin. Siyahı tam uyğunlaşdırmanı əvəz edir; kənarda qalan sətirlər yoxlamaya düşür.`}>
        {report?.matches?.length > 0 && (
          <button className="ghost-button compact" onClick={onLoadFromReport} type="button">Cari hesabatdan götür</button>
        )}
      </SectionHeading>
      {mappings.length === 0 && <EmptyState>Uyğunlaşdırma sətri yoxdur. Əlavə edin və ya AI təklifindən köçürün.</EmptyState>}
      {mappings.map((row, index) => (
        <div className={kinds.length === 2 ? 'mapping-row two-way' : 'mapping-row'} key={index}>
          {kinds.map((kind) => (
            <label className="form-field" key={kind}>
              <span>{KIND_SHORT[kind]}</span>
              <select onChange={(event) => update(index, kind, event.target.value)} value={row[kind]}>
                <option value="">Seçin…</option>
                {(docs[kind]?.data?.lines || []).map((_, lineIndex) => (
                  <option key={lineIndex} value={String(lineIndex)}>{lineLabel(docs[kind], lineIndex)}</option>
                ))}
              </select>
            </label>
          ))}
          <button aria-label="Sətri sil" className="ghost-button compact" onClick={() => setMappings((current) => current.filter((_, i) => i !== index))} type="button">Sil</button>
        </div>
      ))}
      <div className="doc-actions">
        <button className="ghost-button compact" onClick={() => setMappings((current) => [...current, Object.fromEntries(kinds.map((kind) => [kind, '']))])} type="button">+ Sətir əlavə et</button>
        <button className="primary-button compact" disabled={Boolean(busy) || !valid} onClick={onCompare} type="button">
          {busy === 'compare-manual' ? 'Müqayisə edilir…' : 'Bu uyğunlaşdırma ilə müqayisə et'}
        </button>
      </div>
    </div>
  )
}

function ReviewPanel({ caseData, report, busy, onSubmit }) {
  const [decision, setDecision] = useState(caseData.status === 'matched' ? 'approved' : 'disputed')
  const [note, setNote] = useState('')
  const canApprove = caseData.status === 'matched'

  async function submit(event) {
    event.preventDefault()
    const result = await onSubmit(decision, note.trim())
    if (result) setNote('')
  }

  return (
    <article className="evidence-panel">
      <SectionHeading kicker="Addım 4" title="İnsan qərarı" />
      {caseData.decision && (
        <div className="current-decision">
          <span>Cari qərar</span>
          <strong>{DECISIONS[caseData.decision] || caseData.decision}</strong>
          {caseData.decision_note && <p>{caseData.decision_note}</p>}
        </div>
      )}
      {report ? (
        <form className="review-form" onSubmit={submit}>
          <label className="form-field">
            <span>Qərar</span>
            <select onChange={(event) => setDecision(event.target.value)} value={decision}>
              <option disabled={!canApprove} value="approved">Təsdiqlə{canApprove ? '' : ' (yalnız uyğun hesabat üçün)'}</option>
              <option value="disputed">Etiraz et</option>
              <option value="needs_review">Əlavə yoxlama</option>
            </select>
          </label>
          <label className="form-field">
            <span>Qeyd (məcburi)</span>
            <textarea maxLength={2000} onChange={(event) => setNote(event.target.value)} required rows={3} value={note} />
          </label>
          <button className="primary-button" disabled={Boolean(busy) || !note.trim() || (decision === 'approved' && !canApprove)} type="submit">
            {busy === 'review' ? 'Saxlanılır…' : 'Qərarı göndər'}
          </button>
        </form>
      ) : (
        <EmptyState>Qərar üçün əvvəl müqayisə hesabatı lazımdır.</EmptyState>
      )}
    </article>
  )
}

function HistoryList({ events }) {
  if (events.length === 0) return <EmptyState>Hələ hadisə yoxdur.</EmptyState>
  return (
    <ol className="history-list">
      {[...events].reverse().map((event) => (
        <li key={event.id}>
          <div>
            <strong>{EVENT_LABELS[event.action] || event.action}</strong>
            <span>{formatDate(event.created_at)}</span>
          </div>
          {event.payload && Object.keys(event.payload).length > 0 && (
            <details>
              <summary>Detallar</summary>
              <pre>{JSON.stringify(event.payload, null, 2)}</pre>
            </details>
          )}
        </li>
      ))}
    </ol>
  )
}

async function copyText(text, setNotice) {
  try {
    await navigator.clipboard.writeText(text)
    setNotice({ tone: 'success', text: 'Məktub kopyalandı.' })
  } catch {
    setNotice({ tone: 'error', text: 'Kopyalamaq alınmadı; mətni əl ilə seçin.' })
  }
}
