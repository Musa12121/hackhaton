import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import { CASE_ID, makeCase, mismatchReport, readyCase, twoWayReport } from './test/fixtures'
import { mockApi, reply, sequence } from './test/mockApi'

const CASE = `/api/cases/${CASE_ID}/`
const page = (results, extra = {}) => ({ count: results.length, next: null, previous: null, results, ...extra })

/** Standart backend; testlər lazım olan marşrutları əlavə edir/əvəzləyir. */
function backend(routes = {}) {
  return mockApi({
    'GET /api/cases/?page=1': page([]),
    [`GET ${CASE}`]: makeCase(),
    [`GET ${CASE}history/`]: [],
    ...routes,
  })
}

/** Yuxarı menyudan səhifəyə keçid (Dashboard-da eyni adlı düymələr də var). */
async function goTo(tab) {
  const nav = screen.getByRole('navigation', { name: 'Əsas naviqasiya' })
  await userEvent.click(within(nav).getByRole('button', { name: tab }))
}

describe('açılış', () => {
  it('giriş ekranı olmadan birbaşa Dashboard açılır', async () => {
    backend()
    render(<App />)
    expect(screen.getByRole('heading', { name: /Sənədləri yüklə/ })).toBeInTheDocument()
    expect(screen.queryByLabelText(/Şifrə/)).not.toBeInTheDocument()
    expect(await screen.findByText(/Hələ yoxlama yoxdur/)).toBeInTheDocument()
  })

  it('backend girişi alınmayanda (401) nə etmək lazım olduğunu göstərir', async () => {
    backend({ 'GET /api/cases/?page=1': reply(401, { detail: 'Authentication credentials were not provided.' }) })
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('HESABCHECK_USERNAME')
  })

  it('Ayarlarda yalnız backend qaydaları göstərilir', async () => {
    backend()
    render(<App />)
    await goTo('Ayarlar')
    expect(screen.getByRole('heading', { name: 'Backend qaydaları' })).toBeInTheDocument()
    expect(screen.getByText('10 MB')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Backend' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Çıxış' })).not.toBeInTheDocument()
  })
})

