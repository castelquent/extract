// Shared logic for applying a model to an existing article — preserves field
// values by name, coerces between markdown / text when types change, reports
// which values would be lost.
import type { TemplateField } from '@shared/types'
import { asString, stripMarkdown } from '@shared/fieldValue'

// Re-exported so existing imports from '@/lib/templateMerge' keep working.
// `stripHtml` is kept as an alias on the shared helper for the same reason.
export { asString, stripMarkdown }
export { stripHtml } from '@shared/fieldValue'

// Promote plain text to a markdown paragraph during text → markdown coercion.
// No wrapping is needed (markdown treats plain text as a paragraph), so this
// is effectively identity; kept as a named helper for symmetry with the old
// wrapAsHtml API and to keep call sites readable.
export const wrapAsMarkdown = (text: unknown): string => asString(text)
// Back-compat alias.
export const wrapAsHtml = wrapAsMarkdown

// Schema equality by field-by-field comparison (name + type + order). Used
// to identify which Template (if any) currently matches an article's snapshot.
export const sameSchema = (a: TemplateField[], b: TemplateField[]): boolean => {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const af = a[i], bf = b[i]
    if (af.name !== bf.name || af.type !== bf.type || af.order !== bf.order) return false
  }
  return true
}

export interface MergeResult {
  mergedFields: Record<string, string>
  lostFields: { name: string; value: string }[]
}

// Compute the merge of oldFields onto newSchema. Values are preserved by
// field name, with graceful type coercion when the field type differs.
// `lostFields` lists fields with non-empty values that aren't present in
// newSchema (they'll be dropped).
export const computeMerge = (
  oldSchema: TemplateField[],
  newSchema: TemplateField[],
  oldFields: Record<string, string>
): MergeResult => {
  const newNames = new Set(newSchema.map((f) => f.name))
  const oldByName = new Map(oldSchema.map((f) => [f.name, f]))
  const mergedFields: Record<string, string> = {}

  for (const field of newSchema) {
    const existingValue = asString(oldFields[field.name])
    if (!existingValue) {
      mergedFields[field.name] = ''
      continue
    }
    const oldField = oldByName.get(field.name)
    if (!oldField || oldField.type === field.type) {
      mergedFields[field.name] = existingValue
      continue
    }
    // Type changed: coerce.
    if (oldField.type === 'markdown' && (field.type === 'text' || field.type === 'textarea')) {
      mergedFields[field.name] = stripMarkdown(existingValue)
    } else if (
      (oldField.type === 'text' || oldField.type === 'textarea') &&
      field.type === 'markdown'
    ) {
      mergedFields[field.name] = wrapAsMarkdown(existingValue)
    } else {
      mergedFields[field.name] = existingValue
    }
  }

  const lostFields: { name: string; value: string }[] = []
  for (const [name, raw] of Object.entries(oldFields)) {
    const value = asString(raw)
    if (!value) continue
    if (!newNames.has(name)) lostFields.push({ name, value })
  }

  return { mergedFields, lostFields }
}
