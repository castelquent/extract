# ExtrAct V2

## Le projet

Application desktop pour **numériser et structurer des documents** depuis des PDFs. Cible commerciale : chercheurs en sciences sociales (dépouillement de corpus, archivage, presse, correspondance). Système de **modèles personnalisables** snapshotés par élément.

### Workflow utilisateur

1. **Créer un projet** (corpus / thématique) → choisir un modèle par défaut.
2. **Importer des sources** (PDFs). Plusieurs par projet.
3. **Extraire** : dessiner des zones sur le PDF → grouper en éléments → choisir un modèle par élément.
4. **Sauvegarder** (Ctrl+S) : persiste l'avancement en brouillons (sans PDF). Reprise possible plus tard.
5. **Générer** : produit l'`extract.pdf` par élément, déplace les orphelins vers un dossier choisi.
6. **Transcrire** (IA OpenAI/Anthropic) ou **remplir à la main** dans l'éditeur.
7. **Exporter** : PDF, DOCX, TXT, ZIP du projet entier.

---

## Modèle de données (v2)

Filesystem-as-truth. Tout sur disque, pas de DB.

```
%AppData%/Local/ExtrAct/
├── settings.json
├── templates.json
├── logs.json
└── projects/{projectId}/
    ├── metadata.json           # { id, name, defaultTemplateId, dates }
    ├── thumbnail.png
    ├── sources/{sourceId}/
    │   ├── source.pdf
    │   ├── thumbnail.png
    │   └── metadata.json       # { id, originalFilename, pageCount, importedAt }
    ├── dossiers/{dossierId}/
    │   ├── metadata.json       # { id, name, dates }
    │   └── articles/{articleId}/
    │       ├── metadata.json
    │       └── extract.pdf
    └── orphans/{articleId}/    # éléments sans dossier
        ├── metadata.json
        └── extract.pdf
```

**ArticleMetadata** :
```ts
{
  id, sourceId, dossierId,
  zones: Zone[], pages: number[],
  fields: Record<string, string>,
  schema: TemplateField[],     // snapshotté à la création
  aiContext?: string,
  status: 'draft' | 'ready',
  dates,
}
```

**Statut binaire** : `'draft'` (PDF en attente — soit jamais généré, soit zones modifiées depuis) vs `'ready'` (PDF à jour). Le "remplissage" est computed depuis `fields` + `schema`, jamais stocké.

**Modèle snapshot** : éditer un Template ne touche pas les éléments déjà créés. "Appliquer un modèle" = nouveau snapshot, avec **merge intelligent** des fields (matching par nom, coercion richtext↔text). Logique partagée dans `src/renderer/lib/templateMerge.ts`.

---

## Architecture

### Main process

```
src/main/
├── index.ts                    # Entry + auto-updater
├── watchers.ts                 # chokidar sur projects/ → notifs renderer
└── ipc/
    ├── settings.ts             # settings.json (clés API, thème)
    ├── templates.ts            # templates.json (CRUD libre, plus de "in_use" check)
    └── v2/
        ├── _fs.ts              # path helpers + readJson/writeJson + ULID
        ├── _python.ts          # spawn helpers (generate_thumbnail, image_to_pdf, pdf_to_image, page count via pdf-lib)
        ├── projects.ts         # CRUD + buildProjectView (counts)
        ├── sources.ts          # add multi-file picker, thumbnail
        ├── dossiers.ts         # create/rename/delete (mode: 'delete-content' | 'orphan-articles')
        ├── articles.ts         # CRUD + move (cross-project copie la source) + regenerateExtract
        ├── transcription.ts    # appel IA, écrit dans fields (pas de status update)
        ├── export.ts           # PDF/DOCX/TXT par articleIds
        └── zip.ts              # export/import projet (self-contained, pas de template embarqué)
```

### Renderer

```
src/renderer/
├── App.tsx                     # Routes
├── lib/
│   └── templateMerge.ts        # asString, stripHtml, wrapAsHtml, sameSchema, computeMerge
├── components/
│   ├── ApplyTemplateDialog.tsx # Modèle picker + merge preview (partagé Editor + Extraction)
│   ├── layout/                 # AppLayout, NavigationDrawer, SettingsModal, HelpModal
│   └── ui/                     # shadcn/ui
├── pages/
│   ├── Projects/               # Liste projets + filtres + ProjectCard (X/Y)
│   ├── Project/                # Détail projet : tabs Articles + Sources
│   ├── ExtractionV2/           # Source-scoped, Sauvegarder + Générer
│   ├── Extraction/             # Composants partagés (PdfViewer, ZonesOverlay, ZoneBox, ArticleItem, ZoneItem)
│   ├── EditorV2/               # Éditeur scope projet + ApplyTemplateDialog
│   ├── Editor/                 # Modales partagées (Transcription, Export, ModelSelection, UnsavedChanges)
│   ├── Templates/              # CRUD modèles
│   ├── Search/                 # Recherche cross-projets
│   ├── Settings/               # Modal
│   └── Onboarding/             # /welcome stepper
└── stores/                     # Zustand
    ├── projectsStoreV2.ts      # liste projets + selectors par count
    ├── projectStore.ts         # projet courant (sources, dossiers, articles)
    ├── extractionStore.ts      # WorkingArticle[] (memory) + hydrateFromSource/saveArticles/generateArticles
    ├── editorStore.ts          # articles par scope + drafts en mémoire + applyTemplate
    ├── templatesStore.ts, settingsStore.ts, uiStore.ts
    └── index.ts
```

