import { useMemo, useState } from 'react'
import './App.css'
import heroLayer from './assets/hero.png'

const demoDocuments = [
  { name: 'Satınalma sifarişi', id: 'PO-1048', status: 'Oxundu', detail: 'AI etibarı: 98%', tone: 'green', analyzed: true, confidence: 98, mismatch: false, mismatchReason: 'Bu sənəddə uyğunsuzluq yoxdur.', type: 'Sifariş', size: '142 KB' },
  { name: 'Qəbul sənədi', id: 'GRN-2217', status: 'Oxundu', detail: 'AI etibarı: 94%', tone: 'green', analyzed: true, confidence: 94, mismatch: false, mismatchReason: 'Bu sənəddə uyğunsuzluq yoxdur.', type: 'Qəbul sənədi', size: '86 KB' },
  { name: 'Təchizatçı fakturası', id: 'INV-7741', status: 'Uyğunsuzluq tapıldı', detail: 'AI etibarı: 91%', tone: 'amber', analyzed: true, confidence: 91, mismatch: true, mismatchReason: 'A4 kağız 80 q/m² üzrə fakturada 100 ədəd göstərilib, qəbul sənədində isə 80 ədəd var. Fərq: 20 ədəd × 12 AZN = 240 AZN.', type: 'Faktura', size: '211 KB' },
]

const initialRows = [
  { id: 1, item: 'A4 kağız 80 q/m²', ordered: 100, received: 80, invoiced: 100, unitPrice: 12 },
  { id: 2, item: 'Printer toner HP 59A', ordered: 12, received: 12, invoiced: 12, unitPrice: 89 },
  { id: 3, item: 'Qablaşdırma etiketi', ordered: 30, received: '', invoiced: 30, unitPrice: 7 },
]

const navItems = ['Dashboard', 'Sənədlər', 'Yoxlama', 'Hesabatlar', 'Ayarlar']

