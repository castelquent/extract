# ExtrAct V2 - TODO Détaillé

> Ce document liste TOUT ce qu'il reste à implémenter pour la V2.
> À utiliser comme référence si le contexte de conversation est perdu.

---

## État Actuel du Projet

### ✅ Déjà Fait

```
src/
├── main/
│   ├── index.ts                 ✅ Process Electron de base
│   └── ipc/
│       ├── index.ts             ✅ Setup de tous les handlers
│       ├── projects.ts          ✅ CRUD complet des projets
│       ├── extraction.ts        ✅ Save/load extraction + export images
│       ├── transcription.ts     ✅ Appels OpenAI et Anthropic
│       ├── export.ts            ✅ Export PDF, DOCX, ZIP
│       └── settings.ts          ✅ Paramètres + auto-update
│
├── preload/
│   └── index.ts                 ✅ Bridge IPC typé complet
│
├── renderer/
│   ├── main.tsx                 ✅ Entry point React
│   ├── App.tsx                  ✅ Routes définies
│   ├── components/
│   │   ├── layout/              ✅ Navigation drawer + modales
│   │   │   ├── AppLayout.tsx    ✅ Layout avec SidebarProvider
│   │   │   ├── NavigationDrawer.tsx ✅ Sidebar collapsible
│   │   │   ├── SettingsModal.tsx ✅ Paramètres en modale
│   │   │   └── index.ts         ✅ Exports
│   │   └── ui/                  ✅ shadcn/ui configuré
│   │       ├── button.tsx       ✅ Boutons avec variants
│   │       ├── input.tsx        ✅ Champs de saisie
│   │       ├── textarea.tsx     ✅ Zone de texte
│   │       ├── label.tsx        ✅ Labels
│   │       ├── card.tsx         ✅ Conteneurs
│   │       ├── dialog.tsx       ✅ Modales
│   │       ├── select.tsx       ✅ Listes déroulantes
│   │       ├── tooltip.tsx      ✅ Infobulles
│   │       ├── sidebar.tsx      ✅ Drawer navigation (shadcn)
│   │       └── index.ts         ✅ Export centralisé
│   ├── hooks/
│   │   └── use-mobile.ts        ✅ Hook détection mobile
│   ├── lib/
│   │   └── utils.ts             ✅ Utilitaire cn()
│   ├── pages/
│   │   ├── Projects/
│   │   │   ├── index.tsx        ✅ Liste des projets (+ projectsStore)
│   │   │   ├── ProjectCard.tsx  ✅ Carte projet
│   │   │   └── CreateProjectModal.tsx ✅ Modal création
│   │   ├── Extraction/
│   │   │   ├── index.tsx        ✅ Page complète (stores intégrés)
│   │   │   ├── PdfViewer.tsx    ✅ Rendu PDF avec PDF.js
│   │   │   └── SelectionCanvas.tsx ✅ Canvas de sélection
│   │   ├── Editor/
│   │   │   └── index.tsx        ⚠️ Structure seulement (textarea basique)
│   │   └── Settings/
│   │       └── index.tsx        ✅ Page complète (+ settingsStore)
│   ├── stores/
│   │   ├── index.ts             ✅ Export centralisé
│   │   ├── projectsStore.ts     ✅ CRUD projets + selectors filtrage
│   │   ├── extractionStore.ts   ✅ Articles, zones, PDF
│   │   ├── settingsStore.ts     ✅ Config AI/app
│   │   └── uiStore.ts           ✅ UI state (drawer, settings modal)
│   └── styles/
│       └── index.css            ✅ Tailwind + CSS variables shadcn
│
├── shared/
│   └── types.ts                 ✅ Tous les types TypeScript
│
├── package.json                 ✅ Dépendances configurées
├── components.json              ✅ Config shadcn/ui
├── tsconfig.json                ✅ Config TypeScript
├── vite.config.ts               ✅ Config Vite + Electron
├── tailwind.config.js           ✅ Config Tailwind + shadcn
└── index.html                   ✅ Template HTML
```

### Dépendances shadcn installées

- `tailwindcss-animate` - Animations Tailwind
- `class-variance-authority` - Variants de composants
- `clsx` + `tailwind-merge` - Utilitaire cn()
- `lucide-react` - Icônes
- `@radix-ui/react-*` - Composants headless (dialog, select, tooltip, label, dropdown-menu, slot)

---

## ✅ Implémenté

---

### 1. PDF Viewer (Extraction Page) ✅ FAIT

**Fichiers :**
- `src/renderer/pages/Extraction/index.tsx`
- `src/renderer/pages/Extraction/PdfViewer.tsx`

