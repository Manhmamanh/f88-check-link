import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { DEFAULT_SHEET_URL, autoCheckRows, loadSheet, parseSheetUrl } from './sheet'
import type { AutoCheck, SheetRow, Verdict } from './types'
import { jTextToVerdict, verdictToJ, verdictToK } from './types'

const HASHTAG_DEFAULT = '@f88taichinhbinhdan'

type Filter = 'ALL' | 'UNCHECKED' | 'INVALID' | 'VALID' | 'WARNING' | 'LINK_SAI' | 'KHONG_CONG_KHAI' | 'THIEU_HASHTAG'

interface Store {
  verdicts: Record<number, Verdict>
}

function storageKey(sheetId: string) {
  return `linkcheck-v1:${sheetId}`
}

function loadStore(sheetId: string): Store {
  try {
    const raw = localStorage.getItem(storageKey(sheetId))
    if (raw) return JSON.parse(raw)
  } catch {
    /* bỏ qua dữ liệu hỏng */
  }
  return { verdicts: {} }
}

export default function App() {
  const [sheetUrl, setSheetUrl] = useState(DEFAULT_SHEET_URL)
  const [hashtag, setHashtag] = useState(HASHTAG_DEFAULT)
  const [rows, setRows] = useState<SheetRow[]>([])
  const [checks, setChecks] = useState<Map<number, AutoCheck>>(new Map())
  const [verdicts, setVerdicts] = useState<Record<number, Verdict>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<Filter>('ALL')
  const [search, setSearch] = useState('')
  const [reviewIdx, setReviewIdx] = useState<number | null>(null) // vị trí trong danh sách rows
  const [toast, setToast] = useState('')
  const sheetIdRef = useRef('')
  const toastTimer = useRef<number>(0)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 4000)
  }, [])

  const persist = useCallback((v: Record<number, Verdict>) => {
    if (!sheetIdRef.current) return
    localStorage.setItem(storageKey(sheetIdRef.current), JSON.stringify({ verdicts: v } satisfies Store))
  }, [])

  const setVerdict = useCallback(
    (rowIndex: number, v: Verdict) => {
      setVerdicts((prev) => {
        const next = { ...prev, [rowIndex]: v }
        persist(next)
        return next
      })
    },
    [persist],
  )

  const load = useCallback(async (url: string) => {
    setLoading(true)
    setError('')
    try {
      const parsed = parseSheetUrl(url)
      if (!parsed) throw new Error('Link Google Sheet không đúng định dạng.')
      const data = await loadSheet(url)
      sheetIdRef.current = parsed.id
      const store = loadStore(parsed.id)
      // Kết quả đã lưu trên máy được ưu tiên; nếu chưa có thì lấy giá trị sẵn có ở cột J trên Sheet
      const initial: Record<number, Verdict> = {}
      for (const row of data) {
        const saved = store.verdicts[row.rowIndex]
        if (saved) initial[row.rowIndex] = saved
        else {
          const fromSheet = jTextToVerdict(row.sheetJ)
          if (fromSheet) initial[row.rowIndex] = fromSheet
        }
      }
      setRows(data)
      setChecks(autoCheckRows(data))
      setVerdicts(initial)
      setReviewIdx(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi không xác định khi tải Sheet.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(DEFAULT_SHEET_URL)
  }, [load])

  const stats = useMemo(() => {
    let valid = 0
    let invalid = 0
    let unchecked = 0
    let warnings = 0
    for (const row of rows) {
      const v = verdicts[row.rowIndex] || ''
      if (v === 'HOP_LE') valid++
      else if (v) invalid++
      else unchecked++
      const c = checks.get(row.rowIndex)
      if (c && (c.formatError || c.duplicateOf.length > 0)) warnings++
    }
    return { total: rows.length, valid, invalid, unchecked, warnings }
  }, [rows, verdicts, checks])

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((row) => {
      const v = verdicts[row.rowIndex] || ''
      const c = checks.get(row.rowIndex)
      if (filter === 'UNCHECKED' && v) return false
      if (filter === 'VALID' && v !== 'HOP_LE') return false
      if (filter === 'INVALID' && (v === '' || v === 'HOP_LE')) return false
      if (filter === 'WARNING' && !(c && (c.formatError || c.duplicateOf.length > 0))) return false
      if (filter === 'LINK_SAI' && v !== 'LINK_SAI') return false
      if (filter === 'KHONG_CONG_KHAI' && v !== 'KHONG_CONG_KHAI') return false
      if (filter === 'THIEU_HASHTAG' && v !== 'THIEU_HASHTAG') return false
      if (q) {
        const hay =
          `${row.stt} ${row.maNV} ${row.hoTen} ${row.khoi} ${row.layer1} ${row.layer2} ${row.layer3} ${row.link}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [rows, verdicts, checks, filter, search])

  const applyAutoErrors = useCallback(() => {
    let n = 0
    const next = { ...verdicts }
    for (const row of rows) {
      const c = checks.get(row.rowIndex)
      if (c?.formatError && !next[row.rowIndex]) {
        next[row.rowIndex] = 'LINK_SAI'
        n++
      }
    }
    if (n > 0) {
      setVerdicts(next)
      persist(next)
      showToast(`Đã đánh dấu "Link sai" cho ${n} dòng lỗi định dạng.`)
    } else {
      showToast('Không có dòng lỗi định dạng nào chưa check.')
    }
  }, [rows, checks, verdicts, persist, showToast])

  const copyJK = useCallback(async () => {
    if (rows.length === 0) return
    const maxRow = rows[rows.length - 1].rowIndex
    const byIndex = new Map(rows.map((r) => [r.rowIndex, r]))
    const lines: string[] = []
    for (let i = 2; i <= maxRow; i++) {
      const row = byIndex.get(i)
      const v = row ? verdicts[row.rowIndex] || '' : ''
      lines.push(`${verdictToJ(v)}\t${verdictToK(v)}`)
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      showToast(`Đã copy ${lines.length} dòng (2 cột J + K). Mở Sheet, click ô J2 rồi dán (Cmd/Ctrl+V).`)
    } catch {
      showToast('Trình duyệt chặn clipboard — hãy dùng nút Tải CSV.')
    }
  }, [rows, verdicts, showToast])

  const downloadCsv = useCallback(() => {
    const header = 'STT,Mã nhân viên,Họ & tên,Khối,Link ghi nhận,Check link ghi nhận,Tổng\n'
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
    const body = rows
      .map((row) => {
        const v = verdicts[row.rowIndex] || ''
        return [row.stt, row.maNV, row.hoTen, row.khoi, row.link, verdictToJ(v), verdictToK(v)].map(esc).join(',')
      })
      .join('\n')
    const blob = new Blob(['﻿' + header + body], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'ket-qua-check-link.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }, [rows, verdicts])

  const exportByVerdictType = useCallback(
    (verdictType: Verdict, filename: string) => {
      const items = rows.filter((r) => verdicts[r.rowIndex] === verdictType).map((row) => ({
        row: row.rowIndex,
        stt: row.stt,
        ma_nv: row.maNV,
        ho_ten: row.hoTen,
        link: row.link,
      }))
      const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json;charset=utf-8' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename
      a.click()
      URL.revokeObjectURL(a.href)
      showToast(`✅ Đã tải ${items.length} link.`)
    },
    [rows, verdicts, showToast],
  )

  const importCheck = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string)
          if (typeof data !== 'object' || data === null) throw new Error('JSON không hợp lệ')
          let imported = 0
          setVerdicts((prev) => {
            const next = { ...prev }
            for (const [rowStr, v] of Object.entries(data)) {
              const row = parseInt(rowStr, 10)
              const verdict = (v as string) || ''
              if (verdict && !prev[row]) {
                next[row] = verdict as Verdict
                imported++
              }
            }
            persist(next)
            return next
          })
          showToast(`✅ Đã import ${imported} kết quả từ file.`)
        } catch (err) {
          showToast(`❌ Lỗi: ${err instanceof Error ? err.message : 'không đọc được file'}`)
        }
      }
      reader.readAsText(file)
      e.target.value = '' // reset để có thể chọn file cùng lần nữa
    },
    [persist, showToast],
  )

  // ----- Chế độ review nhanh -----
  const startReview = useCallback(() => {
    const idx = rows.findIndex((r) => !(verdicts[r.rowIndex] || ''))
    setReviewIdx(idx >= 0 ? idx : rows.length > 0 ? 0 : null)
  }, [rows, verdicts])

  const reviewRow = reviewIdx !== null ? rows[reviewIdx] : null

  const reviewVerdict = useCallback(
    (v: Verdict) => {
      if (reviewIdx === null || !reviewRow) return
      setVerdict(reviewRow.rowIndex, v)
      // chuyển tới dòng chưa check kế tiếp (bỏ qua dòng vừa chấm)
      for (let i = reviewIdx + 1; i < rows.length; i++) {
        if (!(verdicts[rows[i].rowIndex] || '')) {
          setReviewIdx(i)
          return
        }
      }
      setReviewIdx(null)
      showToast('Đã review hết các dòng chưa check 🎉 — bấm "Copy cột J+K" để dán vào Sheet.')
    },
    [reviewIdx, reviewRow, rows, verdicts, setVerdict, showToast],
  )

  useEffect(() => {
    if (reviewIdx === null) return
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Escape') setReviewIdx(null)
      else if (e.key === '1') reviewVerdict('HOP_LE')
      else if (e.key === '2') reviewVerdict('KHONG_CONG_KHAI')
      else if (e.key === '3') reviewVerdict('THIEU_HASHTAG')
      else if (e.key === '4') reviewVerdict('LINK_SAI')
      else if (e.key === 'Enter' || e.key.toLowerCase() === 'o') {
        if (reviewRow?.link) window.open(reviewRow.link, '_blank', 'noopener')
      } else if (e.key === 'ArrowRight') setReviewIdx((i) => (i !== null && i < rows.length - 1 ? i + 1 : i))
      else if (e.key === 'ArrowLeft') setReviewIdx((i) => (i !== null && i > 0 ? i - 1 : i))
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [reviewIdx, reviewRow, reviewVerdict, rows.length])

  const reviewCheck = reviewRow ? checks.get(reviewRow.rowIndex) : undefined

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="brand">
            <span className="brand-badge">F88</span>
            <div>
              <h1>Check Link Ghi Nhận</h1>
              <p>Kiểm tra link bài đăng theo Google Sheet — cột I → J → K</p>
            </div>
          </div>
          <div className="hashtag-box">
            <label htmlFor="hashtag">Hashtag/tag bắt buộc</label>
            <input id="hashtag" value={hashtag} onChange={(e) => setHashtag(e.target.value)} />
          </div>
        </div>
      </header>

      <main className="main">
        <section className="card source-card">
          <label htmlFor="sheet-url">Link Google Sheet (cần bật chia sẻ “Bất kỳ ai có link — Người xem”)</label>
          <div className="source-row">
            <input
              id="sheet-url"
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
            />
            <button className="btn primary" onClick={() => load(sheetUrl)} disabled={loading}>
              {loading ? 'Đang tải…' : '↻ Tải dữ liệu'}
            </button>
          </div>
          {error && (
            <p className="error" role="alert">
              ⚠️ {error}
            </p>
          )}
        </section>

        {rows.length > 0 && (
          <>
            <section className="stats" aria-label="Thống kê">
              <button className={`stat ${filter === 'ALL' ? 'active' : ''}`} onClick={() => setFilter('ALL')}>
                <b>{stats.total}</b>
                <span>Tổng link</span>
              </button>
              <button className={`stat ok ${filter === 'VALID' ? 'active' : ''}`} onClick={() => setFilter('VALID')}>
                <b>{stats.valid}</b>
                <span>Hợp lệ</span>
              </button>
              <button className={`stat bad ${filter === 'INVALID' ? 'active' : ''}`} onClick={() => setFilter('INVALID')}>
                <b>{stats.invalid}</b>
                <span>Không hợp lệ</span>
              </button>
              <button className={`stat todo ${filter === 'UNCHECKED' ? 'active' : ''}`} onClick={() => setFilter('UNCHECKED')}>
                <b>{stats.unchecked}</b>
                <span>Chưa check</span>
              </button>
              <button className={`stat warn ${filter === 'WARNING' ? 'active' : ''}`} onClick={() => setFilter('WARNING')}>
                <b>{stats.warnings}</b>
                <span>Cảnh báo tự động</span>
              </button>
            </section>

            {rows.length > 0 && (
              <>
                <section className="filter-detail">
                  <span className="label">Chi tiết:</span>
                  <button
                    className={`filter-btn ${filter === 'VALID' ? 'active' : ''}`}
                    onClick={() => setFilter('VALID')}
                  >
                    ✅ Hợp lệ ({rows.filter((r) => verdicts[r.rowIndex] === 'HOP_LE').length})
                  </button>
                  <button
                    className={`filter-btn ${filter === 'LINK_SAI' ? 'active' : ''}`}
                    onClick={() => setFilter('LINK_SAI')}
                  >
                    🚫 Link sai ({rows.filter((r) => verdicts[r.rowIndex] === 'LINK_SAI').length})
                  </button>
                  <button
                    className={`filter-btn ${filter === 'KHONG_CONG_KHAI' ? 'active' : ''}`}
                    onClick={() => setFilter('KHONG_CONG_KHAI')}
                  >
                    🔒 Không công khai ({rows.filter((r) => verdicts[r.rowIndex] === 'KHONG_CONG_KHAI').length})
                  </button>
                  <button
                    className={`filter-btn ${filter === 'THIEU_HASHTAG' ? 'active' : ''}`}
                    onClick={() => setFilter('THIEU_HASHTAG')}
                  >
                    ⚠️ Thiếu/sai hashtag ({rows.filter((r) => verdicts[r.rowIndex] === 'THIEU_HASHTAG').length})
                  </button>
                  <button
                    className={`filter-btn ${filter === 'UNCHECKED' ? 'active' : ''}`}
                    onClick={() => setFilter('UNCHECKED')}
                  >
                    ❓ Chưa check ({rows.filter((r) => !verdicts[r.rowIndex]).length})
                  </button>
                </section>

                <section className="export-detail">
                  <span className="label">Tải danh sách:</span>
                  <button
                    className="export-btn"
                    onClick={() => exportByVerdictType('HOP_LE', 'links-valid.json')}
                    title={`${rows.filter((r) => verdicts[r.rowIndex] === 'HOP_LE').length} link hợp lệ`}
                  >
                    ✅ Hợp lệ ({rows.filter((r) => verdicts[r.rowIndex] === 'HOP_LE').length})
                  </button>
                  <button
                    className="export-btn"
                    onClick={() => exportByVerdictType('', 'links-todo.json')}
                    title={`${rows.filter((r) => !verdicts[r.rowIndex]).length} link chưa check`}
                  >
                    ❓ Chưa check ({rows.filter((r) => !verdicts[r.rowIndex]).length})
                  </button>
                  <button
                    className="export-btn"
                    onClick={() => exportByVerdictType('LINK_SAI', 'links-bad.json')}
                    title={`${rows.filter((r) => verdicts[r.rowIndex] === 'LINK_SAI').length} link sai`}
                  >
                    🚫 Link sai ({rows.filter((r) => verdicts[r.rowIndex] === 'LINK_SAI').length})
                  </button>
                </section>
              </>
            )}

            <section className="toolbar">
              <input
                className="search"
                type="search"
                placeholder="Tìm theo tên, mã NV, link…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="toolbar-actions">
                <button className="btn" onClick={applyAutoErrors} title="Tự đánh dấu Link sai cho các dòng URL lỗi định dạng">
                  ⚡ Áp lỗi tự động
                </button>
                <button className="btn primary" onClick={startReview}>
                  ▶ Review nhanh
                </button>
                <button className="btn" onClick={copyJK}>
                  📋 Copy cột J+K
                </button>
                <button className="btn" onClick={downloadCsv}>
                  ⬇ Tải CSV
                </button>
                <label className="btn" style={{ cursor: 'pointer', margin: 0 }}>
                  📥 Import kết quả
                  <input
                    type="file"
                    accept=".json"
                    onChange={importCheck}
                    style={{ display: 'none' }}
                    aria-label="Import file JSON với kết quả check"
                  />
                </label>
              </div>
            </section>

            <section className="card table-card">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>STT</th>
                      <th>Nhân viên</th>
                      <th>Link ghi nhận (I)</th>
                      <th>Check link ghi nhận (J)</th>
                      <th>Tổng (K)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => {
                      const v = verdicts[row.rowIndex] || ''
                      const c = checks.get(row.rowIndex)
                      return (
                        <tr key={row.rowIndex}>
                          <td className="td-stt">{row.stt}</td>
                          <td className="td-nv">
                            <b>{row.hoTen}</b>
                            <small>
                              {row.maNV} · {row.khoi}
                            </small>
                          </td>
                          <td className="td-link">
                            {row.link ? (
                              <a href={row.link} target="_blank" rel="noopener noreferrer" title={row.link}>
                                {row.link}
                              </a>
                            ) : (
                              <em className="muted">— trống —</em>
                            )}
                            <div className="badges">
                              {c?.platform && <span className="badge platform">{c.platform}</span>}
                              {c?.formatError && <span className="badge err">⚠ {c.formatError}</span>}
                              {c && c.duplicateOf.length > 0 && (
                                <span className="badge dup">⚠ Trùng dòng {c.duplicateOf.join(', ')}</span>
                              )}
                            </div>
                          </td>
                          <td className="td-verdict">
                            <select
                              className={`verdict-select v-${v || 'none'}`}
                              value={v}
                              onChange={(e) => setVerdict(row.rowIndex, e.target.value as Verdict)}
                              aria-label={`Kết quả check dòng ${row.stt}`}
                            >
                              <option value="">— Chưa check —</option>
                              <option value="HOP_LE">Hợp lệ</option>
                              <option value="KHONG_CONG_KHAI">Không công khai</option>
                              <option value="THIEU_HASHTAG">Thiếu/sai hashtag</option>
                              <option value="LINK_SAI">Link sai</option>
                            </select>
                          </td>
                          <td className="td-total">
                            {v && <span className={`total ${v === 'HOP_LE' ? 'ok' : 'bad'}`}>{verdictToK(v)}</span>}
                          </td>
                        </tr>
                      )
                    })}
                    {visibleRows.length === 0 && (
                      <tr>
                        <td colSpan={5} className="empty">
                          Không có dòng nào khớp bộ lọc.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {rows.length === 0 && !loading && !error && (
          <section className="card empty-state">
            Nhập link Google Sheet rồi bấm <b>Tải dữ liệu</b> để bắt đầu.
          </section>
        )}
      </main>

      {reviewRow && (
        <div className="review-overlay" role="dialog" aria-modal="true" aria-label="Review nhanh">
          <div className="review-card">
            <div className="review-head">
              <span>
                Dòng <b>{reviewRow.stt}</b> · {reviewIdx! + 1}/{rows.length}
              </span>
              <button className="btn ghost" onClick={() => setReviewIdx(null)}>
                ✕ Đóng (Esc)
              </button>
            </div>
            <h2>{reviewRow.hoTen}</h2>
            <p className="muted">
              {reviewRow.maNV} · {reviewRow.khoi}
              {reviewRow.layer1 && reviewRow.layer1 !== '0' ? ` · ${reviewRow.layer1}` : ''}
            </p>
            <a className="review-link" href={reviewRow.link || undefined} target="_blank" rel="noopener noreferrer">
              {reviewRow.link || '— trống —'}
            </a>
            <div className="badges center">
              {reviewCheck?.platform && <span className="badge platform">{reviewCheck.platform}</span>}
              {reviewCheck?.formatError && <span className="badge err">⚠ {reviewCheck.formatError}</span>}
              {(reviewCheck?.duplicateOf.length ?? 0) > 0 && (
                <span className="badge dup">⚠ Trùng dòng {reviewCheck!.duplicateOf.join(', ')}</span>
              )}
            </div>
            <div className="review-checklist">
              <p>Mở link và kiểm tra 3 mục:</p>
              <ol>
                <li>
                  Bài viết mở được, đúng bài? — nếu không → <b>Link sai</b>
                </li>
                <li>
                  Bài để chế độ <b>Công khai</b>? — nếu không → <b>Không công khai</b>
                </li>
                <li>
                  Có gắn <b>{hashtag}</b>? — nếu không → <b>Thiếu/sai hashtag</b>
                </li>
              </ol>
            </div>
            <button
              className="btn primary big"
              onClick={() => reviewRow.link && window.open(reviewRow.link, '_blank', 'noopener')}
              disabled={!reviewRow.link}
            >
              🔗 Mở link (Enter)
            </button>
            <div className="review-verdicts">
              <button className="btn v-ok" onClick={() => reviewVerdict('HOP_LE')}>
                1 · Hợp lệ
              </button>
              <button className="btn v-bad" onClick={() => reviewVerdict('KHONG_CONG_KHAI')}>
                2 · Không công khai
              </button>
              <button className="btn v-bad" onClick={() => reviewVerdict('THIEU_HASHTAG')}>
                3 · Thiếu/sai hashtag
              </button>
              <button className="btn v-bad" onClick={() => reviewVerdict('LINK_SAI')}>
                4 · Link sai
              </button>
            </div>
            <p className="review-hint muted">Phím tắt: 1–4 chấm điểm · Enter mở link · ←/→ chuyển dòng · Esc đóng</p>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      <footer className="footer">
        Kết quả lưu tự động trên trình duyệt này. Cột K tự tính: “Hợp lệ” khi J = Hợp lệ, ngược lại “Không hợp lệ”.
      </footer>
    </div>
  )
}
