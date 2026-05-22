// Helpers shared by main and renderer for working with article field values.
// `markdown` fields store plain markdown text. The helper isFieldFilled
// trims whitespace and considers a value with only blank lines as empty.
import type { TemplateField } from './types'

// Coerce any field value to a string. Field values are typed as string but
// can arrive non-string at runtime (legacy data, transient drafts).
export const asString = (v: unknown): string => {
  if (v == null) return ''
  return typeof v === 'string' ? v : String(v)
}

// Strip basic markdown syntax for plain-text comparisons (search snippets,
// "is anything visible" checks). Not a full markdown parser — just enough
// to ignore heading hashes, list markers, emphasis, links, images.
export const stripMarkdown = (md: unknown): string => {
  const str = asString(md)
  if (!str) return ''
  return str
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links → label
    .replace(/`{1,3}[^`]*`{1,3}/g, '') // inline / fenced code
    .replace(/^>+\s?/gm, '') // blockquotes
    .replace(/^#{1,6}\s+/gm, '') // ATX headings
    .replace(/^[-*+]\s+/gm, '') // unordered list markers
    .replace(/^\d+\.\s+/gm, '') // ordered list markers
    .replace(/[*_~]+/g, '') // emphasis
    .replace(/^-{3,}\s*$/gm, '') // hr
    .replace(/\s+/g, ' ')
    .trim()
}

// Back-compat alias for callers that still import stripHtml. Behaves
// identically to stripMarkdown now — there is no HTML stored anywhere.
export const stripHtml = stripMarkdown

// True when `value` carries visible content for `field`. For markdown
// fields we strip markdown syntax first so a value of just "# " or "**"
// reads as empty.
export const isFieldFilled = (
  field: Pick<TemplateField, 'type'>,
  value: unknown
): boolean => {
  const s = asString(value)
  if (!s) return false
  if (field.type === 'markdown') return stripMarkdown(s).length > 0
  return s.trim().length > 0
}