**Ce qui a été fait :**
- Worker PDF.js local via import Vite (`?url`)
- Lecture PDF via IPC ArrayBuffer (file:// bloqué par contextIsolation)
- Navigation entre pages
- Canvas redimensionnable selon le conteneur

**Note technique :** Le PDF est chargé via `window.api.getPdfData()` qui retourne un ArrayBuffer, pas via file:// URL.

---

### 2. Canvas de Sélection de Zones ✅ FAIT

**Fichier :** `src/renderer/pages/Extraction/SelectionCanvas.tsx`

**Ce qui a été fait :**
- Canvas superposé au PDF
- Dessin de rectangles (mousedown/move/up)
- Coordonnées normalisées (0-1)
- Affichage des zones existantes avec numéro
- Suppression de zone avec touche Delete
- Couleurs différentes selon sélection

---

## ❌ À Implémenter

---

### 3. Quill Editor (Editor Page) ✅ FAIT

**Fichier :** `src/renderer/pages/Editor/ArticleForm.tsx`

**Ce qui a été fait :**
- ReactQuill intégré avec toolbar (bold, italic, underline, listes)
- CSS dark mode dans `index.css`
- Conversion texte → HTML dans transcription (paragraphes `<p>`)

---

### 4. Panzoom pour les Images ✅ FAIT

**Fichier :** `src/renderer/pages/Editor/index.tsx`

**Ce qui a été fait :**
- `@panzoom/panzoom` intégré
- Boutons Zoom +, Zoom -, Reset
- Wheel zoom activé

---

### 5. Stores Zustand ✅ FAIT

**Fichiers créés :**
- `src/renderer/stores/index.ts` - Export centralisé
- `src/renderer/stores/projectsStore.ts` - CRUD projets, loading, error
- `src/renderer/stores/extractionStore.ts` - Articles, zones, navigation PDF, export
- `src/renderer/stores/settingsStore.ts` - Configuration AI/app

**Ce qui a été fait :**
- État global centralisé avec Zustand
- Actions async avec gestion d'erreurs
- Selectors pour accès optimisé (`selectCurrentArticle`, `selectCurrentZones`)
- Intégration dans Projects, Extraction, Settings pages
- Persistance entre navigations de pages

---

### 6. Hooks Personnalisés

**Fichiers à créer :**
- `src/renderer/hooks/usePdfDocument.ts`
- `src/renderer/hooks/useKeyboardShortcuts.ts`
- `src/renderer/hooks/useAutoSave.ts`

**usePdfDocument :**
```typescript
export function usePdfDocument(pdfPath: string | null) {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!pdfPath) return

    setLoading(true)
    pdfjsLib.getDocument(`file://${pdfPath}`).promise
      .then(setPdfDoc)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [pdfPath])

  return { pdfDoc, loading, error }
}
```

**useKeyboardShortcuts :**
```typescript
export function useKeyboardShortcuts(shortcuts: Record<string, () => void>) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const key = `${e.ctrlKey ? 'Ctrl+' : ''}${e.key}`
      if (shortcuts[key]) {
        e.preventDefault()
        shortcuts[key]()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [shortcuts])
}
```

**useAutoSave :**
```typescript
export function useAutoSave(
  data: any,
  saveFn: () => Promise<void>,
  delay: number = 5000
) {
  const timeoutRef = useRef<NodeJS.Timeout>()

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    timeoutRef.current = setTimeout(saveFn, delay)

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [data, delay])
}
```

---

### 7. Composants Réutilisables ✅ N/A

**Note :** Utilisation de shadcn/ui - tous les composants de base sont déjà disponibles :
- `Dialog` pour les modales
- `Button` avec variants
- `ResizablePanelGroup` pour les panneaux
- `Tabs`, `Card`, `Input`, `Select`, `Tooltip`, etc.

---

### 8. Scripts Python

**Fichiers à copier/adapter :**
- `scripts/pdf_to_image.py`
- `scripts/generate_thumbnail.py`

**Vérifier :**
- Compatibilité des chemins avec la nouvelle structure
- Fonctionnement avec python-portable

---

### 9. Table des Matières (Editor) ✅ FAIT

**Fichier :** `src/renderer/pages/Editor/index.tsx` (onglet Sommaire)

---

### 10. Transcription par Lot ✅ FAIT

**Fichier :** `src/renderer/pages/Editor/index.tsx`

---

### 11. Génération de Thumbnails ✅ FAIT

**Fichier :** `src/main/ipc/projects.ts`

---

### 12. Navigation Drawer avec Sidebar ✅ FAIT

**Fichiers créés :**
- `src/renderer/components/layout/AppLayout.tsx` - Layout principal avec SidebarProvider
- `src/renderer/components/layout/NavigationDrawer.tsx` - Drawer collapsible avec shadcn Sidebar
- `src/renderer/components/layout/SettingsModal.tsx` - Paramètres en modale
- `src/renderer/components/layout/index.ts` - Exports
- `src/renderer/stores/uiStore.ts` - State UI (drawerCollapsed, settingsOpen)
- `src/renderer/hooks/use-mobile.ts` - Hook détection mobile (shadcn)

**Ce qui a été fait :**
- Drawer collapsible (icônes seules quand réduit)
- 3 sections de navigation :
  - **Accueil** (`/`) : Tous les projets
  - **Extraction** (`/extraction`) : Projets sans images exportées (status === 'new')
  - **Transcription** (`/transcription`) : Projets avec images exportées (status !== 'new')
- **Paramètres** accessible via modale depuis n'importe quelle page (plus de route `/settings`)
- Badge avec compteur de projets par catégorie
- État collapsed persisté dans localStorage
- Selectors dans projectsStore : `selectExtractionProjects`, `selectTranscriptionProjects`

**Routes modifiées :**
```tsx
<Routes>
  <Route element={<AppLayout />}>
    <Route path="/" element={<ProjectsPage filter="all" />} />
    <Route path="/extraction" element={<ProjectsPage filter="extraction" />} />
    <Route path="/transcription" element={<ProjectsPage filter="transcription" />} />
    <Route path="/extraction/:projectId" element={<ExtractionPage />} />
    <Route path="/editor/:projectId" element={<EditorPage />} />
  </Route>
