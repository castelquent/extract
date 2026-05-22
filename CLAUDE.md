# ExtrAct V2

## Le projet

Application desktop pour **numériser et structurer des documents** depuis des PDFs. Cible commerciale : chercheurs en sciences sociales (dépouillement de corpus, archivage, presse, correspondance). Système de **modèles personnalisables** snapshotés par élément.

### Workflow utilisateur

1. **Créer un projet** (corpus / thématique) → choisir un modèle par défaut.
2. **Importer des sources** (PDFs). Plusieurs par projet.
3. **Extraire** : dessiner des zones sur le PDF → grouper en éléments → choisir un modèle par élément.
4. **Sauvegarder** (Ctrl+S) : persiste l'avancement en brouillons (sans PDF). Reprise possible plus tard.
5. **Générer** : produit l'`extract.pdf` par élément, déplace les orphelins vers un dossier choisi.
6. **Transcrire** (IA OpenAI / Anthropic / Mistral) ou **remplir à la main** dans l'éditeur (MDXEditor, markdown WYSIWYG).
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
    │       ├── metadata.json   # text/textarea fields + structural meta
    │       ├── content.md      # mandatory raw transcription (markdown body)
    │       ├── {field}.md      # one per markdown sub-field in the template
    │       ├── extract.pdf
    │       ├── assets/         # inline images extracted by Mistral OCR
    │       │   └── img-N.jpeg
    │       ├── ocr_original.md # debug sidecar (raw OCR before LLM cleanup)
    │       └── ocr_tables.json # debug sidecar (Mistral OCR tables array)
    └── orphans/{articleId}/    # éléments sans dossier
        ├── metadata.json
        ├── content.md
        ├── extract.pdf
        └── assets/
```

**ArticleMetadata** :
```ts
{
  id, sourceId, dossierId,
  zones: Zone[], pages: number[],
  fields: Record<string, string>,  // text + textarea ONLY (markdown sub-fields live in .md files)
  content: string,                 // mandatory raw transcription, lives in content.md
  schema: TemplateField[],         // snapshotté à la création
  aiContext?: string,
  templateId?: string,
  status: 'draft' | 'ready',
  dates,
}
```

**Statut binaire** : `'draft'` (PDF en attente — soit jamais généré, soit zones modifiées depuis) vs `'ready'` (PDF à jour). Le "remplissage" est computed depuis `fields` + `schema`, jamais stocké.

**Architecture markdown** : depuis la pivot Quill→Milkdown→MDXEditor, le `FieldType` est `'text' | 'textarea' | 'markdown'`. Les valeurs markdown ne vivent PAS dans `metadata.json` :
- Le `content` (toujours présent, transcription brute) → `content.md`
- Chaque sub-field markdown du template → `{slug-du-nom}.md`
- Les readers/writers de `src/main/ipc/_fs.ts` (`readArticleMetadata`, `writeArticleMetadata`) splittent automatiquement à la lecture/écriture, le renderer voit un objet unifié.

**Modèle snapshot** : éditer un Template ne touche pas les éléments déjà créés. "Appliquer un modèle" = nouveau snapshot, avec **merge intelligent** des fields (matching par nom, coercion markdown↔text via `stripMarkdown` / `wrapAsMarkdown`). Logique partagée dans `src/renderer/lib/templateMerge.ts`.

---

## Architecture

### Main process

```
src/main/
├── index.ts                    # Entry + auto-updater + extract-asset:// protocol
├── watchers.ts                 # chokidar sur projects/ → notifs renderer
└── ipc/
    ├── settings.ts             # settings.json (clés API Anthropic / OpenAI / Mistral, thème)
    ├── templates.ts            # templates.json (CRUD libre)
    ├── _fs.ts                  # path helpers, ULID, readArticleMetadata/writeArticleMetadata (split JSON/MD), getArticleContentMdPath, getArticleMdFieldPath, getArticleAssetsDir, getArticleAssetPath, ocr_original / ocr_tables sidecars
    └── v2/
        ├── _python.ts          # spawn helpers (thumbnail, image_to_pdf, pdf_to_image, strip_pdf_text, extract_text, page count via pdf-lib)
        ├── projects.ts         # CRUD + buildProjectView (counts)
        ├── sources.ts          # add multi-file picker, thumbnail
        ├── dossiers.ts         # create/rename/delete (mode: 'delete-content' | 'orphan-articles')
        ├── articles.ts         # CRUD + move (cross-project copie la source + assets) + regenerateExtract
        ├── transcription.ts    # multi-provider dispatcher : OpenAI / Anthropic / Mistral (single-step ou 2-step +small/+large). Prompt avec few-shot example. content.md écrit en sidecar + sub-fields .md. v2:transcription:reextractField IPC pour ré-extraction d'un sub-field depuis content.md
        ├── export.ts           # PDF/DOCX/TXT par articleIds
        └── zip.ts              # export/import projet (récursif → inclut assets/ et content.md gratuit)
