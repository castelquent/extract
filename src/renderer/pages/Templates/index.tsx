import { useState, useEffect } from 'react'
import type { Template, TemplateField, FieldType } from '@shared/types'
import { useTemplatesStore } from '@/stores'
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Input,
  Label,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
  Badge,
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui'
import { Plus, FileStack, Pencil, Trash2, GripVertical, X, ChevronDown, RotateCcw, Copy } from 'lucide-react'

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Texte court',
  textarea: 'Texte long',
  richtext: 'Texte riche',
}

// Generate prompt from template (same logic as backend)
function buildPromptFromTemplate(template: Partial<Template>): string {
  const fields = template.fields || []
  const fieldsList = fields
    .sort((a, b) => a.order - b.order)
    .filter(f => f.name.trim())
    .map(f => {
      let line = `- ${f.name}`
      if (f.aiHint) line += ` (${f.aiHint})`
      return line
    })
    .join('\n')

  const context = template.aiContext || 'Tu es un assistant spécialisé dans l\'extraction de texte à partir de documents PDF.'

  return `${context}

Analyse le document et retourne un JSON avec les champs suivants:
${fieldsList}

RÈGLES STRICTES:
- Ne reformule rien, transcris le texte tel quel.
- ENCODAGE: Assure-toi que les caractères accentués français (é, à, è, ê, ù, etc.) sont correctement transcrits en UTF-8.
- GUILLEMETS: Si le texte contient des guillemets, tu DOIS les échapper (\\") pour ne pas casser le JSON.
- Pour les champs de contenu, utilise du HTML (<p>, <strong>, <em>) pour la mise en forme.
- Réponds uniquement avec le JSON, sans explication ni markdown.`
}

function createEmptyField(order: number): TemplateField {
  return {
    name: '',
    type: 'text',
    order,
  }
}

