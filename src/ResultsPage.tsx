import { useEffect, useMemo, useState } from 'react'
import './ResultsPage.css'

type Verdict = 'HOP_LE' | 'THIEU_HASHTAG' | 'KHONG_CONG_KHAI' | 'LINK_SAI' | ''
type Filter = 'ALL' | 'HOP_LE' | 'THIEU_HASHTAG' | 'KHONG_CONG_KHAI' | 'LINK_SAI' | 'UNCHECKED'

const RESULTS_FILE = '/check-results-final.json'
const SHEET_ID = '1pg-C-YwjNFYATcJFHnIRKdV-C5J_Y5sL37uvxj3gcpc'
const GVIZ_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&headers=1`

interface RowData {
  rowIndex: number
  stt: string
  maNV: string
  hoTen: string
  khoi: string
  link: string
}

export default function ResultsPage() {
  const [allRows, setAllRows] = useState<RowData[]>([])
  const [results, setResults] = useState<Record<number, Verdict>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<Filter>('ALL')
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function load() {
      try {
        // Load results file first (most important)
        const resultsRes = await fetch(RESULTS_FILE)
        if (!resultsRes.ok) throw new Error('Cannot load results file')
        const resultsData: Record<number, Verdict> = await resultsRes.json()
        setResults(resultsData)

        // Try to load sheet data, but don't fail if it doesn't work
        try {
          const sheetRes = await fetch(GVIZ_URL)
          if (!sheetRes.ok) throw new Error('Sheet fetch failed')
          const sheetText = await sheetRes.text()
          const start = sheetText.indexOf('(')
          const end = sheetText.lastIndexOf(')')
          if (start < 0 || end < 0) throw new Error('Invalid format')
          const data = JSON.parse(sheetText.slice(start + 1, end))
          if (data.status === 'error') throw new Error('Sheet error')
          const rows = data.table?.rows || []

          const processedRows = rows
            .map((r: any, idx: number) => {
              const c = r.c || []
              return {
                rowIndex: idx + 2,
                stt: c[0]?.v || idx + 1,
                maNV: c[1]?.v || '',
                hoTen: c[2]?.v || '',
                khoi: c[3]?.v || '',
                link: c[8]?.v || '',
              } as RowData
            })
            .filter((r: RowData) => r.link && resultsData[r.rowIndex] !== undefined)

          setAllRows(processedRows)
        } catch (e) {
          // If sheet fetch fails, create minimal rows from results
          const minimalRows = Object.entries(resultsData)
            .map(([rowStr]) => {
              const rowIndex = parseInt(rowStr, 10)
              return {
                rowIndex,
                stt: rowIndex.toString(),
                maNV: '',
                hoTen: 'Nhân viên #' + rowIndex,
                khoi: '',
                link: '(Dữ liệu không tải được)',
              } as RowData
            })
            .slice(0, 100) // Limit to first 100 rows

          setAllRows(minimalRows)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Lỗi không xác định')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const stats = useMemo(() => {
    let valid = 0,
      invalid = 0,
      unchecked = 0,
      private_ = 0,
      missing = 0
    for (const row of allRows) {
      const v = results[row.rowIndex] || ''
      if (v === 'HOP_LE') valid++
      else if (v === 'LINK_SAI') invalid++
      else if (v === 'KHONG_CONG_KHAI') private_++
      else if (v === 'THIEU_HASHTAG') missing++
      else unchecked++
    }
    return { total: allRows.length, valid, invalid, unchecked, private_, missing }
  }, [allRows, results])

  const filtered = useMemo(() => {
    let items = allRows.filter((row) => {
      const v = results[row.rowIndex] || ''
      const filterV = filter === 'UNCHECKED' ? '' : filter

      if (filter !== 'ALL' && v !== filterV) return false

      if (search) {
        const q = search.toLowerCase()
        const hay = `${row.stt} ${row.maNV} ${row.hoTen} ${row.khoi} ${row.link}`.toLowerCase()
        if (!hay.includes(q)) return false
      }

      return true
    })
    return items
  }, [allRows, results, filter, search])

  const getVerdictLabel = (v: Verdict) => {
    if (v === 'HOP_LE') return '✅ Hợp lệ'
    if (v === 'THIEU_HASHTAG') return '⚠️ Thiếu/sai hashtag'
    if (v === 'KHONG_CONG_KHAI') return '🔒 Không công khai'
    if (v === 'LINK_SAI') return '🚫 Link sai'
    return '❓ Chưa check'
  }

  const getVerdictClass = (v: Verdict) => {
    if (v === 'HOP_LE') return 'verdict-valid'
    if (v === 'THIEU_HASHTAG') return 'verdict-missing'
    if (v === 'KHONG_CONG_KHAI') return 'verdict-private'
    if (v === 'LINK_SAI') return 'verdict-invalid'
    return 'verdict-unchecked'
  }

  if (loading)
    return (
      <div className="results-container">
        <div className="loading">⏳ Đang tải dữ liệu...</div>
      </div>
    )

  if (error)
    return (
      <div className="results-container">
        <div className="error">❌ Lỗi: {error}</div>
      </div>
    )

  return (
    <div className="results-page">
      <header className="results-header">
        <h1>✓ Kết Quả Check Link — F88</h1>
        <p>Danh sách các link ghi nhận đã check</p>
      </header>

      <div className="results-container">
        <div className="stats">
          <div className="stat-card">
            <div className="number">{stats.total}</div>
            <div className="label">Tổng link</div>
          </div>
          <div className="stat-card">
            <div className="number">{stats.valid}</div>
            <div className="label">✅ Hợp lệ</div>
          </div>
          <div className="stat-card">
            <div className="number">{stats.missing}</div>
            <div className="label">⚠️ Thiếu hashtag</div>
          </div>
          <div className="stat-card">
            <div className="number">{stats.private_}</div>
            <div className="label">🔒 Không công khai</div>
          </div>
          <div className="stat-card">
            <div className="number">{stats.invalid}</div>
            <div className="label">🚫 Link sai</div>
          </div>
          <div className="stat-card">
            <div className="number">{stats.unchecked}</div>
            <div className="label">❓ Chưa check</div>
          </div>
        </div>

        <div className="search">
          <input
            type="text"
            placeholder="Tìm theo tên nhân viên, mã NV, link..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="filters">
          {(['ALL', 'HOP_LE', 'THIEU_HASHTAG', 'KHONG_CONG_KHAI', 'LINK_SAI', 'UNCHECKED'] as Filter[]).map((f) => (
            <button
              key={f}
              className={`filter-btn ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'ALL'
                ? 'Tất cả'
                : f === 'HOP_LE'
                  ? '✅ Hợp lệ'
                  : f === 'THIEU_HASHTAG'
                    ? '⚠️ Thiếu/sai hashtag'
                    : f === 'KHONG_CONG_KHAI'
                      ? '🔒 Không công khai'
                      : f === 'LINK_SAI'
                        ? '🚫 Link sai'
                        : '❓ Chưa check'}
            </button>
          ))}
        </div>

        <div className="table-wrapper">
          {filtered.length === 0 ? (
            <div className="empty">Không có kết quả phù hợp</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{ width: '60px' }}>STT</th>
                  <th style={{ width: '200px' }}>Nhân viên</th>
                  <th style={{ width: '300px' }}>Link</th>
                  <th style={{ width: '120px' }}>Kết quả</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const v = results[row.rowIndex] || ''
                  return (
                    <tr key={row.rowIndex}>
                      <td>{row.stt}</td>
                      <td>
                        <strong>{row.hoTen}</strong>
                        <br />
                        <small style={{ color: '#999' }}>
                          {row.maNV} · {row.khoi}
                        </small>
                      </td>
                      <td className="link-cell">
                        <a href={row.link} target="_blank" rel="noopener noreferrer">
                          {row.link.length > 60 ? row.link.substring(0, 60) + '…' : row.link}
                        </a>
                      </td>
                      <td>
                        <span className={`verdict ${getVerdictClass(v)}`}>{getVerdictLabel(v)}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
