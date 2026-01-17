# ExtrAct V2 - Structure du Projet

> Architecture React + Electron + TypeScript + Vite + shadcn/ui

---

## Stack Technique

| Technologie | Version | Rôle |
|-------------|---------|------|
| **Electron** | 28.x | Framework desktop |
| **React** | 18.x | UI Framework |
| **TypeScript** | 5.x | Typage statique |
| **Vite** | 5.x | Build & Dev server |
| **TailwindCSS** | 3.x | Styling |
| **shadcn/ui** | latest | Composants UI (Radix + Tailwind) |
| **Zustand** | 4.x | State management |
| **React Router** | 6.x | Navigation SPA |
| **Lucide React** | latest | Icônes |

---

## Arborescence

```
src/
├── main/                      # Process principal Electron
│   ├── index.ts               # Point d'entrée Electron
│   ├── ipc/                   # Handlers IPC (séparés par domaine)
│   │   ├── index.ts           # Setup de tous les handlers
│   │   ├── projects.ts        # CRUD projets
│   │   ├── extraction.ts      # Extraction PDF → images
│   │   ├── transcription.ts   # Appels API IA
│   │   ├── export.ts          # Export PDF/DOCX/ZIP
│   │   └── settings.ts        # Paramètres & updates
│   └── services/              # Logique métier (à venir)
│
├── preload/                   # Bridge IPC sécurisé
│   └── index.ts               # Exposition des APIs
│
├── renderer/                  # Application React
│   ├── main.tsx               # Point d'entrée React
│   ├── App.tsx                # Routes principales
│   ├── pages/                 # Pages de l'application
│   │   ├── Projects/          # Liste des projets
│   │   │   ├── index.tsx      # ✅ Utilise projectsStore
│   │   │   ├── ProjectCard.tsx
│   │   │   └── CreateProjectModal.tsx
│   │   ├── Extraction/        # Sélection de zones PDF
│   │   │   ├── index.tsx      # ✅ Page principale (stores intégrés)
│   │   │   ├── PdfViewer.tsx  # ✅ Rendu PDF avec PDF.js
│   │   │   └── SelectionCanvas.tsx # ✅ Canvas de sélection
│   │   ├── Editor/            # Édition des articles
│   │   │   └── index.tsx      # ⚠️ À compléter (Quill)
│   │   └── Settings/          # Paramètres
│   │       └── index.tsx      # ✅ Utilise settingsStore
│   ├── components/            # Composants réutilisables
│   │   └── ui/                # Composants shadcn/ui
│   │       ├── button.tsx
│   │       ├── input.tsx
│   │       ├── textarea.tsx
│   │       ├── label.tsx
│   │       ├── card.tsx
│   │       ├── dialog.tsx
│   │       ├── select.tsx
│   │       ├── tooltip.tsx
│   │       └── index.ts       # Export centralisé
│   ├── hooks/                 # Custom hooks (à créer)
│   ├── stores/                # ✅ État global (Zustand)
│   │   ├── index.ts           # Export centralisé
│   │   ├── projectsStore.ts   # CRUD projets, loading state
│   │   ├── extractionStore.ts # Articles, zones, pagination PDF
│   │   └── settingsStore.ts   # Configuration AI/app
│   ├── lib/
│   │   └── utils.ts           # Utilitaire cn() pour Tailwind
│   └── styles/
│       └── index.css          # Tailwind + CSS variables shadcn
│
├── shared/                    # Code partagé main/renderer
│   └── types.ts               # Types TypeScript
│
├── index.html                 # HTML template
├── package.json               # Dépendances
├── components.json            # Config shadcn/ui
├── tsconfig.json              # Config TypeScript
├── tsconfig.node.json         # Config TS pour Vite
├── vite.config.ts             # Config Vite + Electron
├── tailwind.config.js         # Config Tailwind + shadcn
└── postcss.config.js          # Config PostCSS
```

---

## shadcn/ui

### Composants disponibles

| Composant | Import | Usage |
|-----------|--------|-------|
| `Button` | `@/components/ui` | Boutons avec variants (default, destructive, outline, secondary, ghost, link) |
| `Input` | `@/components/ui` | Champs de saisie texte |
| `Textarea` | `@/components/ui` | Zone de texte multiligne |
| `Label` | `@/components/ui` | Labels pour formulaires |
| `Card` | `@/components/ui` | Conteneurs avec header/content/footer |
| `Dialog` | `@/components/ui` | Modales/popups |
| `Select` | `@/components/ui` | Listes déroulantes |
| `Tooltip` | `@/components/ui` | Infobulles |

### Utilisation

```tsx
import { Button, Input, Card, CardHeader, CardTitle, CardContent } from '@/components/ui'

function Example() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Titre</CardTitle>
      </CardHeader>
      <CardContent>
        <Input placeholder="Entrez du texte" />
        <Button variant="default">Valider</Button>
        <Button variant="destructive">Supprimer</Button>
        <Button variant="outline">Annuler</Button>
      </CardContent>
    </Card>
  )
}
```

### Ajouter un composant

Pour ajouter un nouveau composant shadcn :
1. Aller sur https://ui.shadcn.com/docs/components
2. Copier le code du composant
3. Le placer dans `src/renderer/components/ui/`
4. L'exporter dans `index.ts`

---

## Comparaison V1 → V2

| Aspect | V1 (Ancien) | V2 (Nouveau) |
|--------|-------------|--------------|
| **UI** | HTML + JS vanilla | React + shadcn/ui |
| **État** | Variables globales | Zustand (stores) |
| **Typage** | Aucun | TypeScript strict |
| **Styles** | Bulma + CSS custom | TailwindCSS + CSS variables |
| **Composants** | Aucun | shadcn/ui (Radix) |
| **Build** | Electron direct | Vite + HMR |
| **Navigation** | Pages HTML séparées | React Router (SPA) |
| **IPC** | 1 fichier (1800+ lignes) | Modules séparés |

