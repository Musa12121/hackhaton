export function PageHeader({ title, text, children }) {
  return (
    <header className="page-header">
      <span className="section-kicker">HesabCheck</span>
      <h1>{title}</h1>
      {text && <p>{text}</p>}
      {children}
    </header>
  )
}

export function SectionHeading({ kicker, title, text, children }) {
  return (
    <div className={children ? 'section-heading inline' : 'section-heading'}>
      <div>
        {kicker && <span className="section-kicker">{kicker}</span>}
        <h2>{title}</h2>
        {text && <p>{text}</p>}
      </div>
      {children && <div className="heading-actions">{children}</div>}
    </div>
  )
}

export function Field({ label, value }) {
  return (
    <div className="field-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export function Pill({ tone, children, detail }) {
  return (
    <span className={`status-pill ${tone}`}>
      <strong>{children}</strong>
      {detail && <span>{detail}</span>}
    </span>
  )
}

export function Badge({ tone, children }) {
  return <span className={`result-badge ${tone}`}>{children}</span>
}

export function Notice({ tone = 'error', children, onClose }) {
  if (!children) return null
  return (
    <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span>{children}</span>
      {onClose && (
        <button aria-label="Bağla" className="notice-close" onClick={onClose} type="button">×</button>
      )}
    </div>
  )
}

export function EmptyState({ children }) {
  return <p className="empty-state">{children}</p>
}
