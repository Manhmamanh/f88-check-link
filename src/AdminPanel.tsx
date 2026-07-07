import { useCallback, useRef, useState } from 'react'
import './AdminPanel.css'

type Verdict = 'HOP_LE' | 'THIEU_HASHTAG' | 'KHONG_CONG_KHAI' | 'LINK_SAI' | ''

interface AdminPanelProps {
  onClose: () => void
  onUpload: (data: Record<number, Verdict>) => void
}

export default function AdminPanel({ onClose, onUpload }: AdminPanelProps) {
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const showMessage = (msg: string, type: 'success' | 'error') => {
    setMessage(msg)
    setTimeout(() => setMessage(''), 4000)
  }

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      setUploading(true)
      try {
        const text = await file.text()
        const data = JSON.parse(text)

        // Validate it's a proper results file
        if (typeof data !== 'object' || data === null) {
          throw new Error('File phải là object JSON')
        }

        // Store in localStorage
        localStorage.setItem('linkcheck-results-uploaded', JSON.stringify(data))

        // Call callback to update parent
        onUpload(data)

        showMessage(`✅ Upload thành công! ${Object.keys(data).length} kết quả đã lưu.`, 'success')
        setTimeout(() => onClose(), 1500)
      } catch (err) {
        showMessage(`❌ Lỗi: ${err instanceof Error ? err.message : 'File không hợp lệ'}`, 'error')
      } finally {
        setUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    },
    [onUpload, onClose],
  )

  const handleDownloadTemplate = () => {
    const template = {
      '2': 'HOP_LE',
      '3': 'THIEU_HASHTAG',
      '4': '',
      '5': 'KHONG_CONG_KHAI',
      '6': 'LINK_SAI',
    }
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'check-results-template.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleClearCache = () => {
    if (confirm('Bạn chắc chắn muốn xóa dữ liệu đã upload?')) {
      localStorage.removeItem('linkcheck-results-uploaded')
      showMessage('✅ Đã xóa dữ liệu cached', 'success')
    }
  }

  return (
    <div className="admin-overlay" onClick={onClose}>
      <div className="admin-panel" onClick={(e) => e.stopPropagation()}>
        <div className="admin-header">
          <h2>⚙️ Quản Lý Kết Quả Check</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="admin-content">
          <section className="admin-section">
            <h3>📤 Upload File Kết Quả</h3>
            <p className="description">
              Chọn file JSON chứa kết quả check link (format: {'{row_index: verdict}')
            </p>

            <div className="upload-box">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                disabled={uploading}
                style={{ display: 'none' }}
              />
              <button
                className="btn-upload"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? '⏳ Đang upload...' : '📁 Chọn File JSON'}
              </button>
            </div>

            {message && (
              <div className={`message ${message.includes('❌') ? 'error' : 'success'}`}>
                {message}
              </div>
            )}
          </section>

          <section className="admin-section">
            <h3>📋 Format Dữ Liệu</h3>
            <p className="description">File JSON phải có format:</p>
            <pre className="format-example">{`{
  "2": "HOP_LE",
  "3": "THIEU_HASHTAG",
  "4": "",
  "5": "KHONG_CONG_KHAI",
  "6": "LINK_SAI"
}`}</pre>
            <p className="description">
              Các verdict có thể dùng: <code>HOP_LE</code>, <code>THIEU_HASHTAG</code>, <code>KHONG_CONG_KHAI</code>, <code>LINK_SAI</code>, hoặc <code>""</code> (chưa check)
            </p>
          </section>

          <section className="admin-section">
            <h3>🛠️ Tùy Chọn</h3>
            <div className="options">
              <button className="btn btn-secondary" onClick={handleDownloadTemplate}>
                📥 Tải Template
              </button>
              <button className="btn btn-danger" onClick={handleClearCache}>
                🗑️ Xóa Dữ Liệu Cached
              </button>
            </div>
          </section>

          <section className="admin-section info">
            <p>
              💡 <strong>Lưu ý:</strong> Dữ liệu được upload sẽ được lưu trong localStorage của trình duyệt.
              Để thay đổi, hãy upload file mới hoặc xóa dữ liệu cached.
            </p>
          </section>
        </div>

        <div className="admin-footer">
          <button className="btn btn-primary" onClick={onClose}>
            ← Đóng
          </button>
        </div>
      </div>
    </div>
  )
}
