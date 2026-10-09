import { useCallback, useEffect, useState } from 'react'
import './App.css'
import { api, saveBlob } from './api'
import heroLayer from './assets/hero.png'
import CaseWorkspace from './components/CaseWorkspace'
import { IssuesList, MatchesTable, ReportSummary } from './components/ReportView'
import { Badge, EmptyState, Field, Notice, PageHeader, Pill, SectionHeading } from './components/ui'
import { CASE_STATUS, DECISIONS, formatAmount, formatDate, statusInfo } from './format'

const navItems = ['Dashboard', 'Yoxlamalar', 'Hesabatlar', 'Ayarlar']

function App() {
  const [activePage, setActivePage] = useState('Dashboard')
  const [selectedCaseId, setSelectedCaseId] = useState(null)
  const [page, setPage] = useState(1)
  const [cases, setCases] = useState({ count: 0, results: [], next: null, previous: null })
  const [listState, setListState] = useState({ loading: true, error: '' })

  const loadCases = useCallback(async (targetPage) => {
    try {
      const data = await api.listCases(targetPage)
      setCases(data)
      setListState({ loading: false, error: '' })
    } catch (error) {
      setListState({ loading: false, error: error.message })
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- server siyahısını səhifə dəyişəndə yükləyirik
    loadCases(page)
  }, [loadCases, page])

  function openCase(id) {
    setSelectedCaseId(id)
    setActivePage('Yoxlama')
  }

  async function deleteCase(item) {
    if (!window.confirm(`"${item.title}" yoxlaması, sənədləri və tarixçəsi birdəfəlik silinsin?`)) return false
    await api.deleteCase(item.id)
    if (selectedCaseId === item.id) {
      setSelectedCaseId(null)
      if (activePage === 'Yoxlama') setActivePage('Yoxlamalar')
    }
    // Səhifədəki son element silinibsə, əvvəlki səhifəyə keçirik.
    if (cases.results.length === 1 && page > 1) setPage(page - 1)
    else await loadCases(page)
    return true
  }

  async function createCase(values) {
    const created = await api.createCase(values)
    if (page === 1) await loadCases(1)
    else setPage(1)
    openCase(created.id)
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
              className={activePage === item || (item === 'Yoxlamalar' && activePage === 'Yoxlama') ? 'page-tab active' : 'page-tab'}
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
        <DashboardPage cases={cases} listState={listState} onCreate={createCase} onDelete={deleteCase} onOpen={openCase} setActivePage={setActivePage} />
      )}
      {activePage === 'Yoxlamalar' && (
        <CasesPage cases={cases} listState={listState} onCreate={createCase} onDelete={deleteCase} onOpen={openCase} page={page} setPage={setPage} />
      )}
      {activePage === 'Yoxlama' && selectedCaseId && (
        <CaseWorkspace caseId={selectedCaseId} key={selectedCaseId} onBack={() => setActivePage('Yoxlamalar')} onChanged={() => loadCases(page)} onDelete={deleteCase} />
      )}
      {activePage === 'Hesabatlar' && <ReportsPage cases={cases} onOpen={openCase} />}
      {activePage === 'Ayarlar' && <SettingsPage />}
    </main>
  )
}

function DashboardPage({ cases, listState, onCreate, onDelete, onOpen, setActivePage }) {
  const results = cases.results
  const withReport = results.filter((item) => item.report && Object.keys(item.report).length > 0)
  const riskByCurrency = withReport.reduce((sums, item) => {
    const currency = item.report.currency || '—'
    sums[currency] = (sums[currency] || 0) + Number(item.report.disputed_amount || 0)
    return sums
  }, {})
  const riskText = Object.keys(riskByCurrency).length
    ? Object.entries(riskByCurrency).map(([currency, sum]) => formatAmount(sum, currency === '—' ? '' : currency)).join(' + ')
    : formatAmount(0, 'AZN')
  const counts = Object.fromEntries(Object.keys(CASE_STATUS).map((key) => [key, results.filter((item) => item.status === key).length]))

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
            <button className="primary-button large" onClick={() => setActivePage('Yoxlamalar')} type="button">Yeni yoxlama</button>
            <button className="secondary-button large" onClick={() => setActivePage('Hesabatlar')} type="button">Hesabatlar</button>
          </div>
        </div>

        <div className="hero-visual" aria-label="Ümumi risk kartı">
          <img src={heroLayer} alt="" className="layer-art" />
          <div className="risk-card">
            <span className="risk-label">Mübahisəli məbləğ (son {results.length} yoxlama)</span>
            <strong>{riskText}</strong>
            <small>{counts.mismatch} uyğunsuz · {counts.needs_review} yoxlama tələb edir · {counts.matched} uyğun</small>
          </div>
        </div>
      </section>

      <section className="simple-grid">
        <CreateCaseForm onCreate={onCreate} />
        <article className="clean-panel">
          <SectionHeading kicker="Son yoxlamalar" title={`Cəmi ${cases.count} yoxlama`}>
            <button className="ghost-button compact" onClick={() => setActivePage('Yoxlamalar')} type="button">Hamısı</button>
          </SectionHeading>
          <CaseList listState={listState} onDelete={onDelete} onOpen={onOpen} results={results.slice(0, 6)} />
        </article>
      </section>
    </>
  )
}

