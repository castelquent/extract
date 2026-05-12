# ExtrAct V2 - Structure Rapide

> Guide rapide de la structure du projet. Pour la documentation complète, voir `DOCUMENTATION.md`.

---

## Arborescence

```
src/
├── main/                       # Electron Main Process
│   ├── index.ts                # Entry point + auto-updater
│   └── ipc/                    # Handlers IPC
│       ├── projects.ts         # CRUD projets, ZIP
│       ├── templates.ts        # CRUD templates
│       ├── extraction.ts       # Zones, images
│       ├── transcription.ts    # API IA
│       ├── export.ts           # PDF/DOCX/TXT
│       └── settings.ts         # Config, updates
│
├── preload/
│   └── index.ts                # window.api
│
├── renderer/                   # React SPA
│   ├── App.tsx                 # Routes
│   ├── pages/
│   │   ├── Projects/           # Liste + filtres
│   │   ├── Extraction/         # Sélection zones
│   │   ├── Editor/             # Édition + transcription
│   │   └── Templates/          # Gestion templates
│   ├── components/
│   │   ├── layout/             # AppLayout, NavigationDrawer, SettingsModal
│   │   └── ui/                 # shadcn/ui
│   └── stores/                 # Zustand
│       ├── projectsStore.ts
│       ├── templatesStore.ts
│       ├── extractionStore.ts
│       ├── settingsStore.ts
│       └── uiStore.ts
│
├── shared/
│   └── types.ts                # Types partagés
│
scripts/
├── pdf_to_image.py             # Extraction zones
└── generate_thumbnail.py       # Miniatures
```

---

## Pages & Routes

| Route | Page | Description |
|-------|------|-------------|
| `/` | Projects | Liste projets (filtre: all) |
| `/extraction` | Projects | Filtre: à extraire |
| `/transcription` | Projects | Filtre: à transcrire |
| `/completed` | Projects | Filtre: terminés |
| `/extraction/:id` | Extraction | Sélection zones PDF |
| `/editor/:id` | Editor | Édition articles |
| `/templates` | Templates | Gestion templates |

---

## Stores

| Store | Responsabilité |
|-------|----------------|
| `projectsStore` | CRUD projets, filtres, selectors |
| `templatesStore` | CRUD templates |
| `extractionStore` | Articles, zones, pagination |
| `settingsStore` | Config IA, thème |
| `uiStore` | Drawer, modal settings, theme, updates |

---

## Composants shadcn/ui disponibles

```
button, input, textarea, label, card, dialog, alert-dialog,
select, tabs, table, checkbox, dropdown-menu, context-menu,
resizable, scroll-area, collapsible, badge, separator,
progress, skeleton, tooltip, sheet, sidebar
```

---

## Scripts

```bash
cd src
npm run dev           # Vite dev
npm run electron:dev  # Vite + Electron
npm run build:win     # Build Windows
npm run typecheck     # Check TS
```

---

## Données

`%AppData%/Local/ExtrAct/`

- `templates.json` - Templates
- `settings.json` - Paramètres
- `logs.json` - Logs transcription
- `projects/{id}/` - Dossiers projets
  - `metadata.json`
  - `source.pdf`
  - `thumbnail.png`
  - `save.json`
  - `images/`

---

*Voir `DOCUMENTATION.md` pour les détails techniques complets.*