</Routes>
```

---

### 13. Gestion des Erreurs

**À ajouter partout :**

1. **Toast/Notifications** pour les erreurs et succès
2. **Try/catch** dans tous les handlers IPC
3. **États d'erreur** dans les composants
4. **Fallbacks** quand les fichiers n'existent pas

---

### 14. Raccourcis Clavier

**À implémenter :**

| Raccourci | Action | Page |
|-----------|--------|------|
| `Ctrl+S` | Sauvegarder | Toutes |
| `Ctrl+O` | Ouvrir projet | Projects |
| `←` / `→` | Article précédent/suivant | Editor |
| `Ctrl+←` / `Ctrl+→` | Page PDF précédente/suivante | Extraction |
| `Escape` | Annuler sélection en cours | Extraction |
| `Delete` | Supprimer zone sélectionnée | Extraction |
| `Ctrl+,` | Ouvrir paramètres | Toutes |

---

### 15. Détection changements non sauvegardés ✅ PARTIELLEMENT FAIT

**Fichiers :**
- `src/renderer/pages/Editor/index.tsx`
- `src/renderer/pages/Editor/UnsavedChangesModal.tsx`
- `src/renderer/main.tsx` (modifié pour `createHashRouter`)

**Ce qui a été fait :**
- `useBlocker` pour intercepter la navigation React Router
- Modale avec 3 options : Sauvegarder / Quitter sans sauvegarder / Annuler
- Tracking des changements via comparaison `articles` vs `savedArticles`

**À faire :**
- Bloquer la fermeture de la fenêtre Electron (Alt+F4, bouton X)
- Utiliser `window.onbeforeunload` ou `BrowserWindow.on('close')` côté main

---

### 16. Modale de Transcription ✅ FAIT

**Fichier :** `src/renderer/pages/Editor/TranscriptionModal.tsx`

**Ce qui a été fait :**
- Modale bloquante pendant la transcription
- Pas de bouton X (hideCloseButton)
- Empêche Escape et clic extérieur

---

### 17. Fichier data.json unifié ✅ FAIT

**Fichier :** `src/main/ipc/extraction.ts`

**Ce qui a été fait :**
- Remplacé `save.json` / `export.json` par `data.json` unique
- `extraction:save` → écrit dans `data.json`
- `extraction:load` → lit depuis `data.json`
- `exportImages` → met à jour `data.json` avec les `imagePath`

---

### 18. Panneaux redimensionnables ✅ FAIT

**Fichier :** `src/renderer/pages/Editor/index.tsx`

**Ce qui a été fait :**
- `ResizablePanelGroup` / `ResizablePanel` / `ResizableHandle` de shadcn
- Onglets Editeur / Sommaire avec `Tabs`

---

### 19. Tests

**À créer (optionnel mais recommandé) :**

- `src/renderer/__tests__/` - Tests unitaires composants
- `e2e/` - Tests end-to-end avec Playwright

---

## Ordre de Priorité Recommandé

1. **PDF Viewer + Canvas** - Fonctionnalité core
2. **Stores Zustand** - Simplifie tout le reste
3. **Quill Editor** - UX importante
4. **Table des matières** - Navigation
5. **Panzoom** - Confort utilisateur
6. **Hooks** - Factorisation du code
7. **Composants** - Réutilisabilité
8. **Transcription par lot** - Gain de temps
9. **Raccourcis clavier** - Power users
10. **Tests** - Maintenance long terme

---

## Notes Techniques

### PDF.js Worker

Le worker PDF.js doit être configuré correctement :
```typescript
// Copier le worker dans public/ ou utiliser CDN
pdfjsLib.GlobalWorkerOptions.workerSrc =
  `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`
```

### Chemins de fichiers

Electron utilise des chemins absolus. Pour les images :
```typescript
// ✅ Correct
src={`file://${imagePath}`}

// ❌ Incorrect
src={imagePath}
```

### Context Isolation

Le preload expose `window.api`. Ne JAMAIS accéder à `require()` ou `node` depuis le renderer.

---

## Ressources

- [PDF.js Documentation](https://mozilla.github.io/pdf.js/)
- [React-Quill](https://github.com/zenoamaro/react-quill)
- [Zustand](https://github.com/pmndrs/zustand)
- [Panzoom](https://github.com/anvaka/panzoom)
- [Electron + Vite](https://electron-vite.org/)

---

*Dernière mise à jour : Janvier 2026*
