export type Verdict = '' | 'HOP_LE' | 'LINK_SAI' | 'KHONG_CONG_KHAI' | 'THIEU_HASHTAG'

export interface SheetRow {
  rowIndex: number // số dòng thật trên Google Sheet (bắt đầu từ 2)
  stt: string
  maNV: string
  hoTen: string
  khoi: string
  layer1: string
  layer2: string
  layer3: string
  link: string
  sheetJ: string
  sheetK: string
}

export interface AutoCheck {
  platform: string // 'Facebook' | 'LinkedIn' | 'Instagram' | 'TikTok' | 'Khác' | ''
  formatError: string // lỗi định dạng phát hiện tự động, '' nếu OK
  duplicateOf: number[] // STT các dòng khác có cùng link
}

export const VERDICT_LABEL: Record<Exclude<Verdict, ''>, string> = {
  HOP_LE: 'Hợp lệ',
  LINK_SAI: 'Link sai',
  KHONG_CONG_KHAI: 'Không công khai',
  THIEU_HASHTAG: 'Thiếu/sai hashtag',
}

export function verdictToJ(v: Verdict): string {
  return v ? VERDICT_LABEL[v] : ''
}

export function verdictToK(v: Verdict): string {
  if (!v) return ''
  return v === 'HOP_LE' ? 'Hợp lệ' : 'Không hợp lệ'
}

export function jTextToVerdict(j: string): Verdict {
  const t = j.trim().toLowerCase()
  if (!t) return ''
  if (t.includes('hợp lệ') && !t.includes('không')) return 'HOP_LE'
  if (t.includes('link sai') || t.includes('sai link')) return 'LINK_SAI'
  if (t.includes('công khai')) return 'KHONG_CONG_KHAI'
  if (t.includes('hashtag') || t.includes('hastag')) return 'THIEU_HASHTAG'
  return ''
}