function CasesPage({ cases, listState, onCreate, onDelete, onOpen, page, setPage }) {
  const pageCount = Math.max(1, Math.ceil(cases.count / 25))

  return (
    <section className="page-layout">
      <PageHeader title="Yoxlamalar" text="Hər yoxlama bir sifariş, bir qəbul sənədi və bir fakturadan ibarətdir. Yeni yoxlama yaradın və ya mövcud olanı açın." />
      <section className="simple-grid">
        <CreateCaseForm onCreate={onCreate} />
        <article className="clean-panel">
          <SectionHeading kicker="Siyahı" title={`${cases.count} yoxlama`} />
          <CaseList listState={listState} onDelete={onDelete} onOpen={onOpen} results={cases.results} />
          {pageCount > 1 && (
            <div className="pagination">
              <button className="ghost-button compact" disabled={!cases.previous} onClick={() => setPage(page - 1)} type="button">← Əvvəlki</button>
              <span>{page} / {pageCount}</span>
              <button className="ghost-button compact" disabled={!cases.next} onClick={() => setPage(page + 1)} type="button">Növbəti →</button>
            </div>
          )}
        </article>
      </section>
    </section>
  )
}

function CreateCaseForm({ onCreate }) {
  const [values, setValues] = useState({ title: '', supplier: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await onCreate({ title: values.title.trim(), supplier: values.supplier.trim() })
      setValues({ title: '', supplier: '' })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="upload-panel" onSubmit={submit}>
      <SectionHeading kicker="Yeni" title="Yoxlama yarat" />
      <label className="form-field">
        <span>Başlıq *</span>
        <input maxLength={200} onChange={(event) => setValues({ ...values, title: event.target.value })} placeholder="Məsələn: Ofis kağızı alışı – oktyabr" required value={values.title} />
      </label>
      <label className="form-field">
        <span>Təchizatçı</span>
        <input maxLength={200} onChange={(event) => setValues({ ...values, supplier: event.target.value })} placeholder="Məsələn: Demo Təchizatçı MMC" value={values.supplier} />
      </label>
      <Notice>{error}</Notice>
      <button className="primary-button full-button" disabled={busy || !values.title.trim()} type="submit">{busy ? 'Yaradılır…' : 'Yarat və aç'}</button>
    </form>
  )
}

function CaseList({ results, listState, onOpen, onDelete }) {
  const [deletingId, setDeletingId] = useState(null)
  const [error, setError] = useState('')

  if (listState.loading) return <p className="loading-text">Yüklənir…</p>
  if (listState.error) return <Notice>{listState.error}</Notice>
  if (results.length === 0) return <EmptyState>Hələ yoxlama yoxdur. Soldakı formadan yaradın.</EmptyState>

  async function remove(item) {
    setDeletingId(item.id)
    setError('')
    try {
      await onDelete(item)
    } catch (err) {
      setError(err.message)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="document-list relaxed">
      <Notice onClose={() => setError('')}>{error}</Notice>
      {results.map((item) => {
        const status = statusInfo(CASE_STATUS, item.status)
        const amount = item.report?.disputed_amount
        return (
          <div className="case-list-row" key={item.id}>
            <button className="document-row" onClick={() => onOpen(item.id)} type="button">
              <div>
                <strong>{item.title}</strong>
                <span>{item.supplier || 'Təchizatçı yoxdur'} · {item.documents.length}/3 sənəd · {formatDate(item.created_at)}</span>
              </div>
              <Pill detail={amount ? formatAmount(amount, item.report.currency) : item.decision ? DECISIONS[item.decision] : undefined} tone={status.tone}>
                {status.label}
              </Pill>
            </button>
            <button
              aria-label={`${item.title} yoxlamasını sil`}
              className="delete-button"
              disabled={deletingId === item.id}
              onClick={() => remove(item)}
              title="Sil"
              type="button"
            >
              {deletingId === item.id ? '…' : 'Sil'}
            </button>
          </div>
        )
      })}
    </div>
  )
}

function ReportsPage({ cases, onOpen }) {
  const reportable = cases.results.filter((item) => item.report && Object.keys(item.report).length > 0)
  const [chosenId, setChosenId] = useState(null)
  const selectedId = chosenId || reportable[0]?.id || null
  const setSelectedId = setChosenId
  const [state, setState] = useState({ error: '', data: null })

  useEffect(() => {
    if (!selectedId) return
    let active = true
    api.getReport(selectedId)
      .then((data) => active && setState({ error: '', data }))
      .catch((error) => active && setState({ error: error.message, data: null }))
    return () => {
      active = false
    }
  }, [selectedId])

  const data = state.data?.case_id === selectedId ? state.data : null
  const selectedCase = cases.results.find((item) => item.id === selectedId)

  return (
    <section className="page-layout">
      <PageHeader title="Hesabatlar" text="Müqayisə aparılmış yoxlamaların JSON hesabatı. Hesabatı seçin, baxın və ya fayl kimi endirin." />
      {reportable.length === 0 ? (
        <article className="clean-panel"><EmptyState>Hələ hesabatı olan yoxlama yoxdur.</EmptyState></article>
      ) : (
        <>
          <div className="report-grid">
            {reportable.slice(0, 3).map((item) => (
              <button className={item.id === selectedId ? 'report-card selectable active-doc' : 'report-card selectable'} key={item.id} onClick={() => setSelectedId(item.id)} type="button">
                <span>{item.title}</span>
                <strong>{formatAmount(item.report.disputed_amount, item.report.currency)}</strong>
                <p><Badge tone={statusInfo(CASE_STATUS, item.status).tone}>{statusInfo(CASE_STATUS, item.status).label}</Badge></p>
              </button>
            ))}
          </div>
          {reportable.length > 3 && (
            <label className="form-field narrow-field">
              <span>Başqa hesabat</span>
              <select onChange={(event) => setSelectedId(event.target.value)} value={selectedId || ''}>
                {reportable.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
              </select>
            </label>
          )}

          {state.error && !data && <Notice>{state.error}</Notice>}
          {!data && !state.error && <p className="loading-text">Hesabat yüklənir…</p>}
          {data && (
            <>
              <ReportSummary report={data.report} />
              <article className="clean-panel">
                <SectionHeading kicker={data.supplier || 'Təchizatçı yoxdur'} title={data.title}>
                  <button className="ghost-button compact" onClick={() => saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `hesabat-${data.case_id}.json`)} type="button">JSON endir</button>
                  <button className="secondary-button compact" onClick={() => onOpen(data.case_id)} type="button">Yoxlamanı aç</button>
                </SectionHeading>
                <div className="field-grid report-fields">
                  <Field label="Qərar" value={data.decision ? DECISIONS[data.decision] || data.decision : 'Qərar verilməyib'} />
                  <Field label="Qərar qeydi" value={data.decision_note || '—'} />
                  <Field label="Məbləğ tamdır" value={data.report.amount_complete ? 'Bəli' : 'Xeyr'} />
                  <Field label="Əhatə" value={data.report.scope || '—'} />
                </div>
                <MatchesTable report={data.report} />
              </article>
              <article className="clean-panel">
                <SectionHeading kicker="Qeydlər" title="Yoxlama tələb edən məqamlar" />
                <IssuesList documents={selectedCase?.documents} report={data.report} />
              </article>
            </>
          )}
        </>
      )}
    </section>
  )
}

function SettingsPage() {
  return (
    <section className="page-layout">
      <PageHeader title="Ayarlar" text="Qaydalar backend tərəfindən idarə olunur." />
      <article className="settings-panel">
        <SectionHeading kicker="Limitlər" title="Backend qaydaları" />
        <div className="field-grid">
          <Field label="Fayl növləri" value="PDF, skan, şəkil (PNG, JPG, WEBP, HEIC), Word .docx, Excel .xlsx/.xls, CSV, TXT" />
          <Field label="Maks. fayl ölçüsü" value="10 MB" />
          <Field label="Sənəd sayı" value="Hər növdən bir (sifariş, qəbul, faktura)" />
          <Field label="Təsdiq" value="Yalnız uyğun hesabat təsdiqlənə bilər" />
        </div>
      </article>
    </section>
  )
}

export default App
