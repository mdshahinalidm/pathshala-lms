/**
 * resolveVideoUrl — THE one URL normalizer for lesson videos.
 * Used by the classroom player (student) and the course-detail preview.
 *
 * Supports ANY link the admin pastes:
 *  - YouTube        watch?v= · youtu.be/ · shorts/ · embed/ · live/  → iframe embed
 *  - Vimeo          vimeo.com/123 · vimeo.com/video/123              → player embed
 *  - Google Drive   drive.google.com/file/d/<id>/view                → preview embed
 *  - Bunny/CDN      *.b-cdn.net · mediadelivery.net · player.* · /embed/ → as-is iframe
 *  - Direct files   .mp4/.webm/.ogg/.mov… (incl. local /uploads/*)   → <video> player
 */

export type VideoSourceKind = 'iframe' | 'mp4'
export type VideoSourceProvider = 'YOUTUBE' | 'VIMEO' | 'DRIVE' | 'EMBED' | 'MP4'

export interface ResolvedVideo {
  kind: VideoSourceKind
  provider: VideoSourceProvider
  src: string
  /** Raw YouTube video id (YOUTUBE provider only) — used by the protected player. */
  videoId?: string
}

export function resolveVideoUrl(rawUrl: string): ResolvedVideo | null {
  const u = (rawUrl ?? '').trim()
  if (!u) return null

  // YouTube: watch?v= | youtu.be/ | shorts/ | embed/ | live/
  const yt = u.match(
    /(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/
  )
  if (yt) {
    return {
      kind: 'iframe',
      provider: 'YOUTUBE',
      // Bare embed — query params are owned by the player components
      // (ProtectedYouTubePlayer strips ALL YouTube chrome: controls, title,
      // share, CC, settings, fullscreen, related-videos end screen).
      src: `https://www.youtube.com/embed/${yt[1]}`,
      videoId: yt[1],
    }
  }

  // Vimeo: vimeo.com/123456 | vimeo.com/video/123456
  const vm = u.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  if (vm) {
    return {
      kind: 'iframe',
      provider: 'VIMEO',
      // Bare embed — ProtectedVimeoPlayer owns params + custom controls.
      src: `https://player.vimeo.com/video/${vm[1]}`,
      videoId: vm[1],
    }
  }

  // Google Drive: drive.google.com/file/d/<id>/...
  const gd = u.match(/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/)
  if (gd) {
    return { kind: 'iframe', provider: 'DRIVE', src: `https://drive.google.com/file/d/${gd[1]}/preview` }
  }

  // Already-embeddable player links (bunny, generic players, /embed/ paths)
  if (/b-cdn\.net|mediadelivery\.net|bunny\.net|player\.|\/embed([/?]|$)/i.test(u)) {
    return { kind: 'iframe', provider: 'EMBED', src: u }
  }

  // Everything else → direct file (local /uploads/* or external mp4/webm/…)
  return { kind: 'mp4', provider: 'MP4', src: u }
}

/** Detect the admin-builder provider from a pasted URL (for auto-select). */
export function detectVideoProvider(url: string): 'MP4' | 'YOUTUBE' | 'VIMEO' | 'DRIVE' | 'BUNNY' {
  const u = (url ?? '').trim()
  if (/youtube\.com|youtu\.be/i.test(u)) return 'YOUTUBE'
  if (/vimeo\.com/i.test(u)) return 'VIMEO'
  if (/drive\.google\.com/i.test(u)) return 'DRIVE'
  if (/b-cdn\.net|mediadelivery\.net|bunny/i.test(u)) return 'BUNNY'
  return 'MP4'
}

/**
 * Lesson PDF/file content is a real FILE URL when it is absolute (http/https)
 * OR site-relative (/uploads/… from the admin media uploader). Anything else
 * is plain text. Fixes: "/uploads/…pdf" lessons showed no open/download
 * button and printed the raw path as text.
 */
export function isFileUrl(value?: string | null): boolean {
  return /^(https?:\/\/|\/)\S+/i.test((value ?? '').trim())
}

/**
 * Viewer src for an inline PDF embed. Same-origin files get Chrome/Edge's
 * built-in toolbar hidden (#toolbar=0) so the ONLY download path is our own
 * controlled button; external URLs pass through untouched.
 */
export function pdfEmbedSrc(url: string): string {
  const clean = (url ?? '').trim()
  if (!clean.startsWith('/')) return clean
  return clean.includes('#') ? clean : `${clean}#toolbar=0&navpanes=0`
}
