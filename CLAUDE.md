# ExtrAct V2

## Le projet

ExtrAct est une application desktop permettant de **numériser et structurer des documents** depuis des PDFs. Conçue initialement pour les articles de presse (journaux, magazines, revues), l'application a évolué vers un système de **templates personnalisables** permettant de traiter tout type de document.

### Cas d'usage

- **Archivage documentaire** : numériser des collections de magazines, journaux anciens
- **Correspondance** : extraire et structurer des lettres, courriers
- **Recherche** : constituer des bases de données d'articles ou documents
- **Tout document structuré** : grâce aux templates customs, adapter l'extraction à n'importe quel type de contenu

### Workflow utilisateur

1. **Créer un projet** : importer un PDF et choisir un template (Article de presse, Correspondance, ou custom)
2. **Extraire** : dessiner des zones rectangulaires sur les pages pour délimiter chaque élément
3. **Générer** : l'app crée un PDF par élément extrait (zones combinables pour un même élément)
4. **Transcrire** : l'IA (OpenAI/Anthropic) remplit automatiquement les champs du template
5. **Éditer** : corriger/compléter dans l'éditeur avec Quill (texte riche)
6. **Exporter** : PDF, DOCX, TXT, ou ZIP complet du projet

---

## Version actuelle : 2.0.5

---

## Stack technique

| Technologie | Usage |
|-------------|-------|
| **Electron 28** | Framework desktop |
| **React 18** | UI Framework |
| **TypeScript 5** | Typage statique |
| **Vite 5** | Build & dev server |
| **Tailwind CSS 3** | Styling |
| **shadcn/ui** | Composants UI (Radix) |
| **Zustand 4** | State management |
| **React Router 6** | Navigation SPA |
| **@react-pdf-viewer** | Rendu PDF dans l'éditeur |
| **react-quill** | Éditeur texte riche |
| **@dnd-kit** | Drag & drop (templates) |
| **PyMuPDF** | Extraction PDF (Python) |

---

## Structure du projet

```
src/
├── main/                   # Process Electron principal
│   ├── index.ts            # Entry point + auto-updater
│   └── ipc/                # Handlers IPC par domaine
│       ├── projects.ts     # CRUD projets, import/export ZIP
│       ├── templates.ts    # CRUD templates
│       ├── extraction.ts   # Sauvegarde zones, export images
│       ├── transcription.ts # Appels API IA (OpenAI/Anthropic)
│       ├── export.ts       # Export PDF/DOCX/TXT
│       └── settings.ts     # Paramètres, version, updates
├── preload/                # Bridge IPC sécurisé
│   └── index.ts            # window.api exposé au renderer
├── renderer/               # Application React
│   ├── App.tsx             # Routes + layout
│   ├── pages/
│   │   ├── Projects/       # Liste projets avec filtres
│   │   ├── Extraction/     # Sélection zones sur PDF
│   │   ├── Editor/         # Édition articles + transcription
│   │   ├── Templates/      # Gestion des templates
│   │   └── Settings/       # (via modal)
│   ├── components/
│   │   ├── layout/         # AppLayout, NavigationDrawer, SettingsModal
│   │   └── ui/             # Composants shadcn/ui
│   └── stores/             # Zustand stores
│       ├── projectsStore.ts
│       ├── extractionStore.ts
│       ├── templatesStore.ts
│       ├── settingsStore.ts
│       └── uiStore.ts
├── shared/
│   └── types.ts            # Types TypeScript partagés
scripts/
├── pdf_to_image.py         # Extraction zones → images
└── generate_thumbnail.py   # Miniature projet
python-portable/            # Python embarqué
```

---

## Fonctionnalités implémentées

### Templates

- **3 types de champs** : `text` (court), `textarea` (long), `richtext` (HTML/Quill)
- **Champ "Titre" obligatoire** : toujours en première position, non supprimable
- **Templates par défaut** :
  - "Article de presse" : Titre, Auteur, Contenu
  - "Correspondance" : Titre, Date, Expéditeur, Destinataire, Contenu
- **Prompt IA auto-généré** : construit à partir des champs + `aiHint` optionnel
- **Drag & drop** : réorganisation des champs
- **Protection** : templates par défaut non modifiables, templates en utilisation non supprimables
- **Export/Import** : à l'export ZIP le template est inclus, à l'import il est recréé avec nouvelle ID

### Projets

- **CRUD complet** : création, suppression, duplication, renommage
- **Filtres** : Tous / À extraire / À transcrire / Terminés
- **Statuts** : `new`, `extracting`, `extracted`, `in_progress`, `completed`
- **Export ZIP** : backup complet (PDF source, images, données, template)
- **Import ZIP** : restauration avec gestion des conflits de template

### Extraction

- **Viewer PDF** avec navigation pages
- **Sélection zones** : rectangles dessinés sur canvas
- **Zones multiples** : plusieurs zones combinées = un seul élément
- **Context menu** sur les zones

### Éditeur

- **Vue splitée resizable** : PDF extrait (gauche) | Formulaire (droite)
- **@react-pdf-viewer** : rendu PDF avec zoom
- **Onglets** : Éditeur / Sommaire (table des matières)
- **Navigation** : boutons + flèches clavier
- **Transcription** :
  - Single : un élément
  - Bulk : sélection multiple avec progression
- **Export** :
  - Single : élément courant
  - Batch : sélection multiple
  - Tous : export complet
  - Formats : PDF, DOCX, TXT
- **Suppression** : confirmation single et bulk
- **Changements non sauvegardés** : détection + modal de confirmation

### Raccourcis clavier

| Raccourci | Action | Contexte |
|-----------|--------|----------|
| `Ctrl+S` | Sauvegarder | Éditeur |
| `←` / `→` | Article précédent/suivant | Éditeur (hors input) |

### Transcription IA

- **Providers** : OpenAI (GPT-4o, etc.) et Anthropic (Claude)
- **Clés API séparées** : une par provider
- **Logs** : historique avec tokens consommés, succès/échec
- **Gestion erreurs** : messages user-friendly (clé invalide, rate limit, etc.)

### UI/UX

- **Thème** : dark/light avec persistance
- **Navigation** : drawer collapsible
- **Toasts** : notifications via sonner
- **Auto-update** : vérification + download avec progression

---

## Données

Stockage dans `%AppData%/Local/ExtrAct/` :

| Fichier/Dossier | Contenu |
|-----------------|---------|
| `projects/{id}/` | Dossier par projet |
| `projects/{id}/metadata.json` | Nom, dates, statut, templateId |
| `projects/{id}/source.pdf` | PDF original |
| `projects/{id}/thumbnail.png` | Miniature |
| `projects/{id}/save.json` | Articles avec zones et champs |
| `projects/{id}/images/` | Images extraites |
| `templates.json` | Templates utilisateur |
| `settings.json` | Paramètres (clés API, thème, etc.) |
| `logs.json` | Historique transcriptions |

---

## Conventions

- **Composants UI** : shadcn/ui dans `src/renderer/components/ui/`
- **Couleurs** : variables CSS HSL dans `index.css`
- **IPC** : `window.api.*` exposé par preload
- **Stores** : Zustand avec actions et selectors

---

## Ce qui manque

- **Auto-save** : pas de sauvegarde automatique
- **Recherche** : pas de recherche dans projets/articles
- **Tooltips** : pas d'aide contextuelle
- **Tests** : aucun test unitaire ou E2E

---

## Scripts

```bash
cd src
npm run dev           # Dev avec HMR
npm run electron:dev  # Dev Electron complet
npm run build:win     # Build Windows
npm run typecheck     # Vérification TypeScript
```