function App() {
  const [activePage, setActivePage] = useState('Dashboard')
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [selectedDocId, setSelectedDocId] = useState(demoDocuments[2].id)
  const [rows, setRows] = useState(initialRows)

  const shownDocuments = uploadedFiles.length > 0 ? uploadedFiles : demoDocuments
  const selectedDocument = shownDocuments.find((doc) => doc.id === selectedDocId) || shownDocuments[0]
  const uploadSummary = buildUploadSummary(shownDocuments)
  const analysis = useMemo(() => buildAnalysis(rows), [rows])

  function addFiles(fileList) {
    const nextFiles = Array.from(fileList || [])
    if (nextFiles.length === 0) return
    setUploadedFiles((current) => {
      const newDocuments = nextFiles.map((file, index) => createUploadedDocument(file, current.length + index))
      setSelectedDocId(newDocuments[0].id)
      return [...current, ...newDocuments]
    })
    setActivePage('Sənədlər')
  }

  function clearFiles() {
    setUploadedFiles([])
    setSelectedDocId(demoDocuments[2].id)
  }

  function analyzeFiles() {
    setUploadedFiles((current) => current.map((doc, index) => {
      const confidence = Math.max(82, 96 - index * 3)
      const mismatch = index === current.length - 1 || /faktura|invoice|inv/i.test(doc.name)

      return {
        ...doc,
        analyzed: true,
        confidence,
        mismatch,
        mismatchReason: mismatch
          ? 'Demo analizə görə fakturada göstərilən miqdar qəbul sənədindən çoxdur. Yoxlama cədvəlində dəqiq miqdar və məbləğə baxın.'
          : 'Bu sənəddə uyğunsuzluq görünmür.',
        status: mismatch ? 'Uyğunsuzluq tapıldı' : 'Oxundu',
        detail: `AI etibarı: ${confidence}%`,
        tone: mismatch ? 'amber' : 'green',
      }
    }))
  }

  function updateRow(id, field, value) {
    setRows((current) => current.map((row) => (
      row.id === id ? { ...row, [field]: value } : row
    )))
  }

  return (
    <main className="app-shell">
      <nav className="topbar" aria-label="Əsas naviqasiya">
        <button className="brand" onClick={() => setActivePage('Dashboard')} type="button">
          <span className="brand-mark">HC</span>
          <span>HesabCheck</span>
        </button>

        <div className="page-tabs" role="tablist" aria-label="Səhifələr">
          {navItems.map((item) => (
            <button
              className={activePage === item ? 'page-tab active' : 'page-tab'}
              key={item}
              onClick={() => setActivePage(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
      </nav>

      {activePage === 'Dashboard' && (
        <DashboardPage addFiles={addFiles} analysis={analysis} analyzeFiles={analyzeFiles} setActivePage={setActivePage} shownDocuments={shownDocuments} uploadSummary={uploadSummary} />
      )}
      {activePage === 'Sənədlər' && (
        <DocumentsPage addFiles={addFiles} analyzeFiles={analyzeFiles} clearFiles={clearFiles} selectedDocId={selectedDocId} setActivePage={setActivePage} setSelectedDocId={setSelectedDocId} shownDocuments={shownDocuments} uploadedFiles={uploadedFiles} uploadSummary={uploadSummary} />
      )}
      {activePage === 'Sənəd detalı' && (
        <DocumentDetailPage document={selectedDocument} setActivePage={setActivePage} />
      )}
      {activePage === 'Yoxlama' && <ReviewPage analysis={analysis} rows={rows} updateRow={updateRow} />}
      {activePage === 'Hesabatlar' && <ReportsPage analysis={analysis} rows={rows} />}
      {activePage === 'Ayarlar' && <SettingsPage />}
    </main>
  )
}

function DashboardPage({ addFiles, analysis, analyzeFiles, setActivePage, shownDocuments, uploadSummary }) {
  const mainMismatch = analysis.rows.find((row) => row.status === 'Uyğunsuzluq')

  return (
    <>
      <section className="hero-section">
        <div className="hero-copy">
          <p className="eyebrow">AI dəstəkli three-way matching</p>
          <h1>Sənədləri yüklə, fərqi dərhal gör.</h1>
          <p className="hero-text">
            Satınalma sifarişi, qəbul sənədi və faktura bir-biri ilə müqayisə olunur.
            Uyğunsuzluq varsa məbləğ və mənbə sətirləri göstərilir.
          </p>
          <div className="hero-actions">
            <button className="primary-button large" onClick={() => setActivePage('Sənədlər')} type="button">Sənəd yüklə</button>
            <button className="secondary-button large" onClick={() => setActivePage('Yoxlama')} type="button">Yoxlama nəticəsi</button>
          </div>
        </div>

        <div className="hero-visual" aria-label="Demo nəticə kartı">
          <img src={heroLayer} alt="" className="layer-art" />
          <div className="risk-card">
            <span className="risk-label">Risk məbləği</span>
            <strong>{formatMoney(analysis.totalRisk)}</strong>
            <small>
              {mainMismatch
                ? `${mainMismatch.ordered} sifariş / ${mainMismatch.received} qəbul / ${mainMismatch.invoiced} faktura`
                : 'Bütün sətirlər uyğun görünür'}
            </small>
          </div>
        </div>
      </section>

      <section className="simple-grid">
        <UploadPanel addFiles={addFiles} analyzeFiles={analyzeFiles} documents={shownDocuments} uploadSummary={uploadSummary} />
        <QuickResult analysis={analysis} />
      </section>
    </>
  )
}

function DocumentsPage({
  addFiles,
  analyzeFiles,
  clearFiles,
  selectedDocId,
  setSelectedDocId,
  setActivePage,
  shownDocuments,
  uploadedFiles,
  uploadSummary,
}) {
  return (
    <section className="page-layout">
      <PageHeader title="Sənədlər" text="Buradan PDF, şəkil və ya skan fayllarını seçə bilərsiniz. Seçilən fayllar aşağıdakı siyahıda görünür." />
      <section className="simple-grid">
        <UploadPanel addFiles={addFiles} analyzeFiles={analyzeFiles} clearFiles={clearFiles} documents={shownDocuments} uploadSummary={uploadSummary} />
        <article className="clean-panel">
          <div className="section-heading inline">
            <div>
              <span className="section-kicker">Siyahı</span>
              <h2>{uploadedFiles.length > 0 ? 'Yüklədiyiniz fayllar' : 'Demo sənədlər'}</h2>
            </div>
            <span className="confidence">{shownDocuments.length} sənəd</span>
          </div>

          <DocumentList documents={shownDocuments} onSelect={(docId) => {
            setSelectedDocId(docId)
            setActivePage('Sənəd detalı')
          }} relaxed selectedDocId={selectedDocId} />
        </article>
      </section>
    </section>
  )
}

function ReviewPage({ analysis, rows, updateRow }) {
  return (
    <section className="page-layout">
      <PageHeader title="Yoxlama" text="Miqdarları dəyişin, fərq və status avtomatik yenilənsin." />
      <QuickResult analysis={analysis} />
      <section className="clean-panel">
        <MatchTable analysisRows={analysis.rows} rows={rows} updateRow={updateRow} editable />
      </section>
      <EvidenceAndLetter analysis={analysis} />
    </section>
  )
}

function ReportsPage({ analysis, rows }) {
  const reportCards = [
    { title: 'Risk məbləği', value: formatMoney(analysis.totalRisk) },
    { title: 'Uyğunsuz sətir', value: String(analysis.mismatchCount) },
    { title: 'Yoxlama lazımdır', value: String(analysis.reviewCount) },
  ]

  return (
    <section className="page-layout">
      <PageHeader title="Hesabatlar" text="Bu metriklər yoxlama cədvəlindəki cari məlumatlardan hesablanır." />
      <div className="report-grid">
        {reportCards.map((report) => (
          <article className="report-card" key={report.title}>
            <span>{report.title}</span>
            <strong>{report.value}</strong>
          </article>
        ))}
      </div>
      <article className="clean-panel">
        <div className="section-heading">
          <span className="section-kicker">Son nəticə</span>
          <h2>{analysis.headline}</h2>
        </div>
        <MatchTable analysisRows={analysis.rows} rows={rows} />
      </article>
    </section>
  )
}

function SettingsPage() {
  return (
    <section className="page-layout">
      <PageHeader title="Ayarlar" text="MVP üçün qaydalar qısa saxlanılıb. Real layihədə bu hissə backend ilə idarə olunacaq." />
      <div className="settings-grid">
        <article className="settings-panel">
          <div className="section-heading">
            <span className="section-kicker">AI qaydaları</span>
            <h2>Çıxarış</h2>
          </div>
          <ToggleRow label="JSON sxemi məcburi olsun" enabled />
          <ToggleRow label="Oxunmayan sahəni null saxla" enabled />
          <ToggleRow label="Qeyri-müəyyən nəticəni insana göndər" enabled />
        </article>
        <article className="settings-panel">
          <div className="section-heading">
            <span className="section-kicker">Limitlər</span>
            <h2>Risk hədləri</h2>
          </div>
          <Field label="Valyuta" value="AZN" />
          <Field label="İnsan yoxlaması" value="50 AZN və yuxarı" />
          <Field label="Saxlanma müddəti" value="90 gün" />
        </article>
      </div>
    </section>
  )
}

function UploadPanel({ addFiles, analyzeFiles, documents, clearFiles, uploadSummary }) {
  function handleDrop(event) {
    event.preventDefault()
    addFiles(event.dataTransfer.files)
  }

  return (
    <aside className="upload-panel">
      <div className="section-heading">
        <span className="section-kicker">Yükləmə</span>
        <h2>Sənəd əlavə et</h2>
      </div>

      <label
        className="dropzone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <input type="file" multiple accept=".pdf,image/*" onChange={(event) => addFiles(event.target.files)} />
        <span className="upload-icon">↑</span>
        <strong>Fayl seç və ya bura sürüklə</strong>
        <small>PDF, PNG, JPG dəstəklənir</small>
      </label>

      <button className="primary-button full-button" disabled={!uploadSummary.hasUploadedFiles} onClick={analyzeFiles} type="button">
        AI ilə oxu
      </button>

      <div className="upload-summary">
        <div>
          <span>AI etibarı</span>
          <strong>{uploadSummary.confidenceText}</strong>
        </div>
        <div>
          <span>Uyğunsuzluq</span>
          <strong>{uploadSummary.mismatchText}</strong>
        </div>
      </div>

      <DocumentList documents={documents.slice(0, 3)} />

      {clearFiles && (
        <button className="ghost-button full-button" onClick={clearFiles} type="button">Siyahını təmizlə</button>
      )}
    </aside>
  )
}

function DocumentList({ documents, onSelect, relaxed = false, selectedDocId }) {
  return (
    <div className={relaxed ? 'document-list relaxed' : 'document-list'}>
      {documents.map((doc) => (
        <button
          className={selectedDocId === doc.id ? 'document-row active-doc' : 'document-row'}
          disabled={!doc.analyzed || !onSelect}
          key={`${doc.id}-${doc.name}`}
          onClick={() => onSelect?.(doc.id)}
          type="button"
        >
          <div>
            <strong>{doc.name}</strong>
            <span>{doc.id}</span>
          </div>
          <div className={`status-pill ${doc.tone}`}>
            <strong>{doc.status}</strong>
            <span>{doc.detail}</span>
          </div>
        </button>
      ))}
    </div>
  )
}

function DocumentDetailPage({ document, setActivePage }) {
  if (!document) return null

  return (
    <section className="page-layout">
      <button className="ghost-button back-button" onClick={() => setActivePage('Sənədlər')} type="button">← Sənədlərə qayıt</button>

      <article className="clean-panel document-details">
        <div className="section-heading inline">
          <div>
            <span className="section-kicker">Sənəd detalı</span>
            <h2>{document.name}</h2>
            <p>{document.analyzed ? 'Analiz nəticəsi hazırdır.' : 'Fayl hələ AI ilə oxunmayıb.'}</p>
          </div>
          <span className={`status-pill ${document.tone}`}>
            <strong>{document.status}</strong>
            <span>{document.detail}</span>
          </span>
        </div>

        <div className="field-grid">
          <Field label="Sənəd növü" value={document.type || 'Avtomatik təyin olunacaq'} />
          <Field label="Fayl ölçüsü" value={document.size || 'Naməlum'} />
          <Field label="AI etibarı" value={document.analyzed ? `${document.confidence}%` : 'Oxunmayıb'} />
          <Field label="Uyğunsuzluq" value={document.analyzed ? (document.mismatch ? 'Var' : 'Yoxdur') : 'Oxunmayıb'} />
        </div>
      </article>

      <article className={document.mismatch ? 'clean-panel mismatch-detail warning' : 'clean-panel mismatch-detail'}>
        <div className="section-heading">
          <span className="section-kicker">Uyğunsuzluq detalı</span>
          <h2>{document.mismatch ? 'Nə uyğunsuzdur?' : 'Uyğunsuzluq tapılmadı'}</h2>
        </div>
        <p>{document.analyzed ? document.mismatchReason : 'Əvvəlcə sənədi AI ilə oxutmaq lazımdır.'}</p>
      </article>
    </section>
  )
}

function QuickResult({ analysis }) {
  return (
    <article className="clean-panel result-overview">
      <div>
        <span className="section-kicker">Nəticə</span>
        <h2>{analysis.title}</h2>
        <p>{analysis.description}</p>
      </div>
      <div className={analysis.totalRisk > 0 ? 'result-amount' : 'result-amount ok-amount'}>
        <span>Risk məbləği</span>
        <strong>{formatMoney(analysis.totalRisk)}</strong>
      </div>
    </article>
  )
}

function MatchTable({ analysisRows, rows, updateRow, editable = false }) {
  return (
    <div className="match-table-wrap">
      <table className="match-table">
        <thead>
          <tr>
            <th>Məhsul</th>
            <th>Sifariş</th>
            <th>Qəbul</th>
            <th>Faktura</th>
            <th>Vahid qiymət</th>
            <th>Fərq</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {analysisRows.map((match) => {
            const rawRow = rows.find((row) => row.id === match.id)

            return (
              <tr key={match.id}>
                <td><strong>{match.item}</strong></td>
                <td>{editable ? <NumberInput value={rawRow.ordered} onChange={(value) => updateRow(match.id, 'ordered', value)} /> : match.ordered}</td>
                <td>{editable ? <NumberInput value={rawRow.received} onChange={(value) => updateRow(match.id, 'received', value)} /> : match.receivedLabel}</td>
                <td>{editable ? <NumberInput value={rawRow.invoiced} onChange={(value) => updateRow(match.id, 'invoiced', value)} /> : match.invoiced}</td>
                <td>{editable ? <NumberInput value={rawRow.unitPrice} onChange={(value) => updateRow(match.id, 'unitPrice', value)} /> : `${match.unitPrice} AZN`}</td>
                <td>{match.deltaLabel}</td>
                <td>
                  <span className={`result-badge ${match.status === 'Uyğundur' ? 'ok' : match.status === 'Uyğunsuzluq' ? 'bad' : 'review'}`}>
                    {match.status}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function NumberInput({ value, onChange }) {
  return (
    <input
      className="number-input"
      min="0"
      onChange={(event) => onChange(event.target.value)}
      type="number"
      value={value}
    />
  )
}

function EvidenceAndLetter({ analysis }) {
  const mismatch = analysis.rows.find((row) => row.status === 'Uyğunsuzluq')

  return (
    <section className="bottom-grid">
      <article className="evidence-panel">
        <div className="section-heading">
          <span className="section-kicker">Mənbə</span>
          <h2>Tapıntı nə ilə əsaslanır?</h2>
        </div>
        <div className="evidence-list">
          {mismatch ? (
            <>
              <p><b>PO-1048:</b> {mismatch.item}, {mismatch.ordered} ədəd sifariş edilib</p>
              <p><b>GRN-2217:</b> {mismatch.received} ədəd qəbul edilib</p>
              <p><b>INV-7741:</b> {mismatch.invoiced} ədəd fakturalanıb</p>
            </>
          ) : (
            <p><b>Nəticə:</b> Uyğunsuzluq tapılmadı, ödəniş təsdiqə göndərilə bilər.</p>
          )}
        </div>
      </article>

      <article className="letter-panel">
        <div className="section-heading">
          <span className="section-kicker">AI qaralama</span>
          <h2>Etiraz məktubu</h2>
        </div>
        <p>{analysis.letter}</p>
      </article>
    </section>
  )
}

function PageHeader({ title, text }) {
  return (
    <header className="page-header">
      <span className="section-kicker">HesabCheck</span>
      <h1>{title}</h1>
      <p>{text}</p>
    </header>
  )
}

function Field({ label, value }) {
  return (
    <div className="field-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function ToggleRow({ label, enabled = false }) {
  return (
    <div className="toggle-row">
      <span>{label}</span>
      <button className={enabled ? 'toggle on' : 'toggle'} aria-label={label} type="button">
        <span />
      </button>
    </div>
  )
}

function createUploadedDocument(file, index) {
  return {
    analyzed: false,
    confidence: null,
    detail: formatFileSize(file.size),
    id: `UP-${String(index + 1).padStart(3, '0')}`,
    mismatch: false,
    mismatchReason: 'Fayl hələ AI ilə oxunmayıb.',
    name: file.name,
    size: formatFileSize(file.size),
    status: 'Yükləndi',
    tone: 'blue',
    type: guessDocumentType(file.name),
  }
}

function buildUploadSummary(documents) {
  const uploadedDocuments = documents.filter((doc) => doc.id.startsWith('UP-'))
  const analyzedDocuments = documents.filter((doc) => doc.analyzed)
  const confidenceValues = analyzedDocuments
    .map((doc) => doc.confidence)
    .filter((confidence) => typeof confidence === 'number')
  const averageConfidence = confidenceValues.length
    ? Math.round(confidenceValues.reduce((sum, confidence) => sum + confidence, 0) / confidenceValues.length)
    : null
  const hasMismatch = analyzedDocuments.some((doc) => doc.mismatch)

  return {
    confidenceText: averageConfidence ? `${averageConfidence}%` : 'Hələ oxunmayıb',
    hasUploadedFiles: uploadedDocuments.length > 0,
    mismatchText: analyzedDocuments.length === 0 ? 'Hələ bilinmir' : hasMismatch ? 'Var' : 'Yoxdur',
  }
}

function buildAnalysis(rows) {
  const analysisRows = rows.map((row) => {
    const ordered = toNumber(row.ordered)
    const received = toNumber(row.received)
    const invoiced = toNumber(row.invoiced)
    const unitPrice = toNumber(row.unitPrice)
    const needsReview = row.received === '' || Number.isNaN(received)
    const quantityGap = needsReview ? 0 : Math.max(0, invoiced - received)
    const delta = quantityGap * unitPrice
    const status = needsReview ? 'İnsan yoxlaması' : delta > 0 ? 'Uyğunsuzluq' : 'Uyğundur'

    return {
      ...row,
      ordered,
      received,
      receivedLabel: needsReview ? 'Oxunmur' : received,
      invoiced,
      unitPrice,
      delta,
      deltaLabel: needsReview ? 'Yoxlama' : formatMoney(delta),
      status,
    }
  })

  const totalRisk = analysisRows.reduce((sum, row) => sum + row.delta, 0)
  const mismatchCount = analysisRows.filter((row) => row.status === 'Uyğunsuzluq').length
  const reviewCount = analysisRows.filter((row) => row.status === 'İnsan yoxlaması').length
  const firstMismatch = analysisRows.find((row) => row.status === 'Uyğunsuzluq')
  const title = totalRisk > 0 ? 'Uyğunsuzluq var' : reviewCount > 0 ? 'İnsan yoxlaması lazımdır' : 'Uyğundur'
  const description = firstMismatch
    ? `${firstMismatch.item} üzrə qəbul ${firstMismatch.received}, faktura ${firstMismatch.invoiced} ədəddir.`
    : reviewCount > 0
      ? 'Bəzi sahələr oxunmadığı üçün yekun qərar insana göndərilir.'
      : 'Sifariş, qəbul və faktura məlumatları uyğun görünür.'
  const headline = firstMismatch
    ? `${firstMismatch.item} üzrə ${formatMoney(firstMismatch.delta)} fərq tapılıb`
    : title
  const letter = firstMismatch
    ? `Hörmətli təchizatçı, fakturada ${firstMismatch.item} üzrə ${firstMismatch.invoiced} ədəd göstərilib. Qəbul sənədinə əsasən faktiki qəbul ${firstMismatch.received} ədəddir. Xahiş edirik ${formatMoney(firstMismatch.delta)} fərq üzrə düzəliş edilmiş faktura göndərəsiniz.`
    : 'Hazırda etiraz məktubu tələb edən uyğunsuzluq yoxdur.'

  return { description, headline, letter, mismatchCount, reviewCount, rows: analysisRows, title, totalRisk }
}

function guessDocumentType(fileName) {
  if (/po|sifaris|sifariş|order/i.test(fileName)) return 'Sifariş'
  if (/grn|qebul|qəbul|receipt/i.test(fileName)) return 'Qəbul sənədi'
  if (/inv|invoice|faktura/i.test(fileName)) return 'Faktura'
  return 'Sənəd'
}

function toNumber(value) {
  if (value === '') return Number.NaN
  return Number(value)
}

function formatMoney(value) {
  return `${Math.round(value).toLocaleString('az-AZ')} AZN`
}

function formatFileSize(size) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export default App
