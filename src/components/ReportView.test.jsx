import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeDocument, matchedReport, mismatchReport, twoWayReport, unmatchedReport } from '../test/fixtures'
import { IssuesList, MatchesTable, ReportSummary } from './ReportView'
import { Badge, EmptyState, Field, Notice, PageHeader, Pill, SectionHeading } from './ui'

describe('ReportSummary', () => {
  it('uyğunsuzluğu, məbləği və rejimi göstərir', () => {
    render(<ReportSummary report={mismatchReport()} />)
    expect(screen.getByRole('heading', { name: 'Uyğunsuzluq' })).toBeInTheDocument()
    expect(screen.getByText(/240[,.]00 AZN/)).toBeInTheDocument()
    expect(screen.getByText(/üçtərəfli · revision 4/)).toBeInTheDocument()
    expect(screen.queryByText(/yekun rəqəm kimi istifadə etməyin/)).not.toBeInTheDocument()
  })

  it('uyğun nəticədə yaşıl məbləğ kartı', () => {
    const { container } = render(<ReportSummary report={matchedReport()} />)
    expect(screen.getByRole('heading', { name: 'Uyğundur' })).toBeInTheDocument()
    expect(container.querySelector('.ok-amount')).not.toBeNull()
  })

  it('natamam məbləğ üçün xəbərdarlıq edir', () => {
    render(<ReportSummary report={unmatchedReport()} />)
    expect(screen.getByRole('heading', { name: 'İnsan yoxlaması' })).toBeInTheDocument()
    expect(screen.getByText(/yekun rəqəm kimi istifadə etməyin/)).toBeInTheDocument()
  })

  it('ikitərəfli rejimi və qeydini göstərir', () => {
    render(<ReportSummary report={twoWayReport()} />)
    expect(screen.getByText(/sifariş ↔ faktura · revision/)).toBeInTheDocument()
    expect(screen.getByText(/malların faktiki qəbulu yoxlanmayıb/)).toBeInTheDocument()
  })
})

describe('MatchesTable', () => {
  it('sətir üzrə miqdarları, mənbə sətrini, fərqi və statusu göstərir', () => {
    render(<MatchesTable report={mismatchReport()} />)
    const row = screen.getAllByRole('row')[1]
    const cells = within(row).getAllByRole('cell')
    expect(cells[0]).toHaveTextContent('A4 kağız 80 q/m²')
    expect(cells[0]).toHaveTextContent('SKU: PAPER-A4-80')
    expect(cells[0]).toHaveTextContent('miqdarları fərqlidir')
    expect(cells[1]).toHaveTextContent('100sətir 1')
    expect(cells[2]).toHaveTextContent('80sətir 1')
    expect(cells[3]).toHaveTextContent('100sətir 1')
    expect(cells[5]).toHaveTextContent(/240[,.]00 AZN/)
    expect(cells[6]).toHaveTextContent('Uyğunsuzluq')
  })

  it('qəbul sənədi olmayanda bunu yazır', () => {
    render(<MatchesTable report={twoWayReport()} />)
    expect(screen.getByText('Qəbul sənədi yoxdur')).toBeInTheDocument()
  })

  it('hesablana bilməyən sətirdə "Yoxlama" yazır', () => {
    const report = mismatchReport()
    report.matches[0] = { ...report.matches[0], status: 'needs_review', disputed_amount: null }
    render(<MatchesTable report={report} />)
    expect(within(screen.getAllByRole('row')[1]).getAllByRole('cell')[5]).toHaveTextContent('Yoxlama')
  })

  it('uyğunlaşdırılmış sətir yoxdursa boş vəziyyət', () => {
    render(<MatchesTable report={unmatchedReport()} />)
    expect(screen.getByText('Uyğunlaşdırılmış məhsul sətri yoxdur.')).toBeInTheDocument()
  })
})

describe('IssuesList', () => {
  it('kodu Azərbaycanca etiketlə, yeri isə sənəd/sətir/sahə ilə göstərir', () => {
    const report = mismatchReport({
      issues: [
        { code: 'unmatched_line', message: 'Uyğunlaşdırılmalıdır.', kind: 'receipt', line: 1 },
        { code: 'missing_evidence', message: 'Mənbə yoxdur.', document_id: 'doc-order', field: 'quantity' },
        { code: 'tax_review', message: 'ƏDV var.', document_id: 'doc-invoice' },
        { code: 'new_code', message: 'Gələcək kod.' },
      ],
    })
    render(<IssuesList documents={[makeDocument('order'), makeDocument('invoice')]} report={report} />)
    expect(screen.getByText(/Uyğunlaşdırılmalıdır\. \(Qəbul, sətir 2\)/)).toBeInTheDocument()
    expect(screen.getByText(/Mənbə yoxdur\. \(Sifariş, sahə: quantity\)/)).toBeInTheDocument()
    expect(screen.getByText('ƏDV:')).toBeInTheDocument()
    expect(screen.getByText('new_code:')).toBeInTheDocument()
  })

  it('qeyd yoxdursa boş vəziyyət', () => {
    render(<IssuesList report={mismatchReport()} />)
    expect(screen.getByText('Əlavə qeyd yoxdur.')).toBeInTheDocument()
  })
})

describe('UI komponentləri', () => {
  it('Notice: mətn yoxdursa heç nə göstərmir, xəta alert rolundadır, bağlana bilir', async () => {
    const { container, rerender } = render(<Notice />)
    expect(container).toBeEmptyDOMElement()
    const onClose = vi.fn()
    rerender(<Notice onClose={onClose}>Xəta baş verdi</Notice>)
    expect(screen.getByRole('alert')).toHaveTextContent('Xəta baş verdi')
    await userEvent.click(screen.getByRole('button', { name: 'Bağla' }))
    expect(onClose).toHaveBeenCalledOnce()
    rerender(<Notice tone="success">Yadda saxlanıldı</Notice>)
    expect(screen.getByRole('status')).toHaveTextContent('Yadda saxlanıldı')
  })

  it('SectionHeading əlavə düymələri ayrıca blokda göstərir', () => {
    render(<SectionHeading kicker="Addım 1" text="İzah" title="Sənədlər"><button type="button">Əməliyyat</button></SectionHeading>)
    expect(screen.getByRole('heading', { name: 'Sənədlər' })).toBeInTheDocument()
    expect(screen.getByText('İzah')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Əməliyyat' }).parentElement).toHaveClass('heading-actions')
  })

  it('PageHeader, Field, Pill, Badge, EmptyState', () => {
    render(
      <>
        <PageHeader text="Alt mətn" title="Başlıq" />
        <Field label="Valyuta" value="AZN" />
        <Pill detail="240 AZN" tone="bad">Uyğunsuzluq</Pill>
        <Badge tone="ok">Uyğundur</Badge>
        <EmptyState>Boşdur</EmptyState>
      </>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Başlıq' })).toBeInTheDocument()
    expect(screen.getByText('Valyuta').nextSibling).toHaveTextContent('AZN')
    expect(screen.getByText('Uyğunsuzluq').closest('.status-pill')).toHaveClass('bad')
    expect(screen.getByText('240 AZN')).toBeInTheDocument()
    expect(screen.getByText('Uyğundur')).toHaveClass('result-badge', 'ok')
    expect(screen.getByText('Boşdur')).toHaveClass('empty-state')
  })
})
