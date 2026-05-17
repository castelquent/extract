// Resolve display labels for default templates and their fields. Falls back
// to the on-disk name when no `key` is present (user-created templates,
// legacy data), so existing articles keep displaying their original names.
import i18n from './i18n'
import type { Template, TemplateField } from '@shared/types'

export function templateDisplayName(tpl: Pick<Template, 'id' | 'name' | 'isDefault'>): string {
  if (tpl.isDefault) {
    const key = `templateFields:templateNames.${tpl.id}`
    const translated = i18n.t(key) as string
    if (translated && translated !== key) return translated
  }
  return tpl.name
}

export function templateDisplayDescription(
  tpl: Pick<Template, 'id' | 'description' | 'isDefault'>
): string | undefined {
  if (tpl.isDefault) {
    const key = `templateFields:templateDescriptions.${tpl.id}`
    const translated = i18n.t(key) as string
    if (translated && translated !== key) return translated
  }
  return tpl.description
}

export function fieldDisplayName(field: TemplateField): string {
  if (field.key) {
    const key = `templateFields:fields.${field.key}`
    const translated = i18n.t(key) as string
    if (translated && translated !== key) return translated
  }
  return field.name
}

export function fieldDisplayHint(field: TemplateField): string | undefined {
  if (field.key) {
    const key = `templateFields:fieldHints.${field.key}`
    const translated = i18n.t(key) as string
    if (translated && translated !== key) return translated
  }
  return field.aiHint
}
