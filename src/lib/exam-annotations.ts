/**
 * exam-annotations — shared types/helpers for the admin answer-sheet
 * annotation layer. Strokes are stored as JSON per ExamAnswerImage; the
 * ORIGINAL image file is never modified (overlay-only, non-destructive).
 * Coordinates are normalized (0..1 relative to the image box) so the layer
 * scales with any zoom/rotation/resolution losslessly.
 */

export type StrokeTool =
  | 'pen' // thin marking pen
  | 'marker' // thick translucent highlighter
  | 'tick' // ✓
  | 'cross' // ✗
  | 'circle' // dragged ellipse
  | 'underline' // dragged straight line
  | 'arrow' // dragged arrow
  | 'text' // short note
  | 'eraser' // not a stroke itself — active tool that removes strokes

export interface Stroke {
  id: string
  tool: StrokeTool
  color: string
  /** stroke width as a fraction of the image min-dimension (0.001..0.05) */
  width: number
  opacity: number
  /** normalized points; 1 point for tick/cross/text, 2 for shapes, N for pens */
  points: { x: number; y: number }[]
  text?: string
}

export const STROKE_COLORS = ['#e11d48', '#059669', '#d97706', '#111827'] as const

export const DEFAULT_WIDTHS: Record<string, number> = {
  pen: 0.006,
  marker: 0.028,
  underline: 0.008,
  arrow: 0.006,
  circle: 0.006,
  tick: 0.014,
  cross: 0.014,
  text: 0.028,
}

export function newStrokeId(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function defaultColorFor(tool: StrokeTool): string {
  if (tool === 'tick') return '#059669'
  if (tool === 'cross') return '#e11d48'
  if (tool === 'marker') return '#d97706'
  return '#e11d48'
}

/** Serialize strokes for the DB column (validates size). */
export function serializeStrokes(strokes: Stroke[]): string {
  return JSON.stringify(strokes.slice(0, 400))
}

/** Parse the DB column defensively (never trust stored JSON shape). */
export function parseStrokes(json: unknown): Stroke[] {
  try {
    const arr = typeof json === 'string' ? JSON.parse(json) : json
    if (!Array.isArray(arr)) return []
    return arr.filter(
      (s): s is Stroke =>
        s &&
        typeof s === 'object' &&
        typeof (s as Stroke).tool === 'string' &&
        Array.isArray((s as Stroke).points)
    )
  } catch {
    return []
  }
}
