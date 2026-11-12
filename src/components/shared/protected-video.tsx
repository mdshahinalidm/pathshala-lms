'use client'

/**
 * PROTECTED VIDEO PLAYERS — the source is INVISIBLE, downloads/recording are
 * deterred, and the player chrome is colorful. Used by the classroom (enrolled
 * students), the course-detail preview and the admin lesson preview.
 *
 * ══════════════ THE PERMANENT ANTI-BRANDING ARCHITECTURE ══════════════
 *
 * VERTICAL OVERSCAN (the core trick, works for every iframe provider):
 * the provider iframe is rendered 160% of the container height, vertically
 * centered (top: -30%). Every provider letterboxes its video inside the
 * iframe (width-fit, centered), so the 16:9 picture is exactly the middle
 * 100% of the iframe height = EXACTLY the visible container:
 *
 *   container 360px tall → iframe 576px tall at top:-108px
 *   picture inside iframe: y ∈ [108, 468]  =  visible region  ✓ pixel-perfect
 *   YouTube/Vimeo title bar (top ~80px of iframe): y ∈ [0, 80]   → CLIPPED ✓
 *   provider logo/timeline/"1x" (bottom ~90px of iframe): y ∈ [486,576] → CLIPPED ✓
 *
 * Provider chrome (title bar, channel avatar, share button, wordmark logo,
 * timeline, speed pill, chapter pills, end screens, Drive filename bar) is
 * ALWAYS painted inside those top/bottom strips — it is geometrically
 * impossible for any of it to appear on screen, whatever triggers it
 * (play-start flash, hover, pause, end). The picture itself stays 100%
 * visible and uncropped.
 *
 * Layered on top:
 *  1. OPAQUE cover whenever the video is not actually playing → the
 *     provider's center-painted big play button can never be seen either.
 *  2. Transparent click-catcher above the iframe → no hover/mousemove or
 *     stray click ever reaches the provider surface (for YouTube/Vimeo).
 *  3. Custom colorful control bar ONLY ours (play/seek/timer/volume/speed/
 *     fullscreen) — no native menus, no download, no PiP.
 *  4. DOUBLE play button poster — nothing loads until the student clicks
 *     (fast pages, zero provider fingerprint: NO provider thumbnail either,
 *     the poster is a pure-CSS colorful gradient).
 *  5. Auto-retreat 1.2s before the true end → provider end screens impossible.
 *  6. Screen-recording shield — auto-pause on window blur / tab switch with
 *     a full-screen shield; PrintScreen / ⌘⇧3/4/5 triggers an instant
 *     black-out flash + best-effort clipboard overwrite + warning.
 *  7. MP4: controlsList="nodownload noplaybackrate noremoteplayback",
 *     disablePictureInPicture, no native controls, context menu blocked.
 *  8. NO watermark is drawn on any video surface (product rule: only the
 *     picture + our own timer).
 *
 * Honest note: no web app can block OS-level capture 100% — the shield and
 * auto-pause make casual recording impractical.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  ShieldAlert, AlertTriangle, Loader2, Settings, Check, ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useUI } from '@/store/ui-store'
import { fmtClock } from '@/lib/format'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

/* ════════════════════════ shared visual building blocks ═════════════════ */

/** Overscan geometry — see the architecture note at the top of this file. */
const OVERSCAN = { top: '-30%', height: '160%' } as const

/** Colorful poster: play button on an animated gradient field.
    Pure CSS — zero network requests, zero provider fingerprint.
    (Compact size per spec — crisp on desktop AND mobile, never oversized:
    play circle 56px mobile / 64px desktop, hint pill text-xs px-3.) */
export function ColorPoster({
  hint, busy = false, onPlay,
}: {
  hint?: string
  busy?: boolean
  onPlay: () => void
}) {
  const { tx } = useUI()
  return (
    <div className="absolute inset-0 z-40 overflow-hidden bg-[#07090d]">
      {/* colorful blurred blobs */}
      <div className="absolute -top-24 -left-20 h-72 w-72 rounded-full bg-emerald-500/25 blur-3xl" aria-hidden />
      <div className="absolute -bottom-28 -right-16 h-80 w-80 rounded-full bg-fuchsia-500/20 blur-3xl" aria-hidden />
      <div className="absolute top-1/3 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-rose-500/15 blur-3xl" aria-hidden />
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.6) 100%)' }}
        aria-hidden
      />
      <button
        type="button"
        onClick={onPlay}
        className="group absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-3"
        aria-label={tx('ভিডিও চালু করুন', 'Play the video')}
      >
        {/* Play button: rotating conic ring + gradient disc — compact (56/64px) */}
        <span className="relative flex h-14 w-14 items-center justify-center sm:h-16 sm:w-16">
          <span
            className="absolute inset-0 animate-[spin_7s_linear_infinite] rounded-full opacity-90 transition-opacity group-hover:opacity-100"
            style={{ background: 'conic-gradient(from 0deg, #10b981, #8b5cf6, #ec4899, #f59e0b, #10b981)' }}
            aria-hidden
          />
          <span className="absolute inset-[2.5px] rounded-full bg-[#07090d]" aria-hidden />
          <span className="absolute inset-2 animate-pulse rounded-full bg-gradient-to-br from-emerald-500/30 to-fuchsia-500/30 blur-sm" aria-hidden />
          <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 via-teal-500 to-fuchsia-500 text-white shadow-lg shadow-fuchsia-500/40 transition-transform duration-300 group-hover:scale-110 sm:h-12 sm:w-12">
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin sm:h-5 sm:w-5" aria-hidden />
            ) : (
              <Play className="ml-0.5 h-4 w-4 fill-current drop-shadow sm:ml-1 sm:h-5 sm:w-5" aria-hidden />
            )}
          </span>
        </span>
        <span className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/60 px-3 py-1.5 text-xs font-bold text-white shadow-lg backdrop-blur-md">
          <span className="h-1 w-1 rounded-full bg-gradient-to-r from-emerald-400 to-fuchsia-500 sm:h-1.5 sm:w-1.5" aria-hidden />
          {hint ?? tx('ক্লিক করে ভিডিও চালু করুন', 'Click to start the video')}
        </span>
      </button>
    </div>
  )
}

/** Opaque cover shown whenever the raw surface could paint provider UI
    (paused / cued / ended / first buffering). Shows a calm play glyph
    (compact — scaled down proportionally with the poster button). */
