# ExtrAct V2

## Le projet

ExtrAct permet de **numériser des articles de presse** depuis des PDFs (revues, journaux, magazines).

**Workflow utilisateur:**
1. L'utilisateur importe un PDF (ex: scan d'un magazine)
2. Il dessine des rectangles sur les pages pour délimiter chaque article
3. L'app génère un PDF par article (extraction des zones)
4. L'IA (OpenAI/Anthropic) transcrit automatiquement : titre, auteur, contenu
5. L'utilisateur peut éditer/corriger dans un éditeur riche (Quill)
6. Export final en PDF, DOCX ou ZIP

**Cas d'usage:** archivage documentaire, numérisation de contenus imprimés, création de bases d'articles.

## Stack

- **Frontend**: Electron + React + Vite + TypeScript
- **UI**: shadcn/ui + Tailwind CSS (thème dark/light)
- **State**: Zustand (stores dans `src/renderer/stores/`)
- **Backend**: Node.js IPC handlers dans `src/main/ipc/`
- **Python**: PyMuPDF pour extraction PDF (scripts dans `scripts/`, env dans `python-portable/`)

## Structure

```
src/
├── main/           # Process Electron principal
│   ├── index.ts    # Entry point
│   └── ipc/        # Handlers IPC (projects, extraction, transcription, export, settings)
├── preload/        # Bridge IPC sécurisé (window.api)
├── renderer/       # Frontend React
│   ├── components/ # UI (layout/, ui/)
│   ├── pages/      # Projects, Extraction, Editor
│   ├── stores/     # Zustand (projectsStore, extractionStore, settingsStore, uiStore)
│   └── styles/     # CSS + variables thème
└── shared/         # Types TypeScript partagés
```

## Conventions

- Composants UI: shadcn/ui (`src/renderer/components/ui/`)
- Couleurs: variables CSS HSL dans `index.css` (sobre, gris neutres)
- IPC: `window.api.*` exposé par preload
- Données projet: `%AppData%/Local/ExtrAct/projects/{id}/data.json`

## Flux principal

1. **Projects** (`/`) - Liste, création, import/export
2. **Extraction** (`/extraction/:id`) - Sélection zones sur PDF
3. **Editor** (`/editor/:id`) - Édition articles + transcription IA

## À faire

Voir `TODO_V2.md` pour la liste complète. Priorités:
- Hooks personnalisés (usePdfDocument, useKeyboardShortcuts, useAutoSave)
- Bloquer fermeture fenêtre si changements non sauvegardés
- Raccourcis clavier
