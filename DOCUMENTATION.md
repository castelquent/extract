# ExtrAct V2 - Documentation Technique

> Documentation développeur pour ExtrAct V2

**Version :** 2.0.5

---

## Table des matières

1. [Architecture](#architecture)
2. [Stack technique](#stack-technique)
3. [Structure des fichiers](#structure-des-fichiers)
4. [IPC Handlers](#ipc-handlers)
5. [Stores Zustand](#stores-zustand)
6. [Types partagés](#types-partagés)
7. [Templates](#templates)
8. [Transcription IA](#transcription-ia)
9. [Données persistées](#données-persistées)
10. [Scripts Python](#scripts-python)
11. [Build & Développement](#build--développement)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Electron Main Process                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  projects   │  │  templates  │  │ extraction  │              │
│  │    .ts      │  │     .ts     │  │    .ts      │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │transcription│  │   export    │  │  settings   │              │
│  │    .ts      │  │     .ts     │  │    .ts      │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
                              │ IPC
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Preload (Bridge)                         │
│                      window.api.*                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Renderer (React SPA)                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Zustand Stores                        │    │
│  │  projects │ templates │ extraction │ settings │ ui      │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                       Pages                              │    │
│  │  Projects │ Extraction │ Editor │ Templates             │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Components                            │    │
│  │  layout/* │ ui/* (shadcn)                               │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Stack technique

| Couche | Technologie | Version |
|--------|-------------|---------|
| Desktop | Electron | 28.x |
| Frontend | React | 18.x |
| Language | TypeScript | 5.x |
| Build | Vite | 5.x |
| Styling | Tailwind CSS | 3.x |
| Components | shadcn/ui (Radix) | latest |
| State | Zustand | 4.x |
| Routing | React Router | 6.x |
| PDF Viewer | @react-pdf-viewer | 3.12.x |
| Rich Text | react-quill | 2.x |
| Drag & Drop | @dnd-kit | 6.x |
| Tables | @tanstack/react-table | 8.x |
| HTTP | axios | 1.x |
| PDF Gen | pdfkit, pdf-lib | - |
| Word Gen | docx | 8.x |
| ZIP | adm-zip | 0.5.x |
| Python | PyMuPDF (fitz) | 1.26.x |

---

## Structure des fichiers

```
src/
├── main/
│   ├── index.ts                 # Entry point Electron + auto-updater
│   └── ipc/
│       ├── index.ts             # Setup tous les handlers
│       ├── projects.ts          # CRUD projets, ZIP import/export
│       ├── templates.ts         # CRUD templates
│       ├── extraction.ts        # Sauvegarde zones, génération images
│       ├── transcription.ts     # Appels API OpenAI/Anthropic
│       ├── export.ts            # Export PDF/DOCX/TXT
│       └── settings.ts          # Paramètres, version, updates
│
├── preload/
│   └── index.ts                 # contextBridge → window.api
│
├── renderer/
│   ├── main.tsx                 # Entry point React
│   ├── App.tsx                  # Routes + AppLayout
│   │
│   ├── pages/
│   │   ├── Projects/
│   │   │   ├── index.tsx        # Liste avec filtres
│   │   │   ├── ProjectCard.tsx  # Card projet
│   │   │   └── CreateProjectModal.tsx
│   │   │
│   │   ├── Extraction/
│   │   │   ├── index.tsx        # Page principale
│   │   │   ├── PdfViewer.tsx    # Rendu PDF (pdfjs-dist)
│   │   │   ├── ZonesOverlay.tsx # Canvas de sélection
│   │   │   ├── ZoneBox.tsx      # Rectangle de zone
│   │   │   ├── ArticleItem.tsx  # Item dans la liste
│   │   │   └── ZoneContextMenu.tsx
│   │   │
│   │   ├── Editor/
│   │   │   ├── index.tsx        # Page principale
│   │   │   ├── ArticleForm.tsx  # Formulaire dynamique
│   │   │   ├── ArticlesTable.tsx # Sommaire avec @tanstack/react-table
│   │   │   ├── TranscriptionModal.tsx
│   │   │   ├── ExportModal.tsx
│   │   │   └── UnsavedChangesModal.tsx
│   │   │
│   │   └── Templates/
│   │       └── index.tsx        # CRUD templates + drag & drop
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppLayout.tsx    # Layout principal
│   │   │   ├── NavigationDrawer.tsx
│   │   │   └── SettingsModal.tsx
│   │   │
│   │   ├── ui/                  # Composants shadcn/ui
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── alert-dialog.tsx
│   │   │   ├── select.tsx
│   │   │   ├── input.tsx
│   │   │   ├── textarea.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── table.tsx
│   │   │   ├── checkbox.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── context-menu.tsx
│   │   │   ├── resizable.tsx
│   │   │   ├── scroll-area.tsx
│   │   │   ├── collapsible.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── separator.tsx
│   │   │   ├── progress.tsx
│   │   │   ├── skeleton.tsx
│   │   │   ├── tooltip.tsx
│   │   │   ├── label.tsx
│   │   │   ├── sheet.tsx
│   │   │   └── sidebar.tsx
│   │   │
│   │   ├── WindowCloseHandler.tsx
│   │   └── UpdateHandler.tsx
│   │
│   ├── stores/
│   │   ├── index.ts             # Exports
│   │   ├── projectsStore.ts
│   │   ├── extractionStore.ts
│   │   ├── templatesStore.ts
│   │   ├── settingsStore.ts
│   │   └── uiStore.ts
│   │
│   └── styles/
│       └── index.css            # Tailwind + CSS variables
│
├── shared/
│   └── types.ts                 # Types partagés main/renderer
│
└── package.json                 # Config + electron-builder

scripts/
├── pdf_to_image.py              # Extraction zones → PDF
└── generate_thumbnail.py        # Miniature projet

python-portable/                 # Python embarqué Windows
```

---

## IPC Handlers

### projects.ts

| Channel | Signature | Description |
|---------|-----------|-------------|
| `projects:getAll` | `() → Project[]` | Liste tous les projets |
| `projects:getById` | `(id) → Project` | Récupère un projet |
| `projects:create` | `(name, templateId) → Project` | Crée un projet (dialog PDF) |
| `projects:update` | `(id, updates) → boolean` | Met à jour métadonnées |
| `projects:delete` | `(id) → boolean` | Supprime un projet |
| `projects:duplicate` | `(id) → Project` | Duplique un projet |
| `projects:exportZip` | `(id) → boolean` | Export ZIP (dialog save) |
| `projects:importZip` | `() → Project` | Import ZIP (dialog open) |

### templates.ts

| Channel | Signature | Description |
|---------|-----------|-------------|
| `templates:getAll` | `() → Template[]` | Liste tous les templates |
| `templates:getById` | `(id) → Template` | Récupère un template |
| `templates:save` | `(template) → boolean` | Crée ou met à jour |
| `templates:delete` | `(id) → DeleteTemplateResult` | Supprime (vérifie usage) |

### extraction.ts

| Channel | Signature | Description |
|---------|-----------|-------------|
| `extraction:save` | `(projectId, data) → boolean` | Sauvegarde zones/articles |
| `extraction:load` | `(projectId) → ExtractionData` | Charge la progression |
| `extraction:exportImages` | `(projectId, articles) → Article[]` | Génère les PDFs via Python |
| `extraction:getPdfPath` | `(projectId) → string` | Chemin du PDF source |
| `extraction:getPdfData` | `(projectId) → ArrayBuffer` | Données PDF pour viewer |
| `extraction:getImageData` | `(projectId, path) → string` | Image base64 |
| `extraction:getPdfFile` | `(projectId, path) → string` | URL file:// pour viewer |

### transcription.ts

| Channel | Signature | Description |
|---------|-----------|-------------|
| `transcription:transcribe` | `(projectId, imagePath, settings, template) → TranscriptionResult` | Transcrit une image |

### export.ts

| Channel | Signature | Description |
|---------|-----------|-------------|
| `export:pdf` | `(projectId, articles) → boolean` | Export PDF (dialog save) |
| `export:docx` | `(projectId, articles) → boolean` | Export DOCX |
| `export:txt` | `(projectId, articles) → boolean` | Export TXT |

### settings.ts

| Channel | Signature | Description |
|---------|-----------|-------------|
| `settings:get` | `() → Settings` | Récupère les paramètres |
| `settings:save` | `(settings) → boolean` | Sauvegarde |
| `settings:getVersion` | `() → string` | Version de l'app |
| `settings:checkUpdates` | `() → { available, version }` | Vérifie les mises à jour |
| `logs:getAll` | `() → TranscriptionLog[]` | Historique transcriptions |

---

## Stores Zustand

### projectsStore

```typescript
interface ProjectsState {
  projects: Project[]
  currentProject: Project | null
  loading: boolean
  error: string | null

  loadProjects: () => Promise<void>
  createProject: (name: string, templateId: string) => Promise<Project | null>
  deleteProject: (id: string) => Promise<boolean>
  duplicateProject: (id: string) => Promise<Project | null>
  updateProject: (id: string, updates: Partial<ProjectMetadata>) => Promise<boolean>
  setCurrentProject: (project: Project | null) => void
}

// Selectors
selectExtractionProjects(state)   // status: new | extracting
selectTranscriptionProjects(state) // status: extracted | in_progress
selectCompletedProjects(state)     // status: completed
```

### extractionStore

```typescript
interface ExtractionState {
  articles: Article[]
  currentArticleId: number | null
  selectedZoneIndex: number | null
  currentPage: number
  totalPages: number

  setArticles: (articles: Article[]) => void
  addArticle: () => number
  removeArticle: (id: number) => void
  addZone: (articleId: number, zone: Zone) => void
  removeZone: (articleId: number, zoneIndex: number) => void
  // ...
}
```

### templatesStore

```typescript
interface TemplatesState {
  templates: Template[]
  loading: boolean

  loadTemplates: () => Promise<void>
  saveTemplate: (template: Template) => Promise<boolean>
  deleteTemplate: (id: string) => Promise<DeleteTemplateResult>
}
```

### uiStore

```typescript
interface UIState {
  drawerCollapsed: boolean
  settingsOpen: boolean
  theme: 'light' | 'dark'

  // Window close
  pendingClose: boolean
  hasUnsavedChanges: boolean
  onSaveCallback: (() => Promise<void>) | null

  // Auto-update
  updateStatus: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error'
  updateVersion: string | null
  updateProgress: number
}
```

---

## Types partagés

Définis dans `src/shared/types.ts` :

```typescript
// Template
type FieldType = 'text' | 'textarea' | 'richtext'

interface TemplateField {
  name: string
  type: FieldType
  aiHint?: string    // Indice pour l'IA
  order: number
}

interface Template {
  id: string
  name: string
  description?: string
  aiContext?: string  // Contexte pour le prompt IA
  fields: TemplateField[]
  isDefault?: boolean
  createdAt: string
  updatedAt: string
}

// Project
interface ProjectMetadata {
  id: string
  name: string
  originalFilename: string
  createdAt: string
  modifiedAt: string
  status: 'new' | 'extracting' | 'extracted' | 'in_progress' | 'completed'
  articlesCount: number
  filledFields: number
  totalFields: number
  templateId: string
}

// Article
interface Zone {
  page: number
  x1: number  // 0-1 normalisé
  y1: number
  x2: number
  y2: number
}

interface Article {
  id: number
  zones: Zone[]
  fields: Record<string, string>  // Dynamique selon template
  imagePath?: string
}

// AI
interface AISettings {
  provider: 'openai' | 'anthropic'
  model: string
  openaiApiKey?: string
  anthropicApiKey?: string
}
```

---

## Templates

### Génération du prompt IA

Le prompt est construit dynamiquement à partir du template :

```typescript
function buildPromptFromTemplate(template: Template): string {
  const fieldsList = template.fields
    .sort((a, b) => a.order - b.order)
    .map(f => {
      let line = `- ${f.name}`
      if (f.aiHint) line += ` (${f.aiHint})`
      return line
    })
    .join('\n')

  const context = template.aiContext || 'Tu es un assistant...'

  return `${context}

Analyse le document et retourne un JSON avec les champs suivants:
${fieldsList}

RÈGLES STRICTES:
- Ne reformule rien, transcris le texte tel quel.
- Pour les champs richtext, utilise du HTML (<p>, <strong>, <em>).
- Réponds uniquement avec le JSON.`
}
```

### Templates par défaut

Définis dans `src/main/ipc/templates.ts` :

- **Article de presse** : Titre, Auteur, Contenu (richtext)
- **Correspondance** : Titre, Date, Expéditeur, Destinataire, Contenu (richtext)

### Sécurité à l'import ZIP

À l'export, le template est inclus dans le ZIP. À l'import :
1. Le template est extrait
2. Une nouvelle ID est générée (`template_{timestamp}`)
3. Le template est ajouté s'il n'existe pas déjà
4. Le projet référence cette nouvelle ID

---

## Transcription IA

### Flow

1. Image envoyée en base64
2. Prompt généré depuis template
3. Appel API (OpenAI Vision ou Anthropic)
4. Parsing JSON de la réponse
5. Mapping vers `article.fields`

### Providers

**OpenAI :**
- Endpoint : `https://api.openai.com/v1/chat/completions`
- Format : image_url avec data URI

**Anthropic :**
- Endpoint : `https://api.anthropic.com/v1/messages`
- Format : document base64 (PDF)

### Gestion erreurs

Messages user-friendly pour :
- 401 : Clé API invalide
- 403 : Permissions insuffisantes
- 429 : Rate limit
- 500/502/503 : Service indisponible
- Timeout : Image trop grande

### Logs

Chaque transcription est loggée dans `logs.json` :

```typescript
interface TranscriptionLog {
  date: string
  projectId: string
  model: string
  provider: string
  inputTokens: number
  outputTokens: number
  success: boolean
  error?: string
}
```

---

## Données persistées

Emplacement : `%AppData%/Local/ExtrAct/`

### Fichiers globaux

| Fichier | Contenu |
|---------|---------|
| `templates.json` | Templates utilisateur + défaut |
| `settings.json` | Clés API, thème, préférences |
| `logs.json` | Historique transcriptions |

### Dossier projet

`projects/{projectId}/`

| Fichier | Contenu |
|---------|---------|
| `metadata.json` | Métadonnées projet |
| `source.pdf` | PDF original |
| `thumbnail.png` | Miniature (première page) |
| `save.json` | Articles avec zones et champs |
| `images/` | PDFs extraits par article |

### Format save.json

```json
{
  "articles": [
    {
      "id": 1,
      "zones": [
        { "page": 0, "x1": 0.1, "y1": 0.1, "x2": 0.9, "y2": 0.5 }
      ],
      "fields": {
        "Titre": "Mon article",
        "Auteur": "John Doe",
        "Contenu": "<p>Le contenu...</p>"
      },
      "imagePath": "images/article_1.pdf"
    }
  ]
}
```

---

## Scripts Python

### pdf_to_image.py

Extrait les zones sélectionnées et génère un PDF par article.

```bash
python pdf_to_image.py <input.pdf> <output_dir> <zones_json>
```

Arguments :
- `input.pdf` : PDF source
- `output_dir` : Dossier de sortie
- `zones_json` : JSON des zones (format `[{page, x1, y1, x2, y2}, ...]`)

### generate_thumbnail.py

Génère une miniature de la première page.

```bash
python generate_thumbnail.py <input.pdf> <output.png>
```

---

## Build & Développement

### Prérequis

- Node.js 18+
- Python 3.x avec PyMuPDF

### Scripts npm

```bash
cd src

# Développement
npm run dev           # Vite dev server
npm run electron:dev  # Vite + Electron

# Production
npm run build         # Build complet
npm run build:win     # Build Windows (NSIS)

# Vérification
npm run typecheck     # TypeScript check
```

### Configuration electron-builder

Dans `src/package.json` :

```json
{
  "build": {
    "appId": "com.extract.app",
    "productName": "ExtrAct",
    "extraResources": [
      { "from": "../python-portable", "to": "python-portable" },
      { "from": "../scripts", "to": "scripts" }
    ],
    "win": {
      "target": "nsis",
      "icon": "build/icon.ico"
    },
    "publish": {
      "provider": "github",
      "owner": "castelquent",
      "repo": "extract"
    }
  }
}
```

### Auto-update

- Provider : GitHub Releases
- Vérification au démarrage (configurable)
- Download en arrière-plan avec progression
- Installation manuelle par l'utilisateur

---

*Documentation technique ExtrAct V2 - Janvier 2025*