function PauseCover() {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black" aria-hidden>
      <span className="relative flex h-12 w-12 items-center justify-center opacity-90 sm:h-14 sm:w-14">
        <span
          className="absolute inset-0 rounded-full p-[2px]"
          style={{ background: 'linear-gradient(135deg, #10b981, #8b5cf6, #ec4899)' }}
        >
          <span className="flex h-full w-full items-center justify-center rounded-full bg-black">
            <Play className="ml-0.5 h-4 w-4 fill-current text-white sm:ml-1 sm:h-5 sm:w-5" />
          </span>
        </span>
      </span>
    </div>
  )
}

/** Custom colorful seek bar — pointer scrub + keyboard, gradient fill. */
function SeekBar({
  current, duration, buffered, onSeek, disabled = false,
}: {
  current: number
  duration: number
  buffered: number
  onSeek: (t: number) => void
  disabled?: boolean
}) {
  const { tx } = useUI()
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [dragT, setDragT] = useState<number | null>(null)
  const shown = Math.max(0, Math.min(duration || 0, dragT ?? current))
  const pct = duration > 0 ? (shown / duration) * 100 : 0
  const bufPct = duration > 0 ? Math.min(100, (buffered / duration) * 100) : 0

  const timeAt = (clientX: number) => {
    const el = trackRef.current
    if (!el || duration <= 0) return 0
    const r = el.getBoundingClientRect()
    const ratio = r.width > 0 ? (clientX - r.left) / r.width : 0
    return Math.max(0, Math.min(duration, ratio * duration))
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled || duration <= 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const t = timeAt(e.clientX)
    setDragT(t)
    onSeek(t)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragT === null) return
    setDragT(timeAt(e.clientX))
  }
  const onPointerUp = (e: React.PointerEvent) => {
    if (dragT === null) return
    const t = timeAt(e.clientX)
    setDragT(null)
    onSeek(t)
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled || duration <= 0) return
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const t = Math.max(0, Math.min(duration, current + (e.key === 'ArrowRight' ? 5 : -5)))
      onSeek(t)
    }
  }

  return (
    <div
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={tx('ভিডিওর অংশে যান', 'Seek')}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(shown)}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={cn('group/seek flex h-4 w-full items-center', disabled ? 'cursor-default' : 'cursor-pointer')}
    >
      <div ref={trackRef} className="relative h-1.5 w-full rounded-full bg-white/15">
        <div className="absolute inset-y-0 left-0 rounded-full bg-white/20" style={{ width: `${bufPct}%` }} aria-hidden />
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-400 via-violet-500 to-rose-500"
          style={{ width: `${pct}%` }}
          aria-hidden
        />
        <div
          className={cn(
            'absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-md ring-2 ring-fuchsia-400/80 transition-transform',
            dragT !== null ? 'scale-125' : 'scale-0 group-hover/seek:scale-100'
          )}
          style={{ left: `${pct}%` }}
          aria-hidden
        />
      </div>
    </div>
  )
}

/** Shared colorful control bar (our own UI only — no provider chrome).
    Layout: Play → Timeline → Time → Volume → Quality/Settings → Speed → Fullscreen.
    Auto-hide: the bar fades out after 4s of no interaction WHILE playing
    (per spec) and reappears on any mouse move / touch / key interaction. */
const AUTO_HIDE_MS = 4000

/** Auto-hide state: visible while paused; hides after 4s idle while playing. */
function useAutoHideControls(playing: boolean) {
  const [idle, setIdle] = useState(false)
  const timerRef = useRef<number | null>(null)

  const poke = useCallback(() => {
    setIdle(false)
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setIdle(true), AUTO_HIDE_MS)
  }, [])

  useEffect(() => {
    // Playback (re)starts → begin the idle countdown. Paused → cancel it
    // (visibility is derived, so no setState is needed here).
    if (!playing) {
      if (timerRef.current) window.clearTimeout(timerRef.current)
      return
    }
    const t = window.setTimeout(() => setIdle(true), AUTO_HIDE_MS)
    timerRef.current = t
    return () => window.clearTimeout(t)
  }, [playing])

  return { controlsVisible: !idle || !playing, poke }
}