---

## Modules IPC

Chaque domaine a son propre fichier de handlers :

### `projects.ts`
- `projects:getAll` - Liste tous les projets
- `projects:create` - Crée un nouveau projet
- `projects:delete` - Supprime un projet
- `projects:getById` - Récupère un projet
- `projects:update` - Met à jour les métadonnées

### `extraction.ts`
- `extraction:save` - Sauvegarde la progression
- `extraction:load` - Charge la progression
- `extraction:exportImages` - Exporte les zones en images
- `extraction:getPdfPath` - Récupère le chemin du PDF

### `transcription.ts`
- `transcription:transcribe` - Transcrit une image avec l'IA

### `export.ts`
- `export:pdf` - Exporte en PDF
- `export:docx` - Exporte en Word
- `export:zip` - Exporte en archive
- `export:importZip` - Importe une archive

### `settings.ts`
- `settings:get` - Récupère les paramètres
- `settings:save` - Sauvegarde les paramètres
- `settings:getVersion` - Version de l'app
- `settings:checkUpdates` - Vérifie les mises à jour
- `settings:downloadUpdate` - Télécharge la mise à jour
- `settings:installUpdate` - Installe la mise à jour

---

## Types Partagés

```typescript
// Projet
interface Project {
  id: string
  name: string
  status: 'new' | 'in_progress' | 'extracted' | 'completed'
  articlesCount: number
  // ...
}

// Article
interface Article {
  id: number
  zones: Zone[]
  title?: string
  author?: string
  content?: string
}

// Zone de sélection
interface Zone {
  page: number
  x1: number  // 0-1 normalisé
  y1: number
  x2: number
  y2: number
}

// Configuration IA
interface AISettings {
  provider: 'openai' | 'anthropic'
  apiKey: string
  model: string
  prompt: string
}
```

---

## Pages de l'Application

### 1. Projects (`/`)
Page d'accueil avec la grille des projets.
- Création de projet (modal)
- Ouverture vers Extraction ou Editor selon le statut
- Suppression de projet

### 2. Extraction (`/extraction/:projectId`)
Sélection visuelle des zones sur le PDF.
- Rendu PDF avec PDF.js
- Canvas de sélection
- Liste des articles créés
- Export vers images

### 3. Editor (`/editor/:projectId`)
Édition des articles extraits.
- Vue splitée (image | formulaire)
- Transcription IA
- Navigation entre articles
- Export PDF/DOCX

### 4. Settings (`/settings`)
Configuration de l'application.
- Choix du fournisseur IA
- Clé API et modèle
- Prompt personnalisé
- Mises à jour

---

## Scripts NPM

```bash
# Développement (avec HMR)
npm run dev

# Build production
npm run build

# Build Windows uniquement
npm run build:win

# Vérification TypeScript
npm run typecheck
```

---

## Stores Zustand

État global centralisé accessible depuis n'importe quel composant.

### `projectsStore.ts`
```typescript
const { projects, loading, loadProjects, createProject, deleteProject } = useProjectsStore()
```
- `projects` - Liste des projets
- `currentProject` - Projet actuellement ouvert
- `loading` / `error` - États de chargement
- Actions : `loadProjects()`, `createProject()`, `deleteProject()`, `updateProject()`

### `extractionStore.ts`
```typescript
const { articles, currentPage, addZone, removeZone } = useExtractionStore()
```
- `articles` - Liste des articles avec leurs zones
- `currentArticleId` / `selectedZoneIndex` - Sélection active
- `currentPage` / `totalPages` - Navigation PDF
- Actions : `addArticle()`, `addZone()`, `removeZone()`, `loadExtraction()`, `saveExtraction()`
- Selectors : `selectCurrentArticle`, `selectCurrentZones`

### `settingsStore.ts`
```typescript
const { settings, loading, saveSettings, updateAI } = useSettingsStore()
```
- `settings` - Configuration AI et app
- Actions : `loadSettings()`, `saveSettings()`, `updateAI()`, `updateApp()`

### Avantage
L'état persiste entre les navigations de pages. Quitter Extraction → aller dans Settings → revenir : les données sont toujours là.

---

## Prochaines Étapes

### ✅ Terminé

1. ~~**PDF Viewer**~~ - Rendu PDF avec PDF.js + worker local
2. ~~**Canvas de sélection**~~ - Dessin de zones rectangulaires
3. ~~**Stores Zustand**~~ - projectsStore, extractionStore, settingsStore
4. ~~**Scripts Python**~~ - pdf_to_image.py adapté (CLI args, pages 0-indexed)

### À implémenter

5. **Quill Editor** - Remplacer le textarea par react-quill dans Editor
6. **Panzoom** - Zoom sur les images d'articles
7. **Table des matières** - Liste des articles avec indicateur de complétion
8. **Transcription par lot** - Transcrire tous les articles automatiquement
9. **Hooks personnalisés** - useKeyboardShortcuts, useAutoSave

### Améliorations possibles

- [ ] Tests unitaires (Vitest)
- [ ] Tests E2E (Playwright)
- [ ] Internationalisation (i18n)
- [ ] Thème clair/sombre
- [ ] Raccourcis clavier globaux
- [ ] Drag & drop pour réorganiser les articles

---

## Migration depuis V1

Pour migrer les projets existants :
1. Les données sont stockées dans `%AppData%/Local/ExtrAct/projects/`
2. Le format de `metadata.json` et `export.json` reste identique
3. Aucune migration de données nécessaire

---

*Structure créée pour ExtrAct V2*
