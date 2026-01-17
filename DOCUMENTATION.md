# ExtrAct - Documentation Produit

> Application desktop d'extraction et d'édition d'articles depuis des documents PDF

**Version actuelle :** 1.0.6

---

## Table des matières

1. [Présentation](#présentation)
2. [Stack Technique](#stack-technique)
3. [Fonctionnalités](#fonctionnalités)
4. [Architecture](#architecture)
5. [Flux de données](#flux-de-données)
6. [Structure des fichiers](#structure-des-fichiers)

---

## Présentation

**ExtrAct** est une application desktop conçue pour extraire et éditer des articles depuis des documents PDF. Elle offre une interface visuelle permettant de :

- Convertir des pages PDF en zones d'images représentant des articles
- Transcrire automatiquement les métadonnées des articles (titre, auteur, contenu) via l'IA
- Éditer les articles extraits avec un éditeur de texte riche
- Exporter les articles vers différents formats (PDF, DOCX, ZIP)

### Cas d'usage principal

L'application cible les utilisateurs qui ont besoin de numériser et structurer des articles provenant de revues, journaux ou magazines au format PDF, notamment pour :
- L'archivage documentaire
- La création de bases de données d'articles
- La numérisation de contenus imprimés

---

## Stack Technique

### Frontend
| Technologie | Version | Usage |
|-------------|---------|-------|
| Electron | 28.0.0 | Framework desktop |
| Bulma CSS | 0.9.4 | Framework UI |
| Quill | 2.0.2 | Éditeur de texte riche |
| PDF.js | 3.11.174 | Rendu PDF |
| Split.js | - | Panneaux redimensionnables |
| Panzoom | - | Zoom sur images |

### Backend (Main Process)
| Technologie | Usage |
|-------------|-------|
| Node.js | Runtime |
| Electron IPC | Communication inter-processus |
| Axios | Client HTTP (API IA) |
| pdf-lib | Manipulation PDF |
| PDFKit | Génération PDF |
| docx | Génération Word |
| adm-zip | Compression ZIP |

### Python (Scripts utilitaires)
| Bibliothèque | Usage |
|--------------|-------|
| PyMuPDF (fitz) | Extraction de pages PDF |
| Pillow (PIL) | Traitement d'images |

### Intégration IA
| Fournisseur | Modèles supportés |
|-------------|-------------------|
| OpenAI | GPT-4o, GPT-4, GPT-4 Turbo |
| Anthropic | Claude Opus 4, Claude Sonnet 4, etc. |

---

## Fonctionnalités

### 1. Gestion des Projets

#### Création de projet
- Import d'un fichier PDF source
- Génération automatique d'une miniature (première page)
- Attribution d'un nom personnalisé
- Stockage dans `%AppData%/Local/ExtrAct/projects/{projectId}/`

#### Liste des projets
- Affichage en grille avec miniatures
- Tri par date de modification, création ou nom
- Indicateur de statut et progression
- Statistiques (nombre d'articles, champs remplis)

#### Statuts de projet
| Statut | Description |
|--------|-------------|
| `new` | Projet créé, aucune extraction |
| `in_progress` | Extraction ou édition en cours |
| `extracted` | Articles extraits, édition possible |
| `completed` | Tous les champs remplis |

#### Import/Export
- Export ZIP complet du projet (backup)
- Import de projets depuis fichiers ZIP
- Suppression avec confirmation

---

### 2. Extraction d'Articles (Page Extraction)

#### Sélection visuelle
- Navigation page par page dans le PDF
- Dessin de zones rectangulaires sur le canvas
- Coordonnées normalisées (échelle 0-1) pour indépendance de résolution

#### Types de zones
| Type | Description |
|------|-------------|
| Zone unique | Un rectangle = un article |
| Zones multiples | Plusieurs zones combinées = un article |
| Page entière | Sélection rapide de toute la page |

#### Gestion des articles
- Liste en temps réel des articles sélectionnés
- Indicateur du nombre de zones par article
- Suppression d'articles ou de zones individuelles
- Mode "multi-zone" pour combiner des zones

#### Export des images
- Conversion des zones en images PNG via Python
- Combinaison verticale des zones multiples
- Sauvegarde automatique de la progression

---

### 3. Transcription IA

#### Configuration
- Choix du fournisseur (OpenAI ou Anthropic)
- Sélection du modèle spécifique
- Clés API configurables
- Prompts système personnalisables

#### Processus de transcription
- Envoi de l'image de l'article à l'API Vision
- Extraction structurée : titre, auteur, contenu
- Parsing JSON automatique des réponses
- Gestion des erreurs et formats de réponse variés

#### Modes de transcription
- **Article unique** : Transcrit l'article actuellement affiché
- **Transcription par lot** : Traite tous les articles séquentiellement

---

### 4. Éditeur d'Articles (Page Index)

#### Interface
- **Vue divisée** : Image de l'article (gauche) / Champs d'édition (droite)
- **Panneaux redimensionnables** avec Split.js
- **Zoom sur l'image** avec Panzoom

#### Champs éditables
| Champ | Type | Description |
|-------|------|-------------|
| Titre | Texte simple | Titre de l'article |
| Auteur | Texte simple | Nom de l'auteur |
| Contenu | Texte riche (HTML) | Corps de l'article |

#### Barre d'outils Quill
- Gras, italique, souligné
- Listes à puces et numérotées
- Effacer le formatage

#### Navigation
- Boutons flèches pour parcourir les articles
- Table des matières avec indicateur de complétion
- Sauvegarde automatique des modifications

---

### 5. Export des Articles

#### Format PDF
- Document formaté avec PDFKit
- Titre et auteur en en-tête de chaque article
- Séparateurs entre articles
- Texte justifié
- Pagination automatique

#### Format DOCX (Word)
- Document structuré avec la bibliothèque `docx`
- Styles de titre (Heading)
- Paragraphes formatés
- Alignement justifié

#### Format ZIP (Backup)
- Archive complète du projet
- Inclut : PDF source, métadonnées, images, exports JSON
- Idéal pour sauvegarde et partage

---

### 6. Paramètres

#### Configuration IA
- Sélection du fournisseur (OpenAI/Anthropic)
- Saisie et stockage sécurisé des clés API
- Choix du modèle parmi ceux disponibles
- Personnalisation du prompt système

#### Mises à jour automatiques
- Vérification des nouvelles versions
- Téléchargement automatique en arrière-plan
- Affichage de la progression (vitesse, taille)
- Installation manuelle contrôlée par l'utilisateur

#### Informations
- Version actuelle de l'application
- Lien vers le dépôt GitHub

---

## Architecture

### Structure du projet

```
ExtrAct V2/
├── main.js                 # Process principal Electron
├── preload.js              # Bridge IPC sécurisé
├── package.json            # Configuration npm
│
├── Pages HTML
│   ├── projects.html       # Liste des projets
│   ├── extraction.html     # Interface d'extraction
│   ├── index.html          # Éditeur d'articles
│   └── settings.html       # Paramètres
│
├── Renderers JavaScript
│   ├── projects-renderer.js
│   ├── extraction-renderer.js
│   ├── renderer.js
│   └── settings-renderer.js
│
├── Styles CSS
│   ├── visualisateur.css   # Thème sombre commun
│   ├── projects.css
│   └── settings.css
│
├── Scripts Python
│   ├── pdf_to_image.py     # Conversion zones → images
│   ├── generate_thumbnail.py
│   └── python-portable/    # Environnement Python embarqué
│
└── dist/                   # Application compilée
```

### Communication IPC

Le fichier `preload.js` expose des APIs sécurisées aux processus renderer :

| API | Fonctions |
|-----|-----------|
| `electronAPI` | Chargement/sauvegarde JSON, transcription IA |
| `settingsAPI` | Gestion des paramètres, mises à jour |
| `api` | Opérations projets, navigation, export |

### Sécurité

- **Context Isolation** : Activé
- **Node Integration** : Désactivé
- **IPC Bridge** : Communication via `contextBridge`
- **Clés API** : Stockage local dans settings.json

---

## Flux de données

### Création → Extraction → Édition → Export

```
┌─────────────────┐
│  Nouveau Projet │
│  (projects.html)│
└────────┬────────┘
         │ Upload PDF
         ▼
┌─────────────────┐
│   Extraction    │
│(extraction.html)│
└────────┬────────┘
         │ Sélection zones
         │ Export images
         ▼
┌─────────────────┐
│    Éditeur      │
│  (index.html)   │
└────────┬────────┘
         │ Transcription IA
         │ Édition manuelle
         ▼
┌─────────────────┐
│     Export      │
│ PDF / DOCX / ZIP│
└─────────────────┘
```

---

## Structure des fichiers projet

Chaque projet est stocké dans :
```
%AppData%/Local/ExtrAct/projects/{projectId}/
```

| Fichier | Description |
|---------|-------------|
| `metadata.json` | Informations du projet (nom, dates, statut) |
| `source.pdf` | PDF original |
| `thumbnail.png` | Miniature du projet |
| `save.json` | Progression de l'extraction |
| `export.json` | Données finales des articles |
| `images/` | Dossier des images d'articles |

### Format metadata.json
```json
{
  "id": "1234567890",
  "name": "Nom du projet",
  "originalFilename": "document.pdf",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "modifiedAt": "2024-01-02T00:00:00.000Z",
  "status": "in_progress",
  "articlesCount": 5,
  "filledFields": 12,
  "totalFields": 15
}
```

### Format export.json
```json
{
  "articles": [
    {
      "id": 1,
      "zones": [
        { "page": 1, "x1": 0.1, "y1": 0.2, "x2": 0.9, "y2": 0.8 }
      ],
      "title": "Titre de l'article",
      "author": "Nom de l'auteur",
      "content": "<p>Contenu HTML de l'article...</p>"
    }
  ]
}
```

---

## Raccourcis clavier

| Raccourci | Action |
|-----------|--------|
| `Ctrl + O` | Ouvrir l'extraction |
| `Ctrl + S` | Sauvegarder |
| `Ctrl + ,` | Ouvrir les paramètres |
| `←` / `→` | Article précédent/suivant (éditeur) |

---

## Notes de développement

### Environnement de développement
```bash
npm install          # Installer les dépendances
npm start            # Lancer en mode développement
npm run build        # Compiler pour Windows (NSIS)
npm run build:publish # Compiler et publier sur GitHub
```

### Configuration auto-update
- Provider : GitHub Releases
- Repository : `castelquent/extract`
- Protocole : HTTPS

---

*Documentation générée pour ExtrAct V2*