describe('Dashboard', () => {
  it('son yoxlamaları və valyuta üzrə ümumi mübahisəli məbləği göstərir', async () => {
    backend({
      'GET /api/cases/?page=1': page([
        makeCase({ id: 'a', title: 'Kağız', status: 'mismatch', report: mismatchReport() }),
        makeCase({ id: 'b', title: 'Qələm', status: 'mismatch', report: twoWayReport() }),
        makeCase({ id: 'c', title: 'Qaralama', status: 'draft' }),
      ]),
    })
    render(<App />)
    expect(await screen.findByText('Kağız')).toBeInTheDocument()
    expect(screen.getByText(/340[,.]00 AZN/)).toBeInTheDocument()
    expect(screen.getByText(/2 uyğunsuz · 0 yoxlama tələb edir · 0 uyğun/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Cəmi 3 yoxlama' })).toBeInTheDocument()
  })

  it('boş siyahı və yükləmə xətası', async () => {
    backend()
    const { unmount } = render(<App />)
    expect(await screen.findByText(/Hələ yoxlama yoxdur/)).toBeInTheDocument()
    unmount()
    backend({ 'GET /api/cases/?page=1': reply(500, { detail: 'Server xətası' }) })
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Server xətası')
  })
})

describe('Yoxlamalar', () => {
  it('yeni yoxlama yaradır və onu açır', async () => {
    const server = backend({
      'POST /api/cases/': reply(201, makeCase({ title: 'Ofis kağızı – oktyabr' })),
      [`GET ${CASE}`]: makeCase({ title: 'Ofis kağızı – oktyabr' }),
    })
    render(<App />)
    await goTo('Yoxlamalar')
    const create = screen.getByRole('button', { name: 'Yarat və aç' })
    expect(create).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Başlıq *'), '  Ofis kağızı – oktyabr ')
    await userEvent.type(screen.getByLabelText('Təchizatçı'), 'Demo MMC')
    await userEvent.click(create)
    expect(await screen.findByRole('heading', { level: 1, name: 'Ofis kağızı – oktyabr' })).toBeInTheDocument()
    expect(server.calls('POST /api/cases/')[0].json).toEqual({ title: 'Ofis kağızı – oktyabr', supplier: 'Demo MMC' })
  })

  it('yaratma xətasını formada göstərir', async () => {
    backend({ 'POST /api/cases/': reply(400, { title: ['Bu sahə çox uzundur.'] }) })
    render(<App />)
    await goTo('Yoxlamalar')
    await userEvent.type(screen.getByLabelText('Başlıq *'), 'X')
    await userEvent.click(screen.getByRole('button', { name: 'Yarat və aç' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Başlıq: Bu sahə çox uzundur.')
  })

  it('siyahıdan yoxlamanı açır və geri qayıdır', async () => {
    backend({ 'GET /api/cases/?page=1': page([readyCase()]), [`GET ${CASE}`]: readyCase() })
    render(<App />)
    await goTo('Yoxlamalar')
    const row = await screen.findByRole('button', { name: /Ofis kağızı alışı.*3\/3 sənəd/ })
    await userEvent.click(row)
    expect(await screen.findByRole('heading', { level: 1, name: 'Ofis kağızı alışı' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '← Yoxlamalara qayıt' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Yoxlamalar' })).toBeInTheDocument()
  })

  it('səhifələmə ilə növbəti səhifəni yükləyir', async () => {
    const server = backend({
      'GET /api/cases/?page=1': page([makeCase({ title: 'Birinci səhifə' })], { count: 30, next: '/api/cases/?page=2' }),
      'GET /api/cases/?page=2': page([makeCase({ title: 'İkinci səhifə' })], { count: 30, previous: '/api/cases/?page=1' }),
    })
    render(<App />)
    await goTo('Yoxlamalar')
    expect(await screen.findByText('1 / 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '← Əvvəlki' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Növbəti →' }))
    expect(await screen.findByText('İkinci səhifə')).toBeInTheDocument()
    expect(server.calls('GET /api/cases/?page=2')).toHaveLength(1)
  })

  it('silmədən əvvəl təsdiq soruşur; imtina edəndə heç nə silinmir', async () => {
    const server = backend({ 'GET /api/cases/?page=1': page([makeCase()]), [`DELETE ${CASE}`]: reply(204) })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<App />)
    await goTo('Yoxlamalar')
    await userEvent.click(await screen.findByRole('button', { name: 'Ofis kağızı alışı yoxlamasını sil' }))
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('"Ofis kağızı alışı"'))
    expect(server.calls(`DELETE ${CASE}`)).toHaveLength(0)
  })

  it('təsdiqdən sonra silir və siyahını yeniləyir', async () => {
    const server = backend({
      'GET /api/cases/?page=1': sequence(page([makeCase()]), page([])),
      [`DELETE ${CASE}`]: reply(204),
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App />)
    await goTo('Yoxlamalar')
    await userEvent.click(await screen.findByRole('button', { name: 'Ofis kağızı alışı yoxlamasını sil' }))
    expect(await screen.findByText(/Hələ yoxlama yoxdur/)).toBeInTheDocument()
    expect(server.calls(`DELETE ${CASE}`)).toHaveLength(1)
  })

  it('silmə xətasını göstərir', async () => {
    backend({ 'GET /api/cases/?page=1': page([makeCase()]), [`DELETE ${CASE}`]: reply(404, { detail: 'Tapılmadı.' }) })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App />)
    await goTo('Yoxlamalar')
    await userEvent.click(await screen.findByRole('button', { name: 'Ofis kağızı alışı yoxlamasını sil' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Tapılmadı.')
  })
})

describe('Hesabatlar', () => {
  const reportResponse = (id = CASE_ID, title = 'Ofis kağızı alışı') => ({
    case_id: id, title, supplier: 'Demo MMC', report: mismatchReport(), decision: 'disputed', decision_note: '20 ədəd çatışmır',
  })

  it('hesabatı olan yoxlamaları göstərir və seçilmiş hesabatı yükləyir', async () => {
    backend({
      'GET /api/cases/?page=1': page([makeCase({ status: 'mismatch', report: mismatchReport() }), makeCase({ id: 'draft', title: 'Qaralama' })]),
      [`GET ${CASE}report/`]: reportResponse(),
    })
    render(<App />)
    await screen.findByText('Ofis kağızı alışı')
    await goTo('Hesabatlar')
    expect(await screen.findByText('Etiraz edildi')).toBeInTheDocument()
    expect(screen.getByText('20 ədəd çatışmır')).toBeInTheDocument()
    expect(screen.queryByText('Qaralama')).not.toBeInTheDocument()
  })

  it('JSON hesabatı endirir və yoxlamanı açır', async () => {
    backend({
      'GET /api/cases/?page=1': page([makeCase({ status: 'mismatch', report: mismatchReport() })]),
      [`GET ${CASE}report/`]: reportResponse(),
    })
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    render(<App />)
    await screen.findByText('Ofis kağızı alışı')
    await goTo('Hesabatlar')
    await userEvent.click(await screen.findByRole('button', { name: 'JSON endir' }))
    expect(click).toHaveBeenCalledOnce()
    await userEvent.click(screen.getByRole('button', { name: 'Yoxlamanı aç' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Ofis kağızı alışı' })).toBeInTheDocument()
  })

  it('3-dən çox hesabat olanda siyahıdan seçmək olur', async () => {
    const cases = ['a', 'b', 'c', 'd'].map((id) => makeCase({ id, title: `Yoxlama ${id}`, status: 'mismatch', report: mismatchReport() }))
    const server = backend({
      'GET /api/cases/?page=1': page(cases),
      'GET /api/cases/:id/report/': (request) => reportResponse(request.path.split('/')[3], 'x'),
    })
    render(<App />)
    await screen.findByText('Yoxlama a')
    await goTo('Hesabatlar')
    await userEvent.selectOptions(await screen.findByLabelText('Başqa hesabat'), 'd')
    await waitFor(() => expect(server.calls('GET /api/cases/:id/report/').at(-1).path).toBe('/api/cases/d/report/'))
  })

  it('hesabat yoxdursa boş vəziyyət', async () => {
    backend()
    render(<App />)
    await goTo('Hesabatlar')
    expect(screen.getByText('Hələ hesabatı olan yoxlama yoxdur.')).toBeInTheDocument()
  })

  it('hesabat yüklənmə xətası', async () => {
    backend({
      'GET /api/cases/?page=1': page([makeCase({ status: 'mismatch', report: mismatchReport() })]),
      [`GET ${CASE}report/`]: reply(400, { detail: 'Əvvəl müqayisəni başladın.' }),
    })
    render(<App />)
    await screen.findByText('Ofis kağızı alışı')
    await goTo('Hesabatlar')
    expect(await screen.findByRole('alert')).toHaveTextContent('Əvvəl müqayisəni başladın.')
  })
})

describe('naviqasiya', () => {
  it('menyu düymələri və brend Dashboard-a qaytarır', async () => {
    backend()
    render(<App />)
    const nav = screen.getByRole('navigation', { name: 'Əsas naviqasiya' })
    await userEvent.click(within(nav).getByRole('button', { name: 'Ayarlar' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Ayarlar' })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'Ayarlar' })).toHaveClass('active')
    await userEvent.click(within(nav).getByRole('button', { name: /HesabCheck/ }))
    expect(screen.getByRole('heading', { name: /Sənədləri yüklə/ })).toBeInTheDocument()
  })

  it.each([
    ['Yeni yoxlama', 'Yoxlamalar'],
    ['Hamısı', 'Yoxlamalar'],
    ['Hesabatlar', 'Hesabatlar'],
  ])('Dashboard-dakı "%s" düyməsi %s səhifəsini açır', async (name, heading) => {
    backend()
    render(<App />)
    const main = screen.getByRole('main')
    const buttons = within(main).getAllByRole('button', { name }).filter((element) => !element.closest('nav'))
    await userEvent.click(buttons[0])
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument()
  })

  it('əvvəlki səhifəyə qayıdır', async () => {
    const server = backend({
      'GET /api/cases/?page=1': page([makeCase({ title: 'Birinci' })], { count: 30, next: '/api/cases/?page=2' }),
      'GET /api/cases/?page=2': page([makeCase({ title: 'İkinci' })], { count: 30, previous: '/api/cases/?page=1' }),
    })
    render(<App />)
    await goTo('Yoxlamalar')
    await userEvent.click(await screen.findByRole('button', { name: 'Növbəti →' }))
    await userEvent.click(await screen.findByRole('button', { name: '← Əvvəlki' }))
    expect(await screen.findByText('Birinci')).toBeInTheDocument()
    expect(server.calls('GET /api/cases/?page=1').length).toBeGreaterThanOrEqual(2)
  })
})
