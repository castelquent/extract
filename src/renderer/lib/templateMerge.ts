// Shared logic for applying a model to an existing article — preserves field
// values by name, coerces between richtext / text when types change, reports
// which values would be lost.
import type { TemplateField } from '@shared/types'
import { asString, stripHtml } from '@shared/fieldValue'

// Re-exported so existing imports from '@/lib/templateMerge' keep working.
export { asString, stripHtml }

// Wrap plain text in <p> for graceful text → richtext conversion.
export const wrapAsHtml = (text: unknown): string => {
  const str = asString(text)
  if (!str) return ''
  return `<p>${str}</p>`
}

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
    if (oldField.type === 'richtext' && (field.type === 'text' || field.type === 'textarea')) {
      mergedFields[field.name] = stripHtml(existingValue)
    } else if (
      (oldField.type === 'text' || oldField.type === 'textarea') &&
      field.type === 'richtext'
    ) {
      mergedFields[field.name] = wrapAsHtml(existingValue)
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
