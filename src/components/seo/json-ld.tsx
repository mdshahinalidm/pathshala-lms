/**
 * JsonLd — renders a schema.org structured-data script tag.
 * Pure component: safe to use from server components (metadata pages)
 * and client components alike. The payload is serialized JSON.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}