```

### Renderer

```
src/renderer/
├── App.tsx                     # Routes
├── lib/
│   └── templateMerge.ts        # asString, stripMarkdown (alias stripHtml back-compat), wrapAsMarkdown, sameSchema, computeMerge
├── components/
│   ├── ApplyTemplateDialog.tsx # Modèle picker + merge preview (partagé Editor + Extraction)
│   ├── RichEditor.tsx          # Wrapper MDXEditor (markdown-natif WYSIWYG, top toolbar avec block-switcher). value/onChange en markdown string. Remount sur changement de modifiedAt (transcribe/re-extract).
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

### Transcription : providers et pipelines

| Provider | Modèle(s) | Pipeline | Notes |
|---|---|---|---|
| Anthropic | Claude Opus / Sonnet / Haiku 4.x | 1 appel vision direct, vision + extraction structurée en 1 call. | Bon sur layouts complexes (multi-colonnes, scans). Plus cher. Pas d'extraction d'artefacts (pas d'images séparées). |
| OpenAI | GPT-5.x | Idem, 1 appel | Comme Claude côté pipeline. |
| Mistral | `mistral-ocr-latest` (direct, single-step) | 1 appel via `document_annotation_format` + JSON schema | Cheap ($0.002/page) mais bug NULL bytes sur scans français denses confirmé. |
| Mistral | `mistral-ocr-latest+small` / `+large` (hybride 2-step) | 1. OCR brut → markdown 2. chat Mistral large/small → JSON structuré (Contenu cleaned + métadonnées). 1s pacing entre les deux pour RPS. | Évite NULL bytes mais perd le contexte visuel entre les 2 étapes → multi-colonnes catastrophique (model-level, confirmé sur Le Chat aussi). À 67% sur newspapers per CodeSOTA bench. Voir `memory/feedback_verify_against_real_corpus.md`. |

Tous les providers reçoivent le même prompt (`PROMPT_WRAPPERS` FR/EN dans `transcription.ts`) qui inclut :
- Règle de fidélité textuelle (mots préservés, pas de invention)
- Anti-hallucination des notes (omettre si marqueur orphelin sans texte source)
- Préservation des `![](url)` markdown (anti-strip des images)
- Exception "colonnes interleavées" (permission de réordonner blocs si OCR a mélangé)
- Few-shot example pour notes de bas de page + numéros de page (FR + EN)
- Le champ `Contenu` implicite, toujours demandé en plus du schema utilisateur

**Cleanup mécanique post-LLM** : `completeMarkdownTables()` parse le markdown final, détecte les body-rows orphelins (pipes sans header + séparateur), injecte `| | | |` + `|---|---|` au-dessus. Pas de modif sémantique, juste plumbing markdown. Code-only, déterministe.

### Images / assets via protocole `extract-asset://`

Mistral OCR retourne les images extraites en base64 dans `pages[].images[]`. Côté nous :
1. Décodées et écrites dans `articles/{id}/assets/img-N.jpeg`
2. Les placeholders markdown `![alt](img-N.jpeg)` rewrités en `![alt](extract-asset://a/{articleId}/img-N.jpeg)` AVANT envoi au chat (pour que la chat extraction préserve le markdown sans inventer la résolution)
3. Le protocole Electron `extract-asset://` est enregistré dans `src/main/index.ts` (privileged scheme). Le handler lookup l'article via `idx.getArticle(articleId)` et serve le fichier depuis `assets/`.

ArticleId vit dans le path (pas hostname) parce que RFC 3986 lowercase les hostnames → les ULIDs uppercase étaient perdus. URL shape : `extract-asset://a/{articleId}/{filename}`.

CSP dans `src/index.html` autorise explicitement `img-src 'self' data: extract-asset:`.

### Tables

`table_format: 'markdown'` dans le request Mistral OCR. Les tableaux reviennent dans `pages[].tables[]` (id + `content` markdown propre avec header + séparateur). On les substitue dans le markdown body via leurs placeholders `[tbl-N.md](tbl-N.md)`. Les body-rows orphelins (Mistral n'identifie pas la table) → géré par `completeMarkdownTables()`.

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
| @mdxeditor/editor | Markdown WYSIWYG (Lexical + MDAST, markdown-natif, top toolbar avec block-switcher) |
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

- **Tooltips** : très peu.
- **Tests** : aucun.
- **Distribution** : pas encore d'auto-update infrastructure mature pour les utilisateurs finaux.
- **API keys friction** : reste le blocker commercial principal (cf. `memory/project_api_key_friction.md`).
- **Export markdown→HTML/DOCX** : `src/main/ipc/v2/export.ts` n'a pas été refactoré post-pivot markdown. Les exports rendent du HTML cassé sur du contenu markdown. À adapter (utiliser `marked` pour PDF via Chromium ; helper `paragraphsFromRichHtml` côté DOCX qui parse `<img>` → `ImageRun` et `<table>` → `Table`).
- **Mistral OCR multi-colonnes / presse** : limite model-level (~67% benchmarks). Le 2-step `+small/+large` perd le contexte visuel entre OCR et chat → reading order foireux. Documenter dans l'onboarding ou router vers Claude pour ce type de corpus. Voir `memory/feedback_verify_against_real_corpus.md`.
