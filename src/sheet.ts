import type { AutoCheck, SheetRow } from './types'

export const DEFAULT_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1pg-C-YwjNFYATcJFHnIRKdV-C5J_Y5sL37uvxj3gcpc/edit?usp=sharing'

export function parseSheetUrl(url: string): { id: string; gid: string | null } | null {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (!m) return null
  const gidMatch = url.match(/[#&?]gid=(\d+)/)
  return { id: m[1], gid: gidMatch ? gidMatch[1] : null }
}

interface GvizCell {
  v: unknown
  f?: string
}
interface GvizRow {
  c: (GvizCell | null)[]
}

function cellText(c: GvizCell | null | undefined): string {
  if (!c) return ''
  if (c.f !== undefined && c.v !== null) return String(c.f)
  if (c.v === null || c.v === undefined) return ''
  return String(c.v)
}

export async function loadSheet(url: string): Promise<SheetRow[]> {
  const parsed = parseSheetUrl(url)
  if (!parsed) throw new Error('Link Google Sheet không đúng định dạng.')
  const gvizUrl =
    `https://docs.google.com/spreadsheets/d/${parsed.id}/gviz/tq?tqx=out:json&headers=1` +
    (parsed.gid ? `&gid=${parsed.gid}` : '')
  let res: Response
  try {
    res = await fetch(gvizUrl)
  } catch {
    throw new Error('Không tải được Sheet. Kiểm tra kết nối mạng hoặc quyền chia sẻ của Sheet.')
  }
  if (!res.ok) throw new Error(`Không tải được Sheet (HTTP ${res.status}). Sheet cần bật chia sẻ "Bất kỳ ai có link".`)
  const text = await res.text()
  const start = text.indexOf('(')
  const end = text.lastIndexOf(')')
  if (start < 0 || end < 0) throw new Error('Dữ liệu Sheet trả về không hợp lệ. Sheet có thể chưa được chia sẻ công khai.')
  const json = JSON.parse(text.slice(start + 1, end))
  if (json.status === 'error') {
    throw new Error('Google từ chối truy cập Sheet. Bật chia sẻ "Bất kỳ ai có link — Người xem".')
  }
  const rows: GvizRow[] = json.table?.rows ?? []
  const mapped = rows.map((r, i) => {
    const c = r.c ?? []
    return {
      rowIndex: i + 2,
      stt: cellText(c[0]),
      maNV: cellText(c[2]),
      hoTen: cellText(c[3]),
      khoi: cellText(c[4]),
      layer1: cellText(c[5]),
      layer2: cellText(c[6]),
      layer3: cellText(c[7]),
      link: cellText(c[8]).trim(),
      sheetJ: cellText(c[9]),
      sheetK: cellText(c[10]),
    }
  })
  // bỏ các dòng hoàn toàn trống (chưa có bản ghi nộp link)
  return mapped.filter((r) => r.link || r.hoTen || r.maNV)
}

const PLATFORMS: [RegExp, string][] = [
  [/(^|\.)facebook\.com$|(^|\.)fb\.com$|(^|\.)fb\.watch$/i, 'Facebook'],
  [/(^|\.)linkedin\.com$|^lnkd\.in$/i, 'LinkedIn'],
  [/(^|\.)instagram\.com$/i, 'Instagram'],
  [/(^|\.)tiktok\.com$/i, 'TikTok'],
  [/(^|\.)threads\.(net|com)$/i, 'Threads'],
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/i, 'YouTube'],
  [/(^|\.)zalo\.me$/i, 'Zalo'],
  [/^x\.com$|(^|\.)twitter\.com$/i, 'X'],
]

function normalizeLink(link: string): string {
  try {
    const u = new URL(link)
    // bỏ tham số tracking để so trùng lặp
    const keep = new URL(u.origin + u.pathname)
    const idParam = u.searchParams.get('story_fbid') || u.searchParams.get('id') || u.searchParams.get('v')
    return (keep.href.replace(/\/+$/, '') + (idParam ? '?' + idParam : '')).toLowerCase()
  } catch {
    return link.toLowerCase().trim()
  }
}

export function autoCheckRows(rows: SheetRow[]): Map<number, AutoCheck> {
  const result = new Map<number, AutoCheck>()
  const seen = new Map<string, number[]>() // normalized link -> danh sách rowIndex

  for (const row of rows) {
    const check: AutoCheck = { platform: '', formatError: '', duplicateOf: [] }
    if (!row.link) {
      check.formatError = 'Chưa có link'
      result.set(row.rowIndex, check)
      continue
    }
    let u: URL | null = null
    try {
      u = new URL(row.link)
    } catch {
      check.formatError = 'Không phải URL hợp lệ'
    }
    if (u) {
      if (u.protocol !== 'https:' && u.protocol !== 'http:') {
        check.formatError = 'URL không phải http/https'
      } else {
        const host = u.hostname.replace(/^www\.|^m\.|^web\.|^vt\.|^vm\./, '')
        const found = PLATFORMS.find(([re]) => re.test(host))
        if (found) {
          check.platform = found[1]
        } else {
          check.platform = 'Khác'
          check.formatError = `Tên miền lạ: ${u.hostname}`
        }
      }
      const norm = normalizeLink(row.link)
      const prev = seen.get(norm) ?? []
      if (prev.length > 0) {
        check.duplicateOf = [...prev]
        for (const p of prev) {
          const other = result.get(p)
          if (other && !other.duplicateOf.includes(row.rowIndex)) other.duplicateOf.push(row.rowIndex)
        }
      }
      prev.push(row.rowIndex)
      seen.set(norm, prev)
    }
    result.set(row.rowIndex, check)
  }
  return result
}
