// Helpers shared by main and renderer for working with article field values.
// `richtext` fields store HTML produced by Quill, which inserts placeholder
// markup like `<p><br></p>` even when the field is visually empty — so a
// naive truthy check would report them as filled. Use `isFieldFilled` for
// any completion / counting logic.
import type { TemplateField } from './types'

// Coerce any field value to a string. Field values are typed as string but
// can arrive non-string at runtime (legacy data, transient drafts).
export const asString = (v: unknown): string => {
  if (v == null) return ''
  return typeof v === 'string' ? v : String(v)
}

// Strip HTML for "is there visible text in this richtext value" checks and
// graceful richtext → text conversion.
export const stripHtml = (html: unknown): string => {
  const str = asString(html)
  if (!str) return ''
  return str
    .replace(/<\/(p|div|li|h[1-6]|br)>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

// True when `value` carries visible content for `field`. For `richtext`
// fields we strip HTML first so Quill's empty placeholder (`<p><br></p>`)
// reads as empty.
export const isFieldFilled = (
  field: Pick<TemplateField, 'type'>,
  value: unknown
): boolean => {
  const s = asString(value)
  if (!s) return false
  if (field.type === 'richtext') return stripHtml(s).length > 0
  return s.trim().length > 0
}
