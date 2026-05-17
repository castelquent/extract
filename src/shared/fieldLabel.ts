// Resolve the display name + hint of a snapshotted article field. For
// fields originating from a built-in default template, the snapshot's name
// is frozen in whatever language was active at article creation. The live
// template gets re-localised every load (see main/ipc/templates.ts), so we
// substitute the snapshot's name with the live template field's name when
// they share the same stable `id`. Custom-template fields (no `id`) are
// returned untouched.
import type { Template, TemplateField } from './types'

export function resolveFieldLabel(
  field: TemplateField,
  templates: Template[],
  templateId: string | undefined
): { name: string; aiHint: string | undefined } {
  if (!field.id || !templateId) {
    return { name: field.name, aiHint: field.aiHint }
  }
  const tpl = templates.find((t) => t.id === templateId)
  if (!tpl) {
    return { name: field.name, aiHint: field.aiHint }
  }
  const live = tpl.fields.find((f) => f.id === field.id)
  if (!live) {
    return { name: field.name, aiHint: field.aiHint }
  }
  return { name: live.name, aiHint: live.aiHint }
}
