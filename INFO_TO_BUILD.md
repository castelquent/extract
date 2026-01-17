# ExtrAct V2 - Procédure de Build

> Guide pour générer l'exécutable Windows (.exe)

---

## Prérequis

- **Node.js** : v18+ (recommandé v20 LTS)
- **npm** : v9+
- **Git** : Pour le versioning

---

## Structure du projet

```
ExtrAct V2/
├── src/                    # Code source V2 (le build se fait ICI)
│   ├── package.json        # Config npm + electron-builder
│   ├── main/               # Process Electron
│   ├── renderer/           # React app
│   ├── preload/            # Bridge IPC
│   └── shared/             # Types TypeScript
├── scripts/                # Scripts Python (pdf_to_image, generate_thumbnail)
├── python-portable/        # Python embarqué
└── ...docs
```

---

## Étapes de Build

### 1. Se placer dans le dossier src

```bash
cd "d:\ExtrAct V2\src"
```

### 2. Installer les dépendances

```bash
npm install
```

### 3. Build pour Windows

```bash
npm run build:win
```

Cette commande exécute :
1. `tsc` - Compile TypeScript
2. `vite build` - Bundle l'app React
3. `electron-builder --win` - Génère l'exécutable

### 4. Résultat

L'exécutable se trouve dans :
```
src/release/
├── ExtrAct Setup X.X.X.exe    # Installateur NSIS
└── win-unpacked/              # Version portable
```

---

## Scripts disponibles

| Commande | Description |
|----------|-------------|
| `npm run dev` | Lance Vite en mode dev |
| `npm run electron:dev` | Lance l'app en dev (Vite + Electron) |
| `npm run build` | Build complet (sans publish) |
| `npm run build:win` | Build Windows uniquement |
| `npm run typecheck` | Vérifie les types TypeScript |

---

## Avant de builder : Checklist

1. **Vérifier la version** dans `src/package.json` :
   ```json
   "version": "2.0.0"
   ```

2. **Vérifier que les scripts Python sont dans `scripts/`** :
   - `scripts/pdf_to_image.py`
   - `scripts/generate_thumbnail.py`

3. **Vérifier que `python-portable/` existe** à la racine

4. **Vérifier l'icône** dans `src/build/icon.ico`

---

## Configuration electron-builder

Dans `src/package.json` :

```json
{
  "build": {
    "appId": "com.extract.app",
    "productName": "ExtrAct",
    "directories": {
      "output": "release"
    },
    "files": [
      "dist-electron",
      "dist"
    ],
    "extraResources": [
      {
        "from": "python-portable",
        "to": "python-portable"
      },
      {
        "from": "scripts",
        "to": "scripts"
      }
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

---

## Dépannage

### Erreur "python-portable not found"

Les chemins dans `extraResources` sont configurés avec `../` pour pointer vers la racine :
- `"from": "../python-portable"` → cherche dans `ExtrAct V2/python-portable/`
- `"from": "../scripts"` → cherche dans `ExtrAct V2/scripts/`

Vérifie que ces dossiers existent bien à la racine du projet.

### Erreur TypeScript

```bash
npm run typecheck
```
Corrige les erreurs avant de builder.

### Erreur de build Electron

Supprime les caches et réinstalle :
```bash
rm -rf node_modules dist dist-electron release
npm install
npm run build:win
```

---

## Publier une release (auto-update)

Pour que l'auto-updater fonctionne :

1. **Ajouter le script dans `package.json`** :
   ```json
   "build:publish": "tsc && vite build && electron-builder --win --publish always"
   ```

2. **Configurer le token GitHub** :
   ```bash
   set GH_TOKEN=your_github_token
   npm run build:publish
   ```

3. Une release sera créée automatiquement sur GitHub

---

## Nettoyage des fichiers V1

Ces fichiers à la racine peuvent être supprimés :

```
main.js
preload.js
renderer.js
extraction-renderer.js
projects-renderer.js
settings-renderer.js
index.html
extraction.html
projects.html
settings.html
visualisateur.css
projects.css
settings.css
article_1.png
START_ELECTRON.bat
nul
dist/
node_modules/  (à la racine, pas celui dans src/)
package.json   (à la racine, pas celui dans src/)
package-lock.json (à la racine)
```

---

*Dernière mise à jour : Janvier 2025*
