/**
 * PdfFileIcon — THE official red "PDF file" icon, used EVERYWHERE a PDF is
 * shown or uploaded (suggestions, courses, exams, notices, student panel,
 * admin panel). Renders the site's PDF icon asset (public/pdf-icon.png) so
 * the mark is pixel-identical on every surface — previously some spots fell
 * back to the generic text-document glyph.
 */
export function PdfFileIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <img
      src="/pdf-icon.png"
      alt=""
      aria-hidden="true"
      draggable={false}
      loading="eager"
      className={`inline-block shrink-0 select-none object-contain ${className}`}
    />
  )
}