### Routes

- `/` `/extraction` `/transcription` `/completed` → ProjectsPage (filtres par count)
- `/project/:projectId` → ProjectDetailPage
- `/extraction/:projectId/:sourceId` → ExtractionV2Page
- `/editor/:projectId?article=:articleId` → EditorV2Page
- `/templates`, `/search`, `/welcome`

---

## Mécaniques notables

### Extraction (ExtractionV2)

- **Hydrate** au mount : charge tous les éléments de la source (drafts inclus via `includeDrafts: true`). Les éléments existants deviennent des `WorkingArticle` avec `persistedId` set.
- **Lock** : un élément avec `persistedStatus === 'ready'` est verrouillé. Drag/resize/delete des zones bloqués jusqu'à déverrouillage explicite (modale "Modifier les zones invalide le PDF, X champs seront supprimés"). `unlockArticle()` vide les fields + reset status à `'draft'`.
- **Sélecteur de modèle par élément** : inline `<Select>` pour non-lockés (swap silencieux), bouton "Modèle : X" qui ouvre `ApplyTemplateDialog` pour les lockés (merge intelligent).
- **Sauvegarder** (Ctrl+S) : persiste les nouveaux comme `'draft'` (skipExtractGeneration=true, `dossierId: null`). Maj des persistés modifiés. Si zones changées → reset à `'draft'`.
- **Générer** : popup dossier si y'a des drafts orphans. Dossier créé **lazy** (uniquement si au moins un article y atterrit). Régen extract.pdf par élément, status passe à `'ready'`.

### Filtre brouillons

`v2:articles:list` (et `ArticleScope`) filtre `status: 'draft'` par défaut. Seul ExtractionV2 passe `includeDrafts: true`. ProjectDetail / Editor / Search ne voient pas les drafts. `buildProjectView` les compte dans `articlesToExtract`, pas dans `articlesTotal`.

### Counts ProjectView

| Champ | Quoi |
|---|---|
| `articlesToExtract` | drafts (PDF à générer) |
| `articlesTotal` | éléments ready |
| `articlesFilled` | ready avec tous les fields du schema remplis |

Affichage : ProjectCard montre `5 à extraire` + badge `8/12` (vert si plein). Pas de label "à transcrire" / "terminé" séparé.

### Watcher chokidar

`src/main/watchers.ts` watch `projects/` profond, debounce 250ms, émet `v2:fs:projectsListChanged` + `v2:fs:projectChanged(projectId)`. AppLayout listen → refresh `projectsStoreV2` + `projectStore` (si projet courant). **extractionStore et editorStore PAS refresh** (perdrait les drafts en mémoire).

### Édition scopée par dossier

Depuis ProjectDetail, chaque header de dossier (et la section "Sans dossier") expose un bouton "Éditer" qui navigue vers `/editor/:projectId?dossier=:dossierId` (ou `?orphans=1` pour les orphelins). Bouton désactivé si la section a 0 élément — pas de modale d'erreur nécessaire.

`EditorV2` lit ces query params au mount et passe `{ dossierId }` à `editorStore.loadScope`. Le header affiche en sous-titre "Dossier : Mars 1920" ou "Sans dossier" pour rappeler le scope actif. Sans param = projet entier (comportement par défaut).

`ArticleScope` supporte aussi `sourceId` côté IPC mais pas encore d'entry point UI (à ajouter si besoin émerge). Sélection multiple : à faire en v2 de la feature.

### Strict Mode gotcha

Le cleanup du `useEffect` d'ExtractionV2 ne reset PAS `extractionStore` (sinon le double-mount React Strict niquerait `sessionProjectId` et toute Save/Generate échouerait silencieusement). Voir le commentaire dans `pages/ExtractionV2/index.tsx`.

---

## Wording UI (français)

- **Élément** (pas "article" — terme générique, peut être un article, lettre, pub, etc.)
- **Modèle** (pas "preset" ou "template" — voir [[feedback-french-wording]])
- **Source** = PDF importé
- **Dossier** = groupement d'éléments dans un projet
- "Article de presse" reste le nom du modèle par défaut (pas à renommer)

---

## Stack

| Tech | Usage |
|---|---|
| Electron 28 | Desktop |
| React 18 + TS 5 + Vite 5 | UI |
| Tailwind 3 + shadcn/ui (Radix) | Styling |
| Zustand 4 | State |
| React Router 6 (HashRouter) | Nav |
| @react-pdf-viewer | Rendu PDF dans l'éditeur |
| pdfjs-dist | Rendu PDF dans l'extraction |
| react-quill | Texte riche |
| @dnd-kit | Drag-drop (zones, templates) |
| react-rnd | Zones draggables sur PDF |
| PyMuPDF (via python-portable) | Extraction zones → PDF, thumbnails |
| pdf-lib | Page count (pure JS, sans Python) |
| chokidar | File watcher |
| ulid | IDs courts sortable |

---

## Scripts

```bash
cd src
npm run electron:dev      # Dev complet
npm run build:win         # Build Windows
npm run build:mac         # Build macOS
npm run typecheck         # tsc --noEmit
```

---

## Ce qui manque

- **Auto-save dans l'éditeur** : pas implémenté (les drafts dans extraction oui).
- **Tooltips** : très peu.
- **Tests** : aucun.
- **Distribution** : pas encore d'auto-update infrastructure mature pour les utilisateurs finaux.
- **API keys friction** : reste le blocker commercial principal (cf. `memory/project_api_key_friction.md`).
