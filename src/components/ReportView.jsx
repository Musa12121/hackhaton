import { CASE_STATUS, ISSUE_LABELS, KIND_SHORT, MATCH_STATUS, formatAmount, formatDate, formatValue, statusInfo } from '../format'
import { Badge, EmptyState } from './ui'

// case.report obyektini (compare/ və report/ cavabları) göstərir.
export function ReportSummary({ report }) {
  const status = statusInfo(CASE_STATUS, report.status)
  const hasRisk = Number(report.disputed_amount) > 0

  return (
    <article className="clean-panel result-overview">
      <div>
        <span className="section-kicker">
          Nəticə · {report.mode === 'two_way' ? 'sifariş ↔ faktura' : 'üçtərəfli'} · revision {formatValue(report.revision)}
        </span>
        <h2>{status.label}</h2>
        <p>
          {report.status === 'matched' && 'Sifariş, qəbul və faktura məlumatları uyğundur.'}
          {report.status === 'mismatch' && 'Sənədlər arasında fərq tapıldı. Aşağıdakı sətirlərə baxın.'}
          {report.status === 'needs_review' && 'Bəzi məlumatlar natamamdır və ya uyğunlaşdırılmayıb; insan yoxlaması lazımdır.'}
        </p>
        {report.notes?.map((note) => <p className="muted-note warning-note" key={note}>⚠ {note}</p>)}
        {!report.amount_complete && (
          <p className="muted-note">Məbləğ natamam məlumata əsaslanır; yekun rəqəm kimi istifadə etməyin.</p>
        )}
        {report.generated_at && <p className="muted-note">Yaradılıb: {formatDate(report.generated_at)}</p>}
      </div>
      <div className={hasRisk ? 'result-amount' : 'result-amount ok-amount'}>
        <span>Mübahisəli məbləğ</span>
        <strong>{formatAmount(report.disputed_amount, report.currency)}</strong>
      </div>
    </article>
  )
}

export function MatchesTable({ report }) {
  const matches = report.matches || []
  if (matches.length === 0) return <EmptyState>Uyğunlaşdırılmış məhsul sətri yoxdur.</EmptyState>

  return (
    <div className="match-table-wrap">
      <table className="match-table">
        <thead>
          <tr>
            <th>Məhsul</th>
            <th>Sifariş</th>
            <th>Qəbul</th>
            <th>Faktura</th>
            <th>Qiymət (sifariş / faktura)</th>
            <th>Fərq</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((match, index) => {
            const { order, receipt, invoice } = match.sources
            const status = statusInfo(MATCH_STATUS, match.status)
            return (
              <tr key={index}>
                <td data-label="Məhsul">
                  <strong>{formatValue(invoice.values.name || order.values.name)}</strong>
                  <span>
                    SKU: {formatValue(order.values.sku)} · Vahid: {formatValue(order.values.unit)} · Qablaşdırma: {formatValue(order.values.pack_size)}
                  </span>
                  {match.differences.map((text) => <span className="diff-text" key={text}>{text}</span>)}
                </td>
                <td data-label="Sifariş"><div>{formatValue(order.values.quantity)}<span>sətir {order.line + 1}</span></div></td>
                <td data-label="Qəbul"><div>{receipt ? <>{formatValue(receipt.values.quantity)}<span>sətir {receipt.line + 1}</span></> : <span>Qəbul sənədi yoxdur</span>}</div></td>
                <td data-label="Faktura"><div>{formatValue(invoice.values.quantity)}<span>sətir {invoice.line + 1}</span></div></td>
                <td data-label="Qiymət"><div>{formatAmount(order.values.unit_price)} / {formatAmount(invoice.values.unit_price)}</div></td>
                <td data-label="Fərq"><div>{match.disputed_amount === null ? 'Yoxlama' : formatAmount(match.disputed_amount, report.currency)}</div></td>
                <td data-label="Status"><div><Badge tone={status.tone}>{status.label}</Badge></div></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function IssuesList({ report, documents = [] }) {
  const issues = report.issues || []
  if (issues.length === 0) return <EmptyState>Əlavə qeyd yoxdur.</EmptyState>
  const kindById = Object.fromEntries(documents.map((doc) => [doc.id, doc.kind]))

  return (
    <div className="evidence-list">
      {issues.map((issue, index) => {
        const kind = issue.kind || kindById[issue.document_id]
        const where = [kind && KIND_SHORT[kind], issue.line !== undefined && `sətir ${issue.line + 1}`, issue.field && `sahə: ${issue.field}`]
          .filter(Boolean).join(', ')
        return (
          <p key={index}>
            <b>{ISSUE_LABELS[issue.code] || issue.code}:</b> {issue.message}{where && ` (${where})`}
          </p>
        )
      })}
    </div>
  )
}