function createEmptyTemplate(): Template {
  return {
    id: `template_${Date.now()}`,
    name: '',
    description: '',
    aiContext: '',
    fields: [
      { name: 'Contenu', type: 'richtext', order: 1 },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

interface FieldEditorProps {
  field: TemplateField
  onChange: (field: TemplateField) => void
  onRemove: () => void
  canRemove: boolean
  disabled?: boolean
}

function FieldEditor({ field, onChange, onRemove, canRemove, disabled }: FieldEditorProps) {
  return (
    <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg" onKeyDown={(e) => e.stopPropagation()}>
      {!disabled && <GripVertical className="h-5 w-5 text-muted-foreground mt-2 cursor-grab" />}

      <div className="flex-1 grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Nom du champ</Label>
          <Input
            value={field.name}
            onChange={(e) => onChange({ ...field, name: e.target.value })}
            placeholder="Ex: Titre, Auteur..."
            disabled={disabled}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <Select
            value={field.type}
            onValueChange={(value: FieldType) => onChange({ ...field, type: value })}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(FIELD_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1 col-span-2">
          <Label className="text-xs">Indice pour l'IA (optionnel)</Label>
          <Input
            value={field.aiHint || ''}
            onChange={(e) => onChange({ ...field, aiHint: e.target.value })}
            placeholder="Ex: L'auteur de l'article, si visible"
            disabled={disabled}
          />
        </div>

      </div>

      {!disabled && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          disabled={!canRemove}
          className="text-muted-foreground hover:text-destructive"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}

interface TemplateEditorModalProps {
  template: Template | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (template: Template) => void
}

function TemplateEditorModal({ template, open, onOpenChange, onSave }: TemplateEditorModalProps) {
  const [editedTemplate, setEditedTemplate] = useState<Template>(createEmptyTemplate())
  const [customPrompt, setCustomPrompt] = useState<string | null>(null)
  const [promptOpen, setPromptOpen] = useState(false)

  const isDefault = template?.isDefault ?? false

  useEffect(() => {
    if (template) {
      setEditedTemplate({ ...template })
    } else {
      setEditedTemplate(createEmptyTemplate())
    }
    setCustomPrompt(null)
    setPromptOpen(false)
  }, [template, open])

  const generatedPrompt = buildPromptFromTemplate(editedTemplate)
  const currentPrompt = customPrompt ?? generatedPrompt

  const handleFieldChange = (index: number, field: TemplateField) => {
    const newFields = [...editedTemplate.fields]
    newFields[index] = field
    setEditedTemplate({ ...editedTemplate, fields: newFields })
  }

  const handleAddField = () => {
    const maxOrder = Math.max(...editedTemplate.fields.map(f => f.order), 0)
    setEditedTemplate({
      ...editedTemplate,
      fields: [...editedTemplate.fields, createEmptyField(maxOrder + 1)]
    })
  }

  const handleRemoveField = (index: number) => {
    const newFields = editedTemplate.fields.filter((_, i) => i !== index)
    setEditedTemplate({ ...editedTemplate, fields: newFields })
  }

  const handleSave = () => {
    // Valider que tous les champs ont un nom
    const validFields = editedTemplate.fields.filter(f => f.name.trim())
    if (validFields.length === 0) return
    if (!editedTemplate.name.trim()) return

    onSave({
      ...editedTemplate,
      fields: validFields,
      updatedAt: new Date().toISOString(),
    })
    onOpenChange(false)
  }

  const isValid = editedTemplate.name.trim() && editedTemplate.fields.some(f => f.name.trim())

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(currentPrompt)
  }

  const handleResetPrompt = () => {
    setCustomPrompt(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {isDefault ? 'Voir le modèle' : template ? 'Modifier le modèle' : 'Nouveau modèle'}
          </DialogTitle>
        </DialogHeader>

        {isDefault && (
          <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
            Les modèles par défaut ne peuvent pas être modifiés. Vous pouvez créer un nouveau modèle basé sur celui-ci.
          </p>
        )}

        <div className="space-y-6 py-4" onKeyDown={(e) => e.stopPropagation()}>
          {/* Informations de base */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nom du modèle *</Label>
              <Input
                value={editedTemplate.name}
                onChange={(e) => setEditedTemplate({ ...editedTemplate, name: e.target.value })}
                placeholder="Ex: Article de presse, Correspondance..."
                disabled={isDefault}
              />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={editedTemplate.description || ''}
                onChange={(e) => setEditedTemplate({ ...editedTemplate, description: e.target.value })}
                placeholder="Ex: Pour les journaux et magazines"
                disabled={isDefault}
              />
            </div>
          </div>

          {/* Champs */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Champs</Label>
              {!isDefault && (
                <Button variant="outline" size="sm" onClick={handleAddField}>
                  <Plus className="h-3 w-3 mr-1" />
                  Ajouter un champ
                </Button>
              )}
            </div>

            <div className="space-y-2">
              {editedTemplate.fields
                .sort((a, b) => a.order - b.order)
                .map((field, index) => (
                  <FieldEditor
                    key={index}
                    field={field}
                    onChange={(f) => handleFieldChange(index, f)}
                    onRemove={() => handleRemoveField(index)}
                    canRemove={editedTemplate.fields.length > 1 && !isDefault}
                    disabled={isDefault}
                  />
                ))}
            </div>
          </div>

          {/* Prompt Preview */}
          <Collapsible open={promptOpen} onOpenChange={setPromptOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between p-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground rounded-md"
              >
                <span>Prompt IA généré</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${promptOpen ? 'rotate-180' : ''}`} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-2">
              <Textarea
                value={currentPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                rows={8}
                className="font-mono text-xs"
                disabled={isDefault}
              />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleCopyPrompt}>
                  <Copy className="h-3 w-3 mr-1" />
                  Copier
                </Button>
                {customPrompt !== null && !isDefault && (
                  <Button variant="outline" size="sm" onClick={handleResetPrompt}>
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Réinitialiser
                  </Button>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {isDefault ? 'Fermer' : 'Annuler'}
          </Button>
          {!isDefault && (
            <Button onClick={handleSave} disabled={!isValid}>
              Enregistrer
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function TemplatesPage() {
  const { templates, loading, loadTemplates, saveTemplate, deleteTemplate } = useTemplatesStore()
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)
  const [showEditor, setShowEditor] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null)

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  const handleCreate = () => {
    setEditingTemplate(null)
    setShowEditor(true)
  }

  const handleEdit = (template: Template) => {
    setEditingTemplate(template)
    setShowEditor(true)
  }

  const handleSave = async (template: Template) => {
    await saveTemplate(template)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    await deleteTemplate(deleteTarget.id)
    setDeleteTarget(null)
  }

  return (
    <div className="min-h-screen p-8">
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <FileStack className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Modèles</h1>
            <p className="text-muted-foreground text-sm">Gérez les modèles de champs pour vos projets</p>
          </div>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Nouveau modèle
        </Button>
      </header>

      {/* Templates Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Chargement...</div>
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <FileStack className="h-16 w-16 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground mb-4">Aucun modèle</p>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Créer votre premier modèle
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((template) => (
            <Card key={template.id} className="group">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {template.name}
                      {template.isDefault && (
                        <Badge variant="secondary" className="text-xs">Défaut</Badge>
                      )}
                    </CardTitle>
                    {template.description && (
                      <CardDescription>{template.description}</CardDescription>
                    )}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(template)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {!template.isDefault && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget(template)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {template.fields.length} champ{template.fields.length > 1 ? 's' : ''}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {template.fields
                      .sort((a, b) => a.order - b.order)
                      .map((field) => (
                        <Badge key={field.name} variant="outline" className="text-xs">
                          {field.name}
                        </Badge>
                      ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Editor Modal */}
      <TemplateEditorModal
        template={editingTemplate}
        open={showEditor}
        onOpenChange={setShowEditor}
        onSave={handleSave}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le modèle ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Le modèle "{deleteTarget?.name}" sera supprimé définitivement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