function PlayerControlBar({
  playing, current, duration, buffered, volume, muted, rate,
  onToggle, onSeek, onVolume, onRate, onFullscreen, isFs,
  showSpeed = true, showVolume = true,
  qualities, activeQuality, onQuality,
  visible = true,
}: {
  playing: boolean
  current: number
  duration: number
  buffered: number
  volume: number
  muted: boolean
  rate: string
  onToggle: () => void
  onSeek: (t: number) => void
  onVolume: (v: number, m: boolean) => void
  onRate: (r: string) => void
  onFullscreen?: () => void
  isFs?: boolean
  showSpeed?: boolean
  showVolume?: boolean
  /** Real quality levels reported by the source (never fake options). */
  qualities?: string[]
  activeQuality?: string
  onQuality?: (q: string) => void
  visible?: boolean
}) {
  const { tx } = useUI()
  const [qualityOpen, setQualityOpen] = useState(false)
  const qualityRef = useRef<HTMLDivElement | null>(null)

  // Close the quality menu on outside click.
  useEffect(() => {
    if (!qualityOpen) return
    const onDown = (e: PointerEvent) => {
      if (qualityRef.current && !qualityRef.current.contains(e.target as Node)) setQualityOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [qualityOpen])

  const QUALITY_LABEL: Record<string, string> = {
    auto: 'Auto',
    highres: '1080p+',
    hd1080: '1080p',
    hd720: '720p',
    large: '480p',
    medium: '360p',
    small: '240p',
    tiny: '144p',
  }

  return (
    <div
      className={cn(
        'absolute inset-x-0 bottom-0 z-40 bg-gradient-to-t from-black/95 via-black/60 to-transparent px-2 pb-1 pt-8 transition-opacity duration-300 sm:px-3',
        visible ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      <SeekBar current={current} duration={duration} buffered={buffered} onSeek={onSeek} disabled={duration <= 0} />
      <div className="mt-0.5 flex items-center gap-1 sm:gap-1.5">
        <button
          type="button"
          onClick={onToggle}
          className="rounded-full p-1.5 text-white transition-colors hover:bg-white/15"
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
        </button>
        <span className="flex items-center gap-1 rounded-full bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white/90">
          {fmtClock(Math.floor(current))}
          <span className="text-white/40">/</span>
          <span className="text-white/70">{fmtClock(Math.floor(duration))}</span>
        </span>
        <div className="min-w-2 flex-1" />
        {showVolume && (
          <>
            <button
              type="button"
              onClick={() => onVolume(muted || volume === 0 ? (volume > 0 ? volume : 0.8) : volume, !(muted || volume === 0) || volume === 0 ? false : true)}
              className="rounded-full p-1.5 text-white transition-colors hover:bg-white/15"
              aria-label={muted ? 'Unmute' : 'Mute'}
            >
              {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => {
                const v = Number(e.target.value)
                onVolume(v, v === 0)
              }}
              className="h-1 w-9 accent-emerald-400 sm:w-16"
              aria-label="Volume"
            />
          </>
        )}
        {/* Quality / Settings — only REAL options from the source are listed */}
        {onQuality && qualities && qualities.length > 0 && (
          <div ref={qualityRef} className="relative">
            <button
              type="button"
              onClick={() => setQualityOpen((v) => !v)}
              className="rounded-full p-1.5 text-white transition-colors hover:bg-white/15"
              aria-label={tx('কোয়ালিটি সেটিং', 'Quality settings')}
              aria-expanded={qualityOpen}
            >
              <Settings className="h-4 w-4" />
            </button>
            {qualityOpen && (
              <div
                role="menu"
                aria-label={tx('ভিডিও কোয়ালিটি', 'Video quality')}
                className="absolute bottom-10 right-0 max-h-56 w-28 overflow-y-auto rounded-xl border border-white/15 bg-black/90 p-1 shadow-xl backdrop-blur-md"
              >
                {qualities.map((q) => (
                  <button
                    key={q}
                    type="button"
                    role="menuitemradio"
                    aria-checked={activeQuality === q}
                    onClick={() => {
                      onQuality(q)
                      setQualityOpen(false)
                    }}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold transition-colors',
                      activeQuality === q ? 'bg-white/15 text-white' : 'text-white/75 hover:bg-white/10 hover:text-white',
                    )}
                  >
                    {QUALITY_LABEL[q] ?? q}
                    {activeQuality === q && <Check className="h-3.5 w-3.5" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {showSpeed && (
          <Select value={rate} onValueChange={onRate}>
            <SelectTrigger className="h-7 w-[52px] rounded-full border-white/20 bg-white/10 text-xs text-white [&>svg]:text-white/80 sm:w-[68px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['0.75', '1', '1.25', '1.5', '2'].map((r) => (
                <SelectItem key={r} value={r} className="text-xs">
                  {r}x
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {onFullscreen && (
          <button
            type="button"
            onClick={onFullscreen}
            className="rounded-full p-1.5 text-white transition-colors hover:bg-white/15"
            aria-label="Fullscreen"
          >
            {isFs ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </button>
        )}
      </div>
    </div>
  )
}

/* ════════════════════════ screen-recording shield ═══════════════════════ */

type ShieldReason = 'focus' | 'capture' | null

/** Pause-on-blur + tab-switch + PrintScreen deterrent. Purely additive. */
function useScreenShield(playing: boolean, pause: () => void) {
  const { tx } = useUI()
  const [reason, setReason] = useState<ShieldReason>(null)
  const lastWarnRef = useRef(0)

  const playingRef = useRef(playing)
  const pauseRef = useRef(pause)
  useEffect(() => {
    playingRef.current = playing
    pauseRef.current = pause
  }, [playing, pause])

  useEffect(() => {
    const warn = (msg: string) => {
      const now = Date.now()
      if (now - lastWarnRef.current < 4000) return
      lastWarnRef.current = now
      toast.warning(msg, { duration: 5000 })
    }

    const pauseForFocus = () => {
      if (!playingRef.current) return
      pauseRef.current()
      setReason('focus')
      warn(
        tx(
          'উইন্ডো/ট্যাব পরিবর্তন শনাক্ত — সুরক্ষার জন্য ভিডিও বন্ধ হয়েছে',
          'Window/tab switch detected — video paused for protection'
        )
      )
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') pauseForFocus()
    }

    const flashForCapture = () => {
      setReason('capture')
      window.setTimeout(() => setReason((r) => (r === 'capture' ? null : r)), 1600)
      warn(tx('স্ক্রিনশট/রেকর্ডিং শনাক্ত — নিষিদ্ধ!', 'Screenshot/recording detected — forbidden!'))
      // Best-effort: poison the clipboard so the captured frame is overwritten
      try {
        void navigator.clipboard
          ?.writeText('পাঠশালা — কনটেন্ট কপিরাইট সুরক্ষিত 🔒')
          .catch(() => {})
      } catch {
        /* clipboard permission denied — deterrent overlay is enough */
      }
    }

    const onKey = (e: KeyboardEvent) => {
      const k = (e.key ?? '').toLowerCase()
      if (
        e.key === 'PrintScreen' ||
        ((e.metaKey || e.ctrlKey || e.altKey) && e.shiftKey && ['3', '4', '5'].includes(k))
      ) {
        flashForCapture()
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', pauseForFocus)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('keyup', onKey, true)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', pauseForFocus)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('keyup', onKey, true)
    }
  }, [tx])

  const resume = useCallback(() => setReason(null), [])
  return { shield: reason, resume }
}

function ShieldOverlay({
  reason, onResume,
}: {
  reason: Exclude<ShieldReason, null>
  onResume: () => void
}) {
  const { tx } = useUI()
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/95 px-6 text-center text-white">
      <ShieldAlert className="h-10 w-10 text-amber-400" aria-hidden />
      <p className="text-base font-bold">
        {reason === 'capture'
          ? tx('স্ক্রিনশট/রেকর্ডিং শনাক্ত হয়েছে!', 'Screenshot/recording detected!')
          : tx('ভিডিও সাময়িকভাবে বন্ধ হয়েছে', 'Video temporarily stopped')}
      </p>
      <p className="max-w-sm text-xs leading-relaxed text-white/70">
        {tx(
          'পাঠশালার ভিডিও কপিরাইট সুরক্ষিত — স্ক্রিন রেকর্ড, স্ক্রিনশট বা ডাউনলোড কঠোরভাবে নিষিদ্ধ।',
          'PathShala videos are copyright-protected — screen recording, screenshots and downloads are strictly forbidden.'
        )}
      </p>
      {reason === 'focus' && (
        <Button
          size="sm"
          onClick={onResume}
          className="mt-1 gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-400 hover:to-teal-500"
        >
          <Play className="h-4 w-4 fill-current" />
          {tx('আবার চালান', 'Resume video')}
        </Button>
      )}
    </div>
  )
}

/* ════════════════════════ shared fullscreen hook ════════════════════════ */

function useFullscreen(stageRef: React.RefObject<HTMLDivElement | null>) {
  const [isFs, setIsFs] = useState(false)
  useEffect(() => {
    const onFs = () => setIsFs(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])
  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {})
    } else {
      void stageRef.current?.requestFullscreen?.().catch(() => {})
    }
  }, [stageRef])
  return { isFs, toggleFullscreen: toggle }
}

/* ════════════════════════ Protected YouTube player ══════════════════════ */

interface YTPlayer {
  playVideo(): void
  pauseVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  getCurrentTime(): number
  getDuration(): number
  getPlayerState(): number
  getVideoLoadedFraction(): number
  mute(): void
  unMute(): void
  isMuted(): boolean
  setVolume(volume: number): void
  setPlaybackRate(rate: number): void
  getPlaybackRate?(): number
  getAvailableQualityLevels?(): string[]
  destroy(): void
}
interface YTEvent {
  target: YTPlayer
  data: number
}
interface YTNamespace {
  Player: new (
    el: HTMLElement | string,
    opts: {
      videoId: string
      width?: string | number
      height?: string | number
      playerVars?: Record<string, string | number>
      events?: {
        onReady?: (e: YTEvent) => void
        onStateChange?: (e: YTEvent) => void
        onError?: (e: YTEvent) => void
      }
    }
  ) => YTPlayer
}
declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

/** Loads the YouTube IFrame API exactly once (singleton promise). */
let ytApiPromise: Promise<YTNamespace> | null = null
function loadYouTubeApi(): Promise<YTNamespace> {
  if (typeof window === 'undefined') return Promise.reject(new Error('ssr'))
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (ytApiPromise) return ytApiPromise
  ytApiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      if (window.YT?.Player) resolve(window.YT)
      else reject(new Error('yt-api-missing'))
    }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    script.onerror = () => reject(new Error('yt-api-network'))
    document.head.appendChild(script)
    window.setTimeout(() => {
      if (!window.YT?.Player) reject(new Error('yt-api-timeout'))
    }, 15000)
  }).catch((err) => {
    ytApiPromise = null // allow retry on next click
    throw err
  })
  return ytApiPromise
}

/** YouTube player states: -1 unstarted · 0 ended · 1 playing · 2 paused · 3 buffering · 5 cued */
const YT_STATE = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3 } as const
/* Warn about the FIRST player error only — repeated per-lesson warnings spam
   the console and inflate the dev-issues badge on mobile. */
let ytErrorWarnedOnce = false

export function ProtectedYouTubePlayer({
  videoId, title, onAutoComplete, className,
}: {
  videoId: string
  title: string
  onAutoComplete?: () => void
  className?: string
}) {
  const { tx } = useUI()

  const [phase, setPhase] = useState<'poster' | 'loading' | 'ready' | 'error'>('poster')
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [rate, setRate] = useState('1')
  // Raw YouTube surface state (see YT_STATE). The iframe lives in the overscan
  // stage (all painted chrome clipped) AND stays opaquely covered except
  // during true playback → NOTHING of YouTube can ever appear on screen.
  const [ytState, setYtState] = useState(-1)
  const [everPlayed, setEverPlayed] = useState(false)
  const everPlayedRef = useRef(false)
  // Auto-hide controls + quality settings (REAL levels from the YT API only)
  const { controlsVisible, poke } = useAutoHideControls(playing)
  const [qualities, setQualities] = useState<string[]>([])
  const [activeQuality, setActiveQuality] = useState('auto')

  const stageRef = useRef<HTMLDivElement | null>(null)
  const mountRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const retryRef = useRef(false) // one silent nocookie-host retry on player error
  const autoSentRef = useRef(false)
  const autoCompleteRef = useRef(onAutoComplete)
  useEffect(() => {
    autoCompleteRef.current = onAutoComplete
  }, [onAutoComplete])
  const { isFs, toggleFullscreen } = useFullscreen(stageRef)

  /* Pause + shield integration */
  const pauseVideo = useCallback(() => {
    try {
      playerRef.current?.pauseVideo()
    } catch {
      /* player not ready */
    }
    setPlaying(false)
  }, [])
  const { shield, resume } = useScreenShield(playing, pauseVideo)

  /* Create the player AFTER the mount div exists (loading phase).
     PERMANENT mobile fix: on the FIRST player error (YouTube embed walls,
     flaky mobile networks, region quirks) the player silently re-creates
     itself once on the youtube-nocookie host before the error card shows. */
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed || !mountRef.current || playerRef.current) return
    let cancelled = false

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !mountRef.current) return

        const createPlayer = (useAltHost: boolean) => {
          const container = mountRef.current
          if (!container) return
          // YT.Player REPLACES the element it is mounted on with an iframe,
          // so always mount on a FRESH inner div — retries then stay possible.
          const inner = document.createElement('div')
          container.replaceChildren(inner)
          playerRef.current = new YT.Player(inner, {
            videoId,
            width: '100%',
            height: '100%',
            ...(useAltHost ? { host: 'https://www.youtube-nocookie.com' } : {}),
            playerVars: {
              autoplay: 1, // student clicked the play button → gesture-given
              controls: 0, // NO YouTube control bar
              disablekb: 1, // NO keyboard shortcuts (no YT seek/pause shortcuts)
              fs: 0, // NO fullscreen button
              modestbranding: 1,
              rel: 0, // no other-channel related videos
              iv_load_policy: 3, // no annotations
              cc_load_policy: 0, // no captions by default
              playsinline: 1,
              hl: 'bn',
              origin: window.location.origin,
            },
            events: {
              onReady: (e) => {
                if (cancelled) return
                setPhase('ready')
                e.target.setVolume(Math.round(volume * 100))
                e.target.playVideo()
              },
              onStateChange: (e) => {
                if (cancelled) return
                const p = e.target
                const state = e.data
                setYtState(state)
                if (state === YT_STATE.PLAYING && !everPlayedRef.current) {
                  everPlayedRef.current = true
                  setEverPlayed(true)
                }
                setPlaying(state === YT_STATE.PLAYING)
                const d = p.getDuration()
                if (d > 0) setDuration(d)
                if (state === YT_STATE.PLAYING) {
                  try {
                    setRate(String(p.getPlaybackRate?.() || 1))
                  } catch {
                    /* playback rate unavailable — keep default */
                  }
                }
                if (state === YT_STATE.ENDED) {
                  // Retreat BEFORE the true end → the "More videos" end screen
                  // can never appear.
                  const dur = p.getDuration() || 0
                  if (dur > 2) p.seekTo(dur - 1.2, true)
                  p.pauseVideo()
                  setPlaying(false)
                }
              },
              onError: (e) => {
                // 2=invalid param · 5=HTML5/codecs · 100=not found · 101/150=embed disabled
                if (!ytErrorWarnedOnce) {
                  ytErrorWarnedOnce = true
                  console.warn('[ProtectedYouTubePlayer] onError code:', e?.data)
                }
                if (cancelled) return
                if (!retryRef.current) {
                  // ONE silent retry on the privacy-host (fixes transient
                  // embed walls / network hiccups on mobile) — the error card
                  // only appears if this retry fails too.
                  retryRef.current = true
                  try {
                    e.target.destroy?.()
                  } catch {
                    /* already gone */
                  }
                  playerRef.current = null
                  setPhase('loading')
                  window.setTimeout(() => {
                    if (!cancelled) createPlayer(true)
                  }, 350)
                } else {
                  setPhase('error')
                }
              },
            },
          })
        }

        createPlayer(false)
      })
      .catch(() => {
        if (!cancelled) setPhase('error')
      })

    return () => {
      cancelled = true
    }
  }, [armed, videoId, volume])

  /* Progress polling + auto-complete (YT API has no timeupdate event) */
  useEffect(() => {
    if (phase !== 'ready') return
    const id = window.setInterval(() => {
      const p = playerRef.current
      if (!p) return
      try {
        const t = p.getCurrentTime()
        const d = p.getDuration()
        setCurrent(t)
        setBuffered(p.getVideoLoadedFraction() * d)
        if (d > 0) setDuration((prev) => (Math.abs(prev - d) > 0.5 ? d : prev))
        if (!autoSentRef.current && d > 0 && t >= 0.9 * d) {
          autoSentRef.current = true
          autoCompleteRef.current?.()
        }
        // Real available quality levels (YT API) — read once when ready.
        setQualities((prev) => {
          if (prev.length > 0) return prev
          try {
            const levels: string[] = p.getAvailableQualityLevels?.() ?? []
            const clean = levels.filter((l) => l && l !== 'unknown')
            return clean.length > 0 ? [...clean, 'auto'] : prev
          } catch {
            return prev
          }
        })
      } catch {
        /* iframe mid-navigation */
      }
    }, 400)
    return () => window.clearInterval(id)
  }, [phase])

  /* Cleanup on unmount / lesson change */
  useEffect(() => {
    return () => {
      try {
        playerRef.current?.destroy()
      } catch {
        /* already gone */
      }
      playerRef.current = null
    }
  }, [])

  const togglePlay = () => {
    const p = playerRef.current
    if (!p) return
    try {
      if (p.getPlayerState() === YT_STATE.PLAYING) {
        p.pauseVideo()
        setPlaying(false)
      } else {
        p.playVideo()
        setPlaying(true)
        resume()
      }
    } catch {
      /* not ready yet */
    }
  }

  const seekTo = (val: number) => {
    const p = playerRef.current
    if (!p) return
    try {
      p.seekTo(val, true)
      setCurrent(val)
    } catch {
      /* not ready */
    }
  }

  const applyVolume = (v: number, m: boolean) => {
    const p = playerRef.current
    setVolume(v)
    setMuted(m)
    try {
      if (p) {
        if (m || v === 0) p.mute()
        else {
          p.unMute()
          p.setVolume(Math.round(v * 100))
        }
      }
    } catch {
      /* not ready */
    }
  }

  const applyRate = (r: string) => {
    setRate(r)
    try {
      playerRef.current?.setPlaybackRate(Number(r))
    } catch {
      /* not ready */
    }
  }

  /** Apply a REAL quality level reported by the YT API. */
  const applyQuality = (q: string) => {
    setActiveQuality(q)
    try {
      const p = playerRef.current as unknown as { setPlaybackQuality?: (q: string) => void } | null
      if (q !== 'auto') p?.setPlaybackQuality?.(q)
    } catch {
      /* not ready — YT will auto-adapt anyway */
    }
  }

  const disposePlayer = () => {
    try {
      playerRef.current?.destroy()
    } catch {
      /* already gone */
    }
    playerRef.current = null
  }

  const startPlayback = () => {
    disposePlayer() // clean slate (covers error-retry path)
    setArmed(false)
    // arm on the NEXT tick so the effect re-runs even after a retry
    window.setTimeout(() => {
      setArmed(true)
      setPhase('loading')
    }, 0)
  }

  const retryToPoster = () => {
    disposePlayer()
    setArmed(false)
    setPhase('poster')
    setCurrent(0)
    setDuration(0)
    setBuffered(0)
    setPlaying(false)
    setYtState(-1)
    everPlayedRef.current = false
    setEverPlayed(false)
    autoSentRef.current = false
  }

  /** The raw iframe is only revealed during true playback — every other
      state (cued, paused, ended, first-buffering) is opaquely covered. */
  const chromeVisible =
    ytState === YT_STATE.PLAYING || (ytState === YT_STATE.BUFFERING && everPlayed)

  return (
    <div
      ref={stageRef}
      className={cn('relative aspect-video w-full overflow-hidden bg-black', className)}
      onContextMenu={(e) => e.preventDefault()}
      onPointerMove={poke}
      onPointerDown={poke}
      onTouchStart={poke}
    >
      {/* ── OVERSCAN STAGE: iframe 160% tall, centered → every painted
          chrome zone (title bar, channel avatar, share, wordmark logo,
          timeline, speed pill) is geometrically CLIPPED out of view. ── */}
      {(phase === 'loading' || phase === 'ready') && (
        <div className="absolute inset-0 overflow-hidden" aria-hidden>
          <div className="absolute left-0 w-full" style={{ top: OVERSCAN.top, height: OVERSCAN.height }}>
            <div ref={mountRef} className="h-full w-full" />
          </div>
        </div>
      )}

      {/* ── POSTER: colorful double play button, nothing loads until clicked
          (no provider thumbnail → zero source fingerprint) ── */}
      {phase === 'poster' && <ColorPoster onPlay={startPlayback} />}

      {/* ── LOADING ── */}
      {phase === 'loading' && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black text-white/80">
          <span
            className="h-9 w-9 animate-spin rounded-full border-2 border-white/25 border-t-fuchsia-400"
            role="status"
            aria-label={tx('লোড হচ্ছে', 'Loading')}
          />
          <p className="text-xs">{tx('ভিডিও লোড হচ্ছে…', 'Loading video…')}</p>
        </div>
      )}

      {/* ── READY: click-catcher + covers + our control bar ── */}
      {phase === 'ready' && (
        <>
          {/* click-catcher — the raw iframe is never directly clickable,
              so no hover/mousemove or stray click can trigger provider UI */}
          <button
            type="button"
            className="absolute inset-0 z-10 cursor-pointer"
            onClick={togglePlay}
            aria-label={playing ? tx('বিরতি দিন', 'Pause') : tx('চালান', 'Play')}
            tabIndex={-1}
          />

          {/* OPAQUE COVER while cued / paused / ended / first-buffering —
              YouTube's center play button and any residual paint are hidden */}
          {!chromeVisible && <PauseCover />}

          {/* our colorful control bar — the ONLY chrome on screen */}
          <PlayerControlBar
            playing={playing}
            current={current}
            duration={duration}
            buffered={buffered}
            volume={volume}
            muted={muted}
            rate={rate}
            onToggle={togglePlay}
            onSeek={seekTo}
            onVolume={applyVolume}
            onRate={applyRate}
            onFullscreen={toggleFullscreen}
            isFs={isFs}
            qualities={qualities}
            activeQuality={activeQuality}
            onQuality={applyQuality}
            visible={controlsVisible}
          />
        </>
      )}

      {/* ── ERROR: never a silent black box. YouTube embeds can be blocked
              (101/150) or fail on restrictive networks — instead of a dead
              end we show the video's own thumbnail + a one-click "Watch on
              YouTube" escape hatch, so the preview ALWAYS shows something. ── */}
      {phase === 'error' && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-2.5 bg-black/92 px-6 text-center text-white">
          {videoId && (
            <a
              href={`https://www.youtube.com/watch?v=${videoId}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={tx('ইউটিউবে ভিডিওটি দেখুন', 'Watch the video on YouTube')}
              className="group relative w-full max-w-sm overflow-hidden rounded-xl border-2 border-white/25 shadow-lg transition hover:border-fuchsia-400/70"
              style={{ aspectRatio: '16 / 9' }}
            >
              <span
                aria-hidden
                className="absolute inset-0 scale-110 bg-cover bg-center transition group-hover:scale-115"
                style={{ backgroundImage: `url(https://i.ytimg.com/vi/${videoId}/hqdefault.jpg)` }}
              />
              <span className="absolute inset-0 flex items-center justify-center bg-black/35 transition group-hover:bg-black/20">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 shadow-xl">
                  <Play className="ml-0.5 h-6 w-6 fill-white text-white" aria-hidden />
                </span>
              </span>
            </a>
          )}
          <p className="text-sm font-bold sm:text-base">{tx('ভিডিওটি এখানে চালানো যাচ্ছে না', 'This video cannot be played here')}</p>
          {videoId && (
            <Button
              size="sm"
              className="gap-1.5 bg-red-600 bg-none text-white hover:bg-red-500"
              onClick={() => window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank', 'noopener')}
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
              {tx('ইউটিউবে দেখুন', 'Watch on YouTube')}
            </Button>
          )}
          <p className="max-w-md text-xs leading-relaxed text-white/75">
            {tx(
              'নেটওয়ার্ক বা এমবেড সেটিংসের কারণে ভিডিওটি লোড হয়নি। উপরের কার্ডে ক্লিক করে ইউটিউবে দেখুন, অথবা আবার চেষ্টা করুন।',
              'The video failed to load due to network or embed restrictions. Tap the card above to watch it on YouTube, or try again.'
            )}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-1 gap-1.5 border-white/30 bg-white/10 text-white hover:bg-white/20"
            onClick={retryToPoster}
          >
            {tx('আবার চেষ্টা করুন', 'Try again')}
          </Button>
        </div>
      )}

      {/* ── SHIELD: screen-record / focus-loss protection ── */}
      {shield && <ShieldOverlay reason={shield} onResume={resume} />}
    </div>
  )
}

