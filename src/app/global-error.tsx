'use client'

/**
 * Global error boundary — last-resort full-document fallback.
 * Only renders when the root layout itself fails; offers a clean reload
 * path so the site can always recover, never dead-end.
 */
import { AlertTriangle, RefreshCcw } from 'lucide-react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="bn">
      <body
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          fontFamily: 'system-ui, sans-serif',
          background: '#ffffff',
          color: '#0f172a',
          padding: 24,
          textAlign: 'center',
        }}
      >
        <span
          style={{
            display: 'flex',
            height: 64,
            width: 64,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 16,
            background: 'rgba(245, 158, 11, 0.1)',
            color: '#d97706',
          }}
        >
          <AlertTriangle size={32} />
        </span>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          সাইট লোড করতে সমস্যা হচ্ছে · The site failed to load
        </h1>
        <p style={{ color: '#64748b', maxWidth: 440, fontSize: 14, margin: 0 }}>
          একটি অপ্রত্যাশিত সমস্যা হয়েছে। নিচের বাটনে চাপ দিয়ে আবার লোড করুন — আপনার ডেটা নিরাপদ।
          <br />
          An unexpected error occurred. Reload below — your data is safe.
        </p>
        <button
          onClick={reset}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            borderRadius: 10,
            border: '1px solid #e2e8f0',
            background: '#0e7a5f',
            color: '#ffffff',
            padding: '10px 18px',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <RefreshCcw size={16} /> আবার লোড করুন · Reload
        </button>
      </body>
    </html>
  )
}
