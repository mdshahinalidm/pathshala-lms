'use client'

/**
 * uploadFileXhr — multipart upload with REAL progress (% events) via XHR.
 * Used by the lesson editor (big local videos) and the media library.
 * Server: POST /api/admin/upload → { ok, data: { id, url, kind, size, mime } }.
 */
export interface UploadResult {
  id: string
  url: string
  kind: string
  size: number
  mime: string
  filename: string
  /** Original client filename (present on some upload responses). */
  originalName?: string
}

export function uploadFileXhr(
  file: File,
  opts: { kind?: string; onProgress?: (pct: number) => void } = {}
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/admin/upload')
    xhr.withCredentials = true
    xhr.timeout = 30 * 60 * 1000 // big videos need time

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && opts.onProgress) {
        opts.onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)))
      }
    }
    xhr.onerror = () => reject(new Error('নেটওয়ার্ক এরর — আপলোড ব্যর্থ হয়েছে।'))
    xhr.ontimeout = () => reject(new Error('আপলোডে সময় শেষ — আবার চেষ্টা করুন।'))
    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText) as {
          ok: boolean
          data?: UploadResult
          error?: string
        }
        if (xhr.status >= 200 && xhr.status < 300 && json.ok && json.data) {
          opts.onProgress?.(100)
          resolve(json.data)
        } else {
          reject(new Error(json.error || `আপলোড ব্যর্থ হয়েছে (${xhr.status})`))
        }
      } catch {
        reject(new Error(`সার্ভার থেকে অপ্রত্যাশিত উত্তর (${xhr.status})`))
      }
    }

    const fd = new FormData()
    if (opts.kind) fd.append('kind', opts.kind)
    fd.append('file', file)
    xhr.send(fd)
  })
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
