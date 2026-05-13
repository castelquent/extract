// Filesystem watchers for the v2 project hierarchy.
//
// Watches %AppData%/Local/ExtrAct/projects/ recursively and emits two events
// to the renderer:
//   - 'v2:fs:projectsListChanged'    (top-level project folders changed)
//   - 'v2:fs:projectChanged' + id    (something inside a specific project changed)
//
// Both events are debounced (250ms) to coalesce burst writes (multi-file
// imports, batch article creation, etc.).
import { app, type BrowserWindow } from 'electron'
import chokidar, { type FSWatcher } from 'chokidar'
import { existsSync, mkdirSync } from 'fs'
import { join, relative, sep } from 'path'

const DEBOUNCE_MS = 250

let watcher: FSWatcher | null = null
let projectsListDebounce: NodeJS.Timeout | null = null
const projectDebounces = new Map<string, NodeJS.Timeout>()

const getProjectsRoot = (): string => {
  const root = join(app.getPath('userData'), 'projects')
  if (!existsSync(root)) mkdirSync(root, { recursive: true })
  return root
}

// Figure out which projectId a changed path belongs to (top-level folder
// directly under projects/), or null if the path is the projects/ root itself
// (which we treat as a list-level change).
const projectIdForPath = (path: string, projectsRoot: string): string | null => {
  const rel = relative(projectsRoot, path)
  if (!rel || rel.startsWith('..')) return null
  const first = rel.split(sep)[0]
  return first || null
}

const scheduleListEvent = (win: BrowserWindow | null): void => {
  if (projectsListDebounce) clearTimeout(projectsListDebounce)
  projectsListDebounce = setTimeout(() => {
    win?.webContents.send('v2:fs:projectsListChanged')
    projectsListDebounce = null
  }, DEBOUNCE_MS)
}

const scheduleProjectEvent = (projectId: string, win: BrowserWindow | null): void => {
  const existing = projectDebounces.get(projectId)
  if (existing) clearTimeout(existing)
  const timer = setTimeout(() => {
    win?.webContents.send('v2:fs:projectChanged', projectId)
    projectDebounces.delete(projectId)
  }, DEBOUNCE_MS)
  projectDebounces.set(projectId, timer)
}

export function setupFsWatchers(getWindow: () => BrowserWindow | null): void {
  if (watcher) return
  const projectsRoot = getProjectsRoot()

  watcher = chokidar.watch(projectsRoot, {
    persistent: true,
    ignoreInitial: true,            // we already read state lazily on demand
    depth: 5,                       // project / sources|dossiers|orphans / {id} / articles / {id}
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 50,
    },
  })

  const handle = (changedPath: string): void => {
    const win = getWindow()
    const projectId = projectIdForPath(changedPath, projectsRoot)
    if (projectId) {
      // Any change inside a project folder bumps that project (and counts in
      // the projects list may have changed too).
      scheduleProjectEvent(projectId, win)
      scheduleListEvent(win)
    } else {
      // Direct child of projects/ added/removed/renamed.
      scheduleListEvent(win)
    }
  }

  watcher
    .on('add', handle)
    .on('addDir', handle)
    .on('change', handle)
    .on('unlink', handle)
    .on('unlinkDir', handle)
    .on('error', (err) => console.error('FS watcher error:', err))
}

export function teardownFsWatchers(): Promise<void> {
  const w = watcher
  watcher = null
  if (projectsListDebounce) clearTimeout(projectsListDebounce)
  for (const t of projectDebounces.values()) clearTimeout(t)
  projectDebounces.clear()
  if (!w) return Promise.resolve()
  return w.close()
}