/* ════════════════════════ Protected Vimeo player ════════════════════════ */

/**
 * Vimeo through the SAME architecture as YouTube: colorful poster → click to
 * load (api=1 embed, all branding params stripped) → OVERSCAN stage (Vimeo's
 * control bar / logo / title live in the clipped strips) → opaque cover when
 * paused → custom colorful controls over Vimeo's documented postMessage API.
 */
interface VimeoMsg {
  method: string
  value?: unknown
  player_id?: string
}

export function ProtectedVimeoPlayer({
  videoId, title, onAutoComplete, className,
}: {
  videoId: string
  title: string
  onAutoComplete?: () => void
  className?: string
}) {
  const { tx } = useUI()
  const [phase, setPhase] = useState<'poster' | 'ready'>('poster')
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [rate, setRate] = useState('1')
  const [ready, setReady] = useState(false)
  // Auto-hide controls + REAL quality levels via Vimeo's postMessage API
  const { controlsVisible, poke } = useAutoHideControls(playing)
  const [qualities, setQualities] = useState<string[]>([])
  const [activeQuality, setActiveQuality] = useState('auto')

  const stageRef = useRef<HTMLDivElement | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const pid = useMemo(() => `psv-${Math.random().toString(36).slice(2, 9)}`, [])
  const autoSentRef = useRef(false)
  const autoCompleteRef = useRef(onAutoComplete)
  useEffect(() => {
    autoCompleteRef.current = onAutoComplete
  }, [onAutoComplete])
  const { isFs, toggleFullscreen } = useFullscreen(stageRef)

  const src = useMemo(() => {
    const params = new URLSearchParams({
      api: '1',
      player_id: pid,
      autoplay: '1',
      title: '0',
      byline: '0',
      portrait: '0',
      badge: '0',
      dnt: '1',
      autopause: '0',
      playsinline: '1',
    })
    return `https://player.vimeo.com/video/${videoId}?${params}`
  }, [videoId, pid])

  const post = useCallback(
    (method: string, value?: unknown) => {
      const win = iframeRef.current?.contentWindow
      if (!win) return
      try {
        win.postMessage(JSON.stringify({ method, value, player_id: pid }), '*')
      } catch {
        /* iframe not ready */
      }
    },
    [pid]
  )

  const pauseNow = useCallback(() => post('pause'), [post])
  const { shield, resume } = useScreenShield(playing, pauseNow)

  /* postMessage event wiring */
  useEffect(() => {
    if (phase !== 'ready') return
    const onMessage = (e: MessageEvent) => {
      if (typeof e.origin === 'string' && !e.origin.includes('vimeo.com')) return
      let msg: VimeoMsg | null = null
      try {
        const obj = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
        if (obj && typeof obj === 'object' && 'method' in obj) msg = obj as VimeoMsg
      } catch {
        return
      }
      if (!msg) return
      if (msg.player_id && msg.player_id !== pid) return

      switch (msg.method) {
        case 'ready':
          setReady(true)
          for (const ev of ['timeupdate', 'play', 'pause', 'ended', 'progress']) {
            post('addEventListener', ev)
          }
          // Ask for the REAL available qualities (Vimeo API).
          post('getQualities')
          break
        case 'qualityChange': {
          const q = typeof msg.value === 'string' ? msg.value : undefined
          if (q) setActiveQuality(q)
          break
        }
        case 'getQualities': {
          const v = msg.value as { qualities?: { id: string }[] } | undefined
          const ids = (v?.qualities ?? []).map((q) => q.id).filter(Boolean)
          if (ids.length > 0) setQualities(ids.includes('auto') ? ids : ['auto', ...ids])
          break
        }
        case 'timeupdate': {
          const v = msg.value as { seconds?: number; duration?: number } | undefined
          if (v && typeof v.seconds === 'number') setCurrent(v.seconds)
          if (v && typeof v.duration === 'number' && v.duration > 0) setDuration(v.duration)
          if (v?.seconds !== undefined && v.duration && !autoSentRef.current && v.seconds >= 0.9 * v.duration) {
            autoSentRef.current = true
            autoCompleteRef.current?.()
          }
          break
        }
        case 'progress': {
          const v = msg.value as { percent?: number } | undefined
          if (v && typeof v.percent === 'number' && duration > 0) setBuffered(v.percent * duration)
          break
        }
        case 'play':
          setPlaying(true)
          resume()
          break
        case 'pause':
          setPlaying(false)
          break
        case 'ended':
          setPlaying(false)
          break
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [phase, pid, post, duration, resume])

  const togglePlay = () => {
    if (!ready) return
    if (playing) post('pause')
    else post('play')
  }
  /** Apply a REAL Vimeo quality (postMessage setQuality). */
  const applyQuality = (q: string) => {
    setActiveQuality(q)
    if (!ready) return
    post('setQuality', q)
  }
  const seekTo = (t: number) => {
    setCurrent(t)
    post('seekTo', t)
  }
  const applyVolume = (v: number, m: boolean) => {
    setVolume(v)
    setMuted(m)
    post('setVolume', m || v === 0 ? 0 : v)
  }
  const applyRate = (r: string) => {
    setRate(r)
    post('setPlaybackRate', Number(r))
  }

  return (
    <div
      ref={stageRef}
      className={cn('relative aspect-video w-full overflow-hidden bg-black', className)}
      onContextMenu={(e) => e.preventDefault()}
      onPointerMove={poke}
      onPointerDown={poke}
      onTouchStart={poke}
    >
      {phase === 'poster' && <ColorPoster onPlay={() => setPhase('ready')} />}

      {phase === 'ready' && (
        <>
          {/* OVERSCAN stage — Vimeo's control bar/logo/title are clipped out */}
          <div className="absolute inset-0 overflow-hidden" aria-hidden>
            <iframe
              ref={iframeRef}
              src={src}
              title={title}
              allow="autoplay; encrypted-media; fullscreen"
              className="absolute left-0 w-full border-0"
              style={{ top: OVERSCAN.top, height: OVERSCAN.height }}
            />
          </div>

          <button
            type="button"
            className="absolute inset-0 z-10 cursor-pointer"
            onClick={togglePlay}
            aria-label={playing ? tx('বিরতি দিন', 'Pause') : tx('চালান', 'Play')}
            tabIndex={-1}
          />

          {!playing && <PauseCover />}

          <PlayerControlBar
            playing={playing}
            current={current}
            duration={duration}
            buffered={buffered}
            volume={volume}
            muted={muted}
            rate={rate}
            onToggle={togglePlay}
            onSeek={seekTo}
            onVolume={applyVolume}
            onRate={applyRate}
            onFullscreen={toggleFullscreen}
            isFs={isFs}
            qualities={qualities}
            activeQuality={activeQuality}
            onQuality={applyQuality}
            visible={controlsVisible}
          />
        </>
      )}

      {shield && <ShieldOverlay reason={shield} onResume={resume} />}
    </div>
  )
}

/* ═══════════════ Protected generic iframe (Drive / CDN embeds) ══════════ */

/**
 * Drive / generic-CDN embeds: colorful poster → click to load → OVERSCAN
 * stage (Drive's filename bar + any bottom bar are clipped out). These
 * providers expose no control API, so the iframe stays interactive (click
 * the picture to play/pause) and we add our own fullscreen button.
 */
export function ProtectedIframePlayer({
  src, provider, title,
}: {
  src: string
  provider: 'DRIVE' | 'EMBED'
  title: string
}) {
  const { tx } = useUI()
  const [loaded, setLoaded] = useState(false)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const { isFs, toggleFullscreen } = useFullscreen(stageRef)

  return (
    <div
      ref={stageRef}
      className="relative aspect-video w-full overflow-hidden bg-black"
      onContextMenu={(e) => e.preventDefault()}
    >
      {!loaded && <ColorPoster onPlay={() => setLoaded(true)} />}

      {loaded && (
        <>
          {/* OVERSCAN stage — provider-painted top/bottom bars are clipped.
              Generic CDN players keep their own (unknown-position) controls,
              so only DRIVE gets the overscan treatment. */}
          {provider === 'DRIVE' ? (
            <div className="absolute inset-0 overflow-hidden" aria-hidden>
              <iframe
                src={src}
                title={title}
                allow="autoplay; encrypted-media"
                className="absolute left-0 w-full border-0"
                style={{ top: '-16%', height: '132%' }}
              />
            </div>
          ) : (
            <iframe
              src={src}
              title={title}
              allow="autoplay; encrypted-media; fullscreen"
              className="absolute inset-0 h-full w-full border-0"
            />
          )}

          {provider === 'DRIVE' && (
            <button
              type="button"
              onClick={toggleFullscreen}
              className="absolute bottom-2 right-2 z-30 rounded-full bg-black/60 p-2 text-white backdrop-blur transition-colors hover:bg-black/80"
              aria-label="Fullscreen"
            >
              {isFs ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </button>
          )}
        </>
      )}

      {/* keep a hint that content is protected (ours, not the provider's) */}
      {loaded && (
        <span className="sr-only">{tx('সুরক্ষিত কনটেন্ট', 'Protected content')}</span>
      )}
    </div>
  )
}

/* ════════════════════════ Protected direct-file (MP4) ═══════════════════ */

export function ProtectedMp4Player({
  src, onAutoComplete,
}: {
  src: string
  onAutoComplete?: () => void
}) {
  const { tx } = useUI()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const autoSentRef = useRef(false)
  const [phase, setPhase] = useState<'poster' | 'ready' | 'failed'>('poster')
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [rate, setRate] = useState('1')
  // Auto-hide controls; quality: a single MP4 file has ONE real rendition →
  // we honestly report just "Auto" (never fake 1080p options).
  const { controlsVisible, poke } = useAutoHideControls(playing)
  const qualities = useMemo(() => ['auto'], [])
  const activeQuality = 'auto'
  const { isFs, toggleFullscreen } = useFullscreen(stageRef)

  // NOTE: parent renders <ProtectedMp4Player key={lessonId}> → fresh state
  // per lesson, so no reset-effect is needed here.

  const pauseNow = useCallback(() => {
    videoRef.current?.pause()
  }, [])
  const { shield, resume } = useScreenShield(playing, pauseNow)

  // playback rate
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = Number(rate)
  }, [rate])

  // volume
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.volume = volume
    v.muted = muted
  }, [volume, muted])

  // warn on unload while playing
  useEffect(() => {
    if (!playing) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [playing])

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      void v.play().catch(() => {})
      resume()
    } else {
      v.pause()
    }
  }

  const handleTimeUpdate = () => {
    const v = videoRef.current
    if (!v) return
    setCurrent(v.currentTime)
    try {
      if (v.buffered.length > 0) setBuffered(v.buffered.end(v.buffered.length - 1))
    } catch {
      /* buffered unavailable */
    }
    if (!autoSentRef.current && v.duration > 0 && v.currentTime >= 0.9 * v.duration) {
      autoSentRef.current = true
      onAutoComplete?.()
    }
  }

  const applyVolume = (v: number, m: boolean) => {
    setVolume(v)
    setMuted(m)
  }

  if (phase === 'poster') {
    return (
      <div
        ref={stageRef}
        className="relative aspect-video w-full overflow-hidden bg-black"
        onContextMenu={(e) => e.preventDefault()}
      >
        <ColorPoster onPlay={() => setPhase('ready')} />
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col">
      {/* Stage: video + colorful overlay controls (no native menus at all) */}
      <div
        ref={stageRef}
        className="relative aspect-video w-full overflow-hidden bg-black"
        onContextMenu={(e) => e.preventDefault()}
        onPointerMove={poke}
        onPointerDown={poke}
        onTouchStart={poke}
      >
        <video
          ref={videoRef}
          src={src}
          playsInline
          preload="metadata"
          autoPlay
          disablePictureInPicture
          controlsList="nodownload noplaybackrate noremoteplayback"
          className="h-full w-full"
          style={phase === 'failed' ? { visibility: 'hidden' } : undefined}
          onContextMenu={(e) => e.preventDefault()}
          onMouseDown={(e) => {
            if (e.button === 2) e.preventDefault()
          }}
          onClick={togglePlay}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
          onError={() => setPhase('failed')}
        />

        {/* Clear playback-failure state — never a silent black box */}
        {phase === 'failed' && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-2.5 bg-black/92 px-6 text-center text-white">
            <AlertTriangle className="h-9 w-9 text-amber-400" aria-hidden />
            <p className="text-base font-bold">{tx('ভিডিওটি চালানো যাচ্ছে না', 'This video cannot be played')}</p>
            <p className="max-w-md text-xs leading-relaxed text-white/75">
              {tx(
                'ভিডিও ফাইলটি করাপ্ট হতে পারে অথবা এই ফরম্যাট ব্রাউজারে প্লে হয় না। MP4 (H.264) ফরম্যাটের ভিডিও সব ডিভাইসে প্লে হয়। অনুগ্রহ করে অ্যাডমিনকে জানান।',
                'The video file may be corrupted, or this format is not supported by your browser. MP4 (H.264) videos play everywhere. Please contact the admin.'
              )}
            </p>
            <div className="mt-1 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-white/30 bg-white/10 text-white hover:bg-white/20"
                onClick={() => {
                  const v = videoRef.current
                  if (v) {
                    v.load()
                    void v.play().catch(() => {})
                  }
                  setPhase('ready')
                }}
              >
                {tx('আবার চেষ্টা করুন', 'Try again')}
              </Button>
            </div>
          </div>
        )}

        {/* colorful control bar */}
        <PlayerControlBar
          playing={playing}
          current={current}
          duration={duration}
          buffered={buffered}
          volume={volume}
          muted={muted}
          rate={rate}
          onToggle={togglePlay}
          onSeek={(t) => {
            const v = videoRef.current
            if (v) v.currentTime = t
            setCurrent(t)
          }}
          onVolume={applyVolume}
          onRate={setRate}
          qualities={qualities}
          activeQuality={activeQuality}
          onQuality={() => {}}
          visible={controlsVisible}
          onFullscreen={toggleFullscreen}
          isFs={isFs}
        />

        {/* screen-record shield overlay */}
        {shield && <ShieldOverlay reason={shield} onResume={resume} />}
      </div>

      <p className="mt-2 text-center text-[10px] text-muted-foreground/70">
        {tx('এই কনটেন্ট কপিরাইট সুরক্ষিত — পাঠশালা', 'This content is copyright-protected — PathShala')}
      </p>
    </div>
  )
}

/* ── Watermark overlay (drifting identity grid) — documents only ──────── */
/* Kept for PDF/TEXT lesson stages (NOT videos — videos carry no watermark). */

export function WatermarkOverlay({ text, tag }: { text: string; tag: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden>
      <div className="watermark-drift absolute -inset-[25%] flex rotate-[-24deg] flex-col justify-around">
        {Array.from({ length: 6 }).map((_, r) => (
          <div key={r} className="flex justify-around gap-10 whitespace-nowrap">
            {Array.from({ length: 4 }).map((_, c) => (
              <span key={c} className="text-[11px] font-medium tracking-wide text-white/10">
                {text}
              </span>
            ))}
          </div>
        ))}
      </div>
      <span className="absolute bottom-2 right-3 text-[10px] font-medium text-white/20">{tag}</span>
    </div>
  )
}
