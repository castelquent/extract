const { app, BrowserWindow, ipcMain, dialog, Menu, protocol } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

// Configuration du logger pour auto-updater
autoUpdater.autoDownload = false; // Ne pas télécharger automatiquement
autoUpdater.autoInstallOnAppQuit = true;

// Events auto-updater - envoyer aux bonnes fenêtres
autoUpdater.on('update-available', (info) => {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('update-available', info);
  }
  if (mainWindow) {
    mainWindow.webContents.send('update-available', info);
  }
});

autoUpdater.on('update-not-available', (info) => {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('update-not-available', info);
  }
  if (mainWindow) {
    mainWindow.webContents.send('update-not-available', info);
  }
});

autoUpdater.on('download-progress', (progressObj) => {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('update-download-progress', progressObj);
  }
  if (mainWindow) {
    mainWindow.webContents.send('update-download-progress', progressObj);
  }
});

autoUpdater.on('update-downloaded', (info) => {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('update-downloaded', info);
  }
  if (mainWindow) {
    mainWindow.webContents.send('update-downloaded', info);
  }
});

autoUpdater.on('error', (err) => {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('update-error', err.message);
  }
  if (mainWindow) {
    mainWindow.webContents.send('update-error', err.message);
  }
});

let mainWindow;
let settingsWindow = null;
let extractionWindow = null;

// Fonction pour obtenir le chemin Python
function getPythonPath() {
  if (app.isPackaged) {
    // En production: utiliser Python bundlé
    return path.join(process.resourcesPath, 'python-portable', 'python.exe');
  } else {
    // En dev: utiliser Python portable local
    return path.join(__dirname, 'python-portable', 'python.exe');
  }
}

// Fonction pour obtenir le chemin d'un script Python
function getPythonScriptPath(scriptName) {
  if (app.isPackaged) {
    // En production: les scripts Python sont dans extraResources
    return path.join(process.resourcesPath, scriptName);
  } else {
    // En dev: les scripts sont dans __dirname
    return path.join(__dirname, scriptName);
  }
}

// Menu pour la page Projects
function setProjectsMenu() {
  const template = [
    {
      label: 'Fichier',
      submenu: [
        {
          label: 'Nouveau Projet',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            mainWindow.webContents.send('trigger-new-project');
          }
        },
        {
          label: 'Importer un Projet',
          accelerator: 'CmdOrCtrl+I',
          click: () => {
            mainWindow.webContents.send('trigger-import-project');
          }
        },
        { type: 'separator' },
        {
          label: 'Quitter',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Affichage',
      submenu: [
        {
          label: 'Rafraîchir la liste',
          accelerator: 'F5',
          click: () => {
            mainWindow.webContents.send('refresh-projects');
          }
        },
        {
          label: 'Recharger la page',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            mainWindow.reload();
          }
        },
        {
          label: 'DevTools',
          accelerator: 'F12',
          click: () => {
            mainWindow.webContents.toggleDevTools();
          }
        }
      ]
    },
    {
      label: 'Paramètres',
      submenu: [
        {
          label: 'Préférences',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            createSettingsWindow();
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Menu pour la page Extraction
function setExtractionMenu() {
  const template = [
    {
      label: 'Fichier',
      submenu: [
        {
          label: 'Retour aux Projets',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            setProjectsMenu();
            mainWindow.loadFile('projects.html');
          }
        },
        {
          label: 'Sauvegarder',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            mainWindow.webContents.send('save-json');
          }
        },
        { type: 'separator' },
        {
          label: 'Quitter',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Affichage',
      submenu: [
        {
          label: 'Recharger',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            mainWindow.reload();
          }
        },
        {
          label: 'DevTools',
          accelerator: 'F12',
          click: () => {
            mainWindow.webContents.toggleDevTools();
          }
        }
      ]
    },
    {
      label: 'Paramètres',
      submenu: [
        {
          label: 'Préférences',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            createSettingsWindow();
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Menu pour la page Éditeur
function setEditorMenu() {
  const template = [
    {
      label: 'Fichier',
      submenu: [
        {
          label: 'Retour aux Projets',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            setProjectsMenu();
            mainWindow.loadFile('projects.html');
          }
        },
        {
          label: 'Sauvegarder',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            mainWindow.webContents.send('save-json');
          }
        },
        { type: 'separator' },
        {
          label: 'Quitter',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Affichage',
      submenu: [
        {
          label: 'Recharger',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            mainWindow.reload();
          }
        },
        {
          label: 'DevTools',
          accelerator: 'F12',
          click: () => {
            mainWindow.webContents.toggleDevTools();
          }
        }
      ]
    },
    {
      label: 'Paramètres',
      submenu: [
        {
          label: 'Préférences',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            createSettingsWindow();
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Créer le menu par défaut (page Projects)
  setProjectsMenu();

  // Load projects page as default
  mainWindow.loadFile('projects.html');

  // Ouvrir DevTools en dev
  // mainWindow.webContents.openDevTools();
}

function createSettingsWindow() {
  // Si la fenêtre existe déjà, la focus
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 700,
    height: 600,
    parent: mainWindow,
    modal: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  settingsWindow.loadFile('settings.html');
  settingsWindow.setMenu(null);

  // Ouvrir DevTools pour debug
  settingsWindow.webContents.openDevTools();

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function createExtractionWindow(projectId) {
  // Si la fenêtre existe déjà, la focus
  if (extractionWindow) {
    extractionWindow.focus();
    // Envoyer le projectId à la fenêtre existante
    if (projectId) {
      extractionWindow.webContents.send('load-project', projectId);
    }
    return;
  }

  extractionWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  extractionWindow.loadFile('extraction.html');

  // Envoyer le projectId une fois la page chargée
  if (projectId) {
    extractionWindow.webContents.once('did-finish-load', () => {
      extractionWindow.webContents.send('load-project', projectId);
    });
  }

  extractionWindow.on('closed', () => {
    extractionWindow = null;
  });
}

// Fonction pour charger le JSON
async function loadJSONFile() {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'JSON Files', extensions: ['json'] }
    ]
  });

  if (result.canceled) {
    return null;
  }

  const filePath = result.filePaths[0];
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(fileContent);

  return {
    filePath: filePath,
    data: data
  };
}

app.whenReady().then(() => {
  // Enregistrer le protocole pour accéder aux fichiers des projets
  protocol.registerFileProtocol('scantools-project', (request, callback) => {
    const url = request.url.replace('scantools-project://', '');
    const parts = url.split('/');
    const projectId = parts[0];
    const fileName = parts.slice(1).join('/');

    const projectPath = getProjectPath(projectId);
    const filePath = path.join(projectPath, fileName);

    callback({ path: filePath });
  });

  createWindow();
  mainWindow.maximize();

  // Vérifier les mises à jour au démarrage (après 3 secondes)
  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates();
    }, 3000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handler pour charger le JSON (gardé pour compatibilité avec le bouton)
ipcMain.handle('load-json', async () => {
  return await loadJSONFile();
});

// Handler pour sauvegarder le JSON
ipcMain.handle('save-json-file', async (event, data) => {
  const { filePath, jsonData, projectId } = data;

  try {
    let savePath = filePath;

    if (projectId) {
      // Save to project export.json
      const projectPath = getProjectPath(projectId);
      savePath = path.join(projectPath, 'export.json');

      // Sauvegarder d'abord le fichier
      fs.writeFileSync(savePath, JSON.stringify(jsonData, null, 2), 'utf-8');

      // Update project status and modification date dans metadata.json
      const statusInfo = detectProjectStatus(projectId);
      updateProjectMetadata(projectId, {
        status: statusInfo.status,
        stats: statusInfo.stats,
        dateModified: new Date().toISOString()
      });
    } else {
      fs.writeFileSync(savePath, JSON.stringify(jsonData, null, 2), 'utf-8');
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Charger les paramètres
ipcMain.handle('load-settings', async () => {
  const userDataPath = app.getPath('userData');
  const settingsPath = path.join(userDataPath, 'settings.json');

  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf-8');
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    console.error('Erreur lors du chargement des paramètres:', error);
    return null;
  }
});

// Sauvegarder les paramètres
ipcMain.handle('save-settings', async (event, settings) => {
  const userDataPath = app.getPath('userData');
  const settingsPath = path.join(userDataPath, 'settings.json');

  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Fermer la fenêtre de paramètres
ipcMain.handle('close-settings-window', () => {
  if (settingsWindow) {
    settingsWindow.close();
  }
});

// ==================== AUTO-UPDATE ====================

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('check-for-updates', async () => {
  try {
    console.log('Checking for updates...');
    const result = await autoUpdater.checkForUpdates();
    console.log('Update check result:', result);
    return { success: true, updateInfo: result ? result.updateInfo : null };
  } catch (error) {
    console.error('Update check error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('download-update', () => {
  autoUpdater.downloadUpdate();
});

ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall();
});

// ==================== PROJECT MANAGEMENT ====================

// Helper functions for project management
function getProjectsFilePath() {
  return path.join(app.getPath('userData'), 'projects.json');
}

function getProjectsDir() {
  return path.join(app.getPath('userData'), 'projects');
}

function getProjectPath(projectId) {
  return path.join(getProjectsDir(), projectId.toString());
}

function loadProjectsIndex() {
  const projectsFile = getProjectsFilePath();

  try {
    if (fs.existsSync(projectsFile)) {
      const data = fs.readFileSync(projectsFile, 'utf-8');
      const parsed = JSON.parse(data);
      // Support ancien format (avec objets) et nouveau format (juste IDs)
      if (Array.isArray(parsed.projects) && parsed.projects.length > 0) {
        if (typeof parsed.projects[0] === 'string') {
          // Nouveau format: juste les IDs
          return parsed.projects;
        } else {
          // Ancien format: objets complets, extraire les IDs
          return parsed.projects.map(p => p.id);
        }
      }
      return parsed.projects || [];
    }
  } catch (error) {
    console.error('Erreur lors du chargement de projects.json:', error);
  }

  // Retourner tableau vide si fichier n'existe pas ou erreur
  return [];
}

function saveProjectsIndex(projectIds) {
  const projectsFile = getProjectsFilePath();

  try {
    // Créer le dossier userData si nécessaire
    const userDataPath = app.getPath('userData');
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }

    // Sauvegarder juste les IDs
    const data = { projects: projectIds };
    fs.writeFileSync(projectsFile, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Erreur lors de la sauvegarde de projects.json:', error);
    return false;
  }
}

// Charger les métadonnées d'un projet depuis son metadata.json
function loadProjectMetadata(projectId) {
  try {
    const projectPath = getProjectPath(projectId);
    const metadataPath = path.join(projectPath, 'metadata.json');

    if (fs.existsSync(metadataPath)) {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      return metadata;
    }

    // Si pas de metadata.json, retourner métadonnées par défaut
    console.warn(`Pas de metadata.json pour le projet ${projectId}`);
    return {
      id: projectId,
      name: `Projet ${projectId}`,
      dateAdded: new Date().toISOString(),
      dateModified: new Date().toISOString(),
      status: 'unknown'
    };
  } catch (error) {
    console.error(`Erreur chargement metadata pour ${projectId}:`, error);
    return null;
  }
}

// Helper pour mettre à jour le metadata.json d'un projet
function updateProjectMetadata(projectId, updates) {
  try {
    const projectPath = getProjectPath(projectId);
    const metadataPath = path.join(projectPath, 'metadata.json');

    if (fs.existsSync(metadataPath)) {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      Object.assign(metadata, updates);
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
      return true;
    }
    return false;
  } catch (error) {
    console.error('Erreur mise à jour metadata:', error);
    return false;
  }
}

// Helper pour vérifier si le contenu HTML est vraiment vide (ignore <p><br></p> de Quill)
function isContentEmpty(content) {
  if (!content) return true;
  const trimmed = content.trim();
  if (!trimmed) return true;
  // Quill initialise avec <p><br></p> même quand vide
  if (trimmed === '<p><br></p>') return true;
  // Variantes possibles
  if (trimmed === '<p></p>') return true;
  if (trimmed === '<br>') return true;
  // Supprimer toutes les balises HTML et vérifier si du texte reste
  const textOnly = trimmed.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
  return textOnly.length === 0;
}

function detectProjectStatus(projectId) {
  const projectPath = getProjectPath(projectId);
  const exportJsonPath = path.join(projectPath, 'export.json');
  const saveJsonPath = path.join(projectPath, 'save.json');
  const imagesDir = path.join(projectPath, 'images');

  // Vérifier si export terminé avec images
  if (fs.existsSync(exportJsonPath) && fs.existsSync(imagesDir)) {
    try {
      const exportData = JSON.parse(fs.readFileSync(exportJsonPath, 'utf-8'));
      const articles = exportData.articles || [];

      if (articles.length === 0) {
        return { status: 'extracted', stats: { articleCount: 0 } };
      }

      // Calculer nombre total de champs et champs remplis
      const totalFields = articles.length * 3; // titre, auteur, contenu pour chaque article
      let filledFields = 0;

      articles.forEach(article => {
        if (article.titre && article.titre.trim()) filledFields++;
        if (article.auteur && article.auteur.trim()) filledFields++;
        if (!isContentEmpty(article.contenu)) filledFields++;
      });

      // Si tous les champs sont remplis → completed
      if (filledFields === totalFields) {
        return {
          status: 'completed',
          stats: { articleCount: articles.length, filledFields, totalFields }
        };
      }

      // Si au moins un champ est rempli → in_progress
      if (filledFields > 0) {
        return {
          status: 'in_progress',
          stats: { articleCount: articles.length, filledFields, totalFields }
        };
      }

      // Sinon, juste extrait
      return {
        status: 'extracted',
        stats: { articleCount: articles.length }
      };
    } catch (e) {
      console.error('Erreur lecture export.json:', e);
      return { status: 'extracted', stats: {} };
    }
  }

  // Vérifier si extraction en cours (save.json existe)
  if (fs.existsSync(saveJsonPath)) {
    return { status: 'in_progress', stats: {} };
  }

  // Sinon, nouveau projet
  return { status: 'new', stats: {} };
}

// Helper pour comparer deux ensembles de zones (pour fusion des transcriptions)
function zonesAreEqual(zones1, zones2, tolerance = 0.01) {
  if (!zones1 || !zones2) return false;
  if (zones1.length !== zones2.length) return false;

  return zones1.every((z1, i) => {
    const z2 = zones2[i];
    return z1.page === z2.page &&
      Math.abs(z1.x1 - z2.x1) < tolerance &&
      Math.abs(z1.y1 - z2.y1) < tolerance &&
      Math.abs(z1.x2 - z2.x2) < tolerance &&
      Math.abs(z1.y2 - z2.y2) < tolerance;
  });
}

// IPC Handlers pour les projets

// Obtenir la liste de tous les projets
ipcMain.handle('get-projects', async () => {
  try {
    const projectIds = loadProjectsIndex();

    // Charger les métadonnées de chaque projet depuis son metadata.json
    const projects = projectIds.map(projectId => {
      const metadata = loadProjectMetadata(projectId);
      if (!metadata) return null;

      // Détecter le statut actuel en vérifiant les fichiers
      const statusInfo = detectProjectStatus(projectId);

      // Mettre à jour le metadata.json avec le statut détecté
      const updatedMetadata = {
        ...metadata,
        status: statusInfo.status,
        stats: statusInfo.stats
      };

      // Sauvegarder les stats/statut mis à jour dans le metadata.json
      updateProjectMetadata(projectId, {
        status: statusInfo.status,
        stats: statusInfo.stats
      });

      return updatedMetadata;
    }).filter(p => p !== null);

    return { success: true, projects };
  } catch (error) {
    console.error('Erreur get-projects:', error);
    return { success: false, error: error.message };
  }
});

// Créer un nouveau projet
ipcMain.handle('create-project', async (event, pdfPath, customName) => {
  try {
    const projectIds = loadProjectsIndex();

    // Générer un ID unique basé sur timestamp
    const projectId = Date.now().toString();
    const projectPath = getProjectPath(projectId);

    // Créer le dossier du projet
    fs.mkdirSync(projectPath, { recursive: true });

    // Copier le PDF dans le dossier du projet
    const sourcePdfPath = path.join(projectPath, 'source.pdf');
    fs.copyFileSync(pdfPath, sourcePdfPath);

    // Générer la miniature de la première page
    const thumbnailPath = path.join(projectPath, 'thumbnail.png');
    const thumbnailConfig = {
      pdfPath: sourcePdfPath,
      outputPath: thumbnailPath,
      width: 300
    };

    const tempConfigPath = path.join(projectPath, 'temp_thumbnail_config.json');
    fs.writeFileSync(tempConfigPath, JSON.stringify(thumbnailConfig, null, 2));

    try {
      const { execSync } = require('child_process');
      const pythonScript = getPythonScriptPath('generate_thumbnail.py');
      const pythonExe = getPythonPath();

      execSync(`"${pythonExe}" "${pythonScript}" "${tempConfigPath}"`, {
        stdio: 'inherit',
        windowsHide: true
      });
    } catch (thumbnailError) {
      console.error('Erreur génération miniature:', thumbnailError);
      // Ne pas bloquer la création du projet si la miniature échoue
    } finally {
      if (fs.existsSync(tempConfigPath)) {
        fs.unlinkSync(tempConfigPath);
      }
    }

    // Extraire le nom du fichier sans extension
    const originalFilename = path.basename(pdfPath);
    const projectName = customName || path.basename(pdfPath, '.pdf');

    // Créer l'entrée du projet
    const now = new Date().toISOString();
    const project = {
      id: projectId,
      name: projectName,
      originalFilename: originalFilename,
      dateAdded: now,
      dateModified: now,
      status: 'new'
    };

    // Créer le metadata.json dans le dossier du projet
    const metadataPath = path.join(projectPath, 'metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(project, null, 2));

    // Ajouter juste l'ID à la liste
    projectIds.push(projectId);

    // Sauvegarder
    saveProjectsIndex(projectIds);

    return { success: true, project };
  } catch (error) {
    console.error('Erreur create-project:', error);
    return { success: false, error: error.message };
  }
});

// Supprimer un projet
ipcMain.handle('delete-project', async (event, projectId) => {
  try {
    const projectIds = loadProjectsIndex();
    const projectPath = getProjectPath(projectId);

    // Supprimer le dossier du projet
    if (fs.existsSync(projectPath)) {
      fs.rmSync(projectPath, { recursive: true, force: true });
    }

    // Retirer l'ID de la liste
    const updatedIds = projectIds.filter(id => id !== projectId);

    // Sauvegarder
    saveProjectsIndex(updatedIds);

    return { success: true };
  } catch (error) {
    console.error('Erreur delete-project:', error);
    return { success: false, error: error.message };
  }
});

// Renommer un projet
ipcMain.handle('rename-project', async (event, { projectId, newName }) => {
  try {
    // Vérifier que le projet existe
    const projectPath = getProjectPath(projectId);
    const metadataPath = path.join(projectPath, 'metadata.json');

    if (!fs.existsSync(metadataPath)) {
      return { success: false, error: 'Projet non trouvé' };
    }

    // Charger et mettre à jour le metadata.json
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    metadata.name = newName;
    metadata.dateModified = new Date().toISOString();
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    return { success: true, project: metadata };
  } catch (error) {
    console.error('Erreur rename-project:', error);
    return { success: false, error: error.message };
  }
});

// Obtenir les détails d'un projet
ipcMain.handle('get-project-details', async (event, projectId) => {
  try {
    // Charger les métadonnées du projet
    const project = loadProjectMetadata(projectId);

    if (!project) {
      return { success: false, error: 'Projet non trouvé' };
    }

    const projectPath = getProjectPath(projectId);
    const sourcePdfPath = path.join(projectPath, 'source.pdf');
    const saveJsonPath = path.join(projectPath, 'save.json');
    const exportJsonPath = path.join(projectPath, 'export.json');

    // Mettre à jour le statut
    const statusInfo = detectProjectStatus(projectId);
    project.status = statusInfo.status;
    project.stats = statusInfo.stats;

    // Sauvegarder les stats/statut mis à jour dans le metadata.json
    updateProjectMetadata(projectId, {
      status: statusInfo.status,
      stats: statusInfo.stats
    });

    const details = {
      ...project,
      paths: {
        projectDir: projectPath,
        sourcePdf: sourcePdfPath,
        saveJson: saveJsonPath,
        exportJson: exportJsonPath,
        imagesDir: path.join(projectPath, 'images')
      }
    };

    return { success: true, project: details };
  } catch (error) {
    console.error('Erreur get-project-details:', error);
    return { success: false, error: error.message };
  }
});

// Mettre à jour le statut d'un projet
ipcMain.handle('update-project-status', async (event, { projectId, status }) => {
  try {
    // Mettre à jour directement le metadata.json
    const updated = updateProjectMetadata(projectId, {
      status,
      dateModified: new Date().toISOString()
    });

    if (!updated) {
      return { success: false, error: 'Projet non trouvé' };
    }

    // Charger le metadata mis à jour pour le retourner
    const project = loadProjectMetadata(projectId);

    return { success: true, project };
  } catch (error) {
    console.error('Erreur update-project-status:', error);
    return { success: false, error: error.message };
  }
});

// Navigation handlers
ipcMain.on('open-settings', () => {
  createSettingsWindow();
});

ipcMain.on('open-extraction', (event, projectId) => {
  if (mainWindow) {
    // Changer le menu pour l'extraction
    setExtractionMenu();
    // Charger extraction.html dans la fenêtre principale
    mainWindow.loadFile('extraction.html');
    // Puis envoyer le projectId une fois chargé
    if (projectId) {
      mainWindow.webContents.once('did-finish-load', () => {
        mainWindow.webContents.send('load-project', projectId);
      });
    }
    mainWindow.focus();
  }
});

ipcMain.on('open-editor', (event, projectId) => {
  if (mainWindow) {
    // Changer le menu pour l'éditeur
    setEditorMenu();
    // Charger index.html
    mainWindow.loadFile('index.html');
    // Puis envoyer le projectId une fois chargé
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.send('load-project-editor', projectId);
    });
    mainWindow.focus();
  }
});

ipcMain.on('navigate-to-projects', () => {
  if (mainWindow) {
    // Changer le menu pour la page projets
    setProjectsMenu();
    mainWindow.loadFile('projects.html');
  }
});

// Fonction pour appeler OpenAI Vision API
async function callOpenAI(base64Image, apiKey, model, systemPrompt) {
  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: model,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ]
        }
      ]
    },
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    }
  );

  const content = response.data.choices[0].message.content;
  console.log('OpenAI response:', content);

  try {
    return JSON.parse(content);
  } catch (e) {
    // Retirer les balises markdown si présentes
    let cleanContent = content.trim();
    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent.replace(/^```json\n/, '').replace(/\n```$/, '');
    } else if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.replace(/^```\n/, '').replace(/\n```$/, '');
    }

    // Essayer de parser le contenu nettoyé
    try {
      return JSON.parse(cleanContent);
    } catch (e2) {
      // Si ça échoue encore, essayer d'extraire le JSON du texte
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('Réponse non-JSON: ' + content);
    }
  }
}

// Détecter le type MIME d'une image depuis son buffer
function detectImageMimeType(buffer) {
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'image/jpeg';
  }
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'image/png';
  }
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return 'image/gif';
  }
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
    return 'image/webp';
  }
  return 'image/jpeg'; // Fallback
}

// Fonction pour appeler Anthropic Vision API
async function callAnthropic(base64Image, apiKey, model, systemPrompt, mediaType) {
  console.log('Anthropic model:', model);
  console.log('Image size:', base64Image.length);
  console.log('Media type:', mediaType);

  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: model,
      max_tokens: 16384,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Image
              }
            },
            {
              type: 'text',
              text: systemPrompt
            }
          ]
        }
      ]
    },
    {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      }
    }
  );

  const content = response.data.content[0].text;
  console.log('Anthropic response:', content);

  try {
    return JSON.parse(content);
  } catch (e) {
    // Retirer les balises markdown si présentes
    let cleanContent = content.trim();
    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent.replace(/^```json\n/, '').replace(/\n```$/, '');
    } else if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.replace(/^```\n/, '').replace(/\n```$/, '');
    }

    // Essayer de parser le contenu nettoyé
    try {
      return JSON.parse(cleanContent);
    } catch (e2) {
      // Si ça échoue encore, essayer d'extraire le JSON du texte
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('Réponse non-JSON: ' + content);
    }
  }
}

// Handler pour transcription d'image
ipcMain.handle('transcribe-image', async (event, data) => {
  const { imagePath, settings } = data;

  try {
    // Vérifier que les settings sont configurés
    if (!settings || !settings.ai) {
      return { success: false, error: 'Paramètres IA non configurés' };
    }

    const provider = settings.ai.provider;
    const prompt = settings.ai.prompt || 'Analyse cette image d\'article et retourne un JSON avec cette structure exacte: {"titre": "titre de l\'article", "auteur": "nom de l\'auteur", "contenu": "<p>contenu en HTML</p>"}';

    // Lire l'image et la convertir en base64
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const mediaType = detectImageMimeType(imageBuffer);

    let result;

    if (provider === 'openai') {
      const apiKey = settings.ai.openai_api_key;
      const model = settings.ai.openai_model || 'gpt-4o';

      if (!apiKey) {
        return { success: false, error: 'Clé API OpenAI non configurée' };
      }

      result = await callOpenAI(base64Image, apiKey, model, prompt);
    } else if (provider === 'anthropic') {
      const apiKey = settings.ai.anthropic_api_key;
      const model = settings.ai.anthropic_model || 'claude-sonnet-4-20250514';

      if (!apiKey) {
        return { success: false, error: 'Clé API Anthropic non configurée' };
      }

      result = await callAnthropic(base64Image, apiKey, model, prompt, mediaType);
    } else {
      return { success: false, error: 'Provider non supporté: ' + provider };
    }

    return { success: true, data: result };
  } catch (error) {
    console.error('Erreur lors de la transcription:', error);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
      return { success: false, error: `API Error ${error.response.status}: ${JSON.stringify(error.response.data)}` };
    }
    return { success: false, error: error.message };
  }
});

// Handler pour l'extraction PDF
ipcMain.handle('extract-pdf', async (event, params) => {
  const { pdfPath, confidenceThreshold, padding } = params;

  try {
    // Pour l'instant, on va juste appeler le script Python
    // Tu devras adapter cette partie selon ton setup Python
    const { spawn } = require('child_process');
    const pythonScript = path.join(__dirname, '..', 'app.py');
    const pythonExe = getPythonPath();

    return new Promise((resolve, reject) => {
      const python = spawn(pythonExe, [
        pythonScript,
        pdfPath,
        '--confidence', confidenceThreshold.toString(),
        '--padding', padding.toString()
      ]);

      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
        console.log('Python stdout:', data.toString());
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
        console.error('Python stderr:', data.toString());
      });

      python.on('close', (code) => {
        if (code === 0) {
          // Extraction réussie
          const baseName = path.basename(pdfPath, '.pdf');
          const dirName = path.dirname(pdfPath);
          const outputPath = path.join(dirName, `${baseName}.json`);
          const imagesPath = path.join(dirName, 'images');

          // Compter les articles dans le JSON
          let articleCount = 0;
          try {
            const jsonData = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
            articleCount = jsonData.articles ? jsonData.articles.length : 0;
          } catch (e) {
            console.error('Erreur lors de la lecture du JSON:', e);
          }

          resolve({
            success: true,
            articleCount: articleCount,
            outputPath: outputPath,
            imagesPath: imagesPath
          });
        } else {
          reject(new Error(`Erreur Python (code ${code}): ${stderr}`));
        }
      });

      python.on('error', (err) => {
        reject(new Error(`Erreur lors du lancement de Python: ${err.message}`));
      });
    });
  } catch (error) {
    console.error('Erreur lors de l\'extraction PDF:', error);
    return { success: false, error: error.message };
  }
});

// Handler pour charger un PDF
ipcMain.handle('load-pdf', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return { filePath: result.filePaths[0] };
});

// Handler pour sauvegarder la progression
ipcMain.handle('save-pdf-progress', async (event, params) => {
  const { pdfPath, data, projectId } = params;

  try {
    let savePath;

    if (projectId) {
      // Save to project directory
      const projectPath = getProjectPath(projectId);
      savePath = path.join(projectPath, 'save.json');

      // Update project status (sauvegarde en cours) dans metadata.json
      updateProjectMetadata(projectId, {
        status: 'in_progress',
        stats: {}, // Pas de stats pendant l'extraction
        dateModified: new Date().toISOString()
      });
    } else {
      // Legacy mode - save next to PDF
      const baseName = path.basename(pdfPath, '.pdf');
      const dirName = path.dirname(pdfPath);
      savePath = path.join(dirName, `${baseName}_save.json`);
    }

    fs.writeFileSync(savePath, JSON.stringify(data, null, 2), 'utf-8');

    return { success: true, savePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Handler pour exporter avec images
ipcMain.handle('export-pdf-with-images', async (event, params) => {
  const { pdfPath, articles, scale, projectId } = params;

  try {
    const { PDFDocument } = require('pdf-lib');
    const { createCanvas } = require('canvas');

    let imagesDir, outputPath, dirName;

    if (projectId) {
      // Save to project directory
      const projectPath = getProjectPath(projectId);
      imagesDir = path.join(projectPath, 'images');
      outputPath = path.join(projectPath, 'export.json');
      dirName = projectPath;
    } else {
      // Legacy mode - save next to PDF
      const baseName = path.basename(pdfPath, '.pdf');
      dirName = path.dirname(pdfPath);
      imagesDir = path.join(dirName, 'images');
      outputPath = path.join(dirName, `${baseName}.json`);
    }

    // NOUVEAU: Charger l'ancien export.json s'il existe (pour fusion transcriptions)
    let oldArticles = [];
    if (fs.existsSync(outputPath)) {
      try {
        const oldExport = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
        oldArticles = oldExport.articles || [];
      } catch (e) {
        console.error('Erreur lecture ancien export:', e);
      }
    }

    // Créer le dossier images
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    // Charger le PDF
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);

    const exportData = {
      articles: []
    };
    let transcriptionsPreserved = 0;

    // Utiliser pdfjs-dist côté navigateur pour le rendu, on va juste extraire les pages
    // et utiliser une approche différente - appeler Python pour convertir
    const { spawn } = require('child_process');

    for (let articleIndex = 0; articleIndex < articles.length; articleIndex++) {
      const article = articles[articleIndex];
      const imageFilename = `article_${articleIndex + 1}.png`;
      const imagePath = path.join(imagesDir, imageFilename);

      // Pour chaque article, on doit combiner les zones
      // Utiliser le script Python pour convertir les pages en images
      const pythonScript = getPythonScriptPath('pdf_to_image.py');

      // Créer un JSON temporaire avec les zones
      const tempData = {
        pdfPath: pdfPath,
        zones: article.zones,
        outputPath: imagePath,
        scale: scale
      };

      const tempFile = path.join(dirName, `temp_${articleIndex}.json`);
      fs.writeFileSync(tempFile, JSON.stringify(tempData), 'utf-8');

      // Appeler Python pour faire le rendu
      const pythonExe = getPythonPath();
      await new Promise((resolve, reject) => {
        const python = spawn(pythonExe, [pythonScript, tempFile]);

        let stdout = '';
        let stderr = '';

        python.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        python.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        python.on('close', (code) => {
          fs.unlinkSync(tempFile); // Nettoyer le fichier temp
          if (code === 0) {
            resolve();
          } else {
            console.error('Python stdout:', stdout);
            console.error('Python stderr:', stderr);
            reject(new Error(`Python extraction failed with code ${code}: ${stderr}`));
          }
        });

        python.on('error', (err) => {
          if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
          }
          reject(err);
        });
      });

      // NOUVEAU: Construire l'article avec fusion de transcription
      const newArticle = {
        zones: article.zones,
        image: `images/${imageFilename}`
      };

      // Chercher un match dans les anciens articles
      const oldMatch = oldArticles.find(old =>
        zonesAreEqual(old.zones, newArticle.zones)
      );

      if (oldMatch && (oldMatch.titre || oldMatch.auteur || oldMatch.contenu)) {
        // Match trouvé avec transcription → copier
        newArticle.titre = oldMatch.titre || '';
        newArticle.auteur = oldMatch.auteur || '';
        newArticle.contenu = oldMatch.contenu || '';
        transcriptionsPreserved++;
      }

      exportData.articles.push(newArticle);
    }

    // Sauvegarder le JSON
    fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2), 'utf-8');

    // Update project status if this is a project
    if (projectId) {
      const statusInfo = detectProjectStatus(projectId);
      updateProjectMetadata(projectId, {
        status: statusInfo.status,
        stats: statusInfo.stats,
        dateModified: new Date().toISOString()
      });
    }

    return {
      success: true,
      articleCount: articles.length,
      transcriptionsPreserved: transcriptionsPreserved,
      outputPath: outputPath,
      imagesPath: imagesDir
    };
  } catch (error) {
    console.error('Erreur lors de l\'export:', error);
    return { success: false, error: error.message };
  }
});

// Handler pour charger une sauvegarde
ipcMain.handle('load-pdf-save', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'JSON Files', extensions: ['json'] }]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  try {
    const data = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf-8'));
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Handler pour charger la sauvegarde d'un projet
ipcMain.handle('load-project-save', async (event, projectId) => {
  try {
    const projectPath = getProjectPath(projectId);
    const saveJsonPath = path.join(projectPath, 'save.json');

    if (fs.existsSync(saveJsonPath)) {
      const data = JSON.parse(fs.readFileSync(saveJsonPath, 'utf-8'));
      return { success: true, data };
    }

    return { success: false, error: 'No save file found' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Handler pour charger l'export d'un projet
ipcMain.handle('load-project-export', async (event, projectId) => {
  try {
    const projectPath = getProjectPath(projectId);
    const exportJsonPath = path.join(projectPath, 'export.json');

    if (fs.existsSync(exportJsonPath)) {
      const data = JSON.parse(fs.readFileSync(exportJsonPath, 'utf-8'));
      return { success: true, data };
    }

    return { success: false, error: 'No export file found' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ==================== EXPORT ARTICLES (PDF/DOCX) ====================

// Handler pour sélectionner la destination d'export
ipcMain.handle('select-export-destination', async (event, { extension, defaultName }) => {
  const fileName = defaultName ? `${defaultName}.${extension}` : `export.${extension}`;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Sélectionner la destination',
    defaultPath: fileName,
    filters: [
      { name: extension === 'pdf' ? 'PDF' : extension === 'zip' ? 'ZIP' : 'Word', extensions: [extension] }
    ]
  });

  if (result.canceled) {
    return null;
  }

  return { filePath: result.filePath };
});

// Helper pour convertir HTML en texte formaté
function htmlToPlainText(html) {
  if (!html) return '';

  // Convertir les balises HTML en texte formaté
  let text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '$1')
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '$1')
    .replace(/<u[^>]*>(.*?)<\/u>/gi, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();

  return text;
}

// Handler pour exporter des articles en PDF
async function exportArticlesToPDF(articles, outputPath) {
  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
    size: 'A4'
  });

  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];

    // Ajouter une page break entre les articles (sauf pour le premier)
    if (i > 0) {
      doc.addPage();
    }

    // Titre
    if (article.titre) {
      doc.fontSize(18)
         .font('Helvetica-Bold')
         .text(article.titre, { align: 'center' });
      doc.moveDown(0.5);
    }

    // Auteur
    if (article.auteur) {
      doc.fontSize(12)
         .font('Helvetica-Oblique')
         .text(`Par ${article.auteur}`, { align: 'center' });
      doc.moveDown(1);
    }

    // Ligne de séparation
    doc.moveTo(50, doc.y)
       .lineTo(doc.page.width - 50, doc.y)
       .stroke();
    doc.moveDown(1);

    // Contenu
    if (article.contenu) {
      const plainText = htmlToPlainText(article.contenu);
      doc.fontSize(11)
         .font('Helvetica')
         .text(plainText, {
           align: 'justify',
           lineGap: 3
         });
    }
  }

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });
}

// Handler pour exporter des articles en Word (DOCX)
async function exportArticlesToDOCX(articles, outputPath) {
  const { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel } = require('docx');

  const children = [];

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];

    // Page break entre articles (sauf premier)
    if (i > 0) {
      children.push(
        new Paragraph({
          pageBreakBefore: true
        })
      );
    }

    // Titre
    if (article.titre) {
      children.push(
        new Paragraph({
          text: article.titre,
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 }
        })
      );
    }

    // Auteur
    if (article.auteur) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Par ${article.auteur}`,
              italics: true
            })
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 }
        })
      );
    }

    // Contenu
    if (article.contenu) {
      const plainText = htmlToPlainText(article.contenu);
      const paragraphs = plainText.split('\n').filter(p => p.trim());

      paragraphs.forEach(para => {
        children.push(
          new Paragraph({
            text: para,
            spacing: { after: 200 },
            alignment: AlignmentType.JUSTIFIED
          })
        );
      });
    }
  }

  const doc = new Document({
    sections: [{
      properties: {},
      children: children
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
}

// Handler principal pour exporter des articles
ipcMain.handle('export-articles', async (event, params) => {
  const { articles, format, outputPath } = params;

  try {
    if (format === 'pdf') {
      await exportArticlesToPDF(articles, outputPath);
    } else if (format === 'docx') {
      await exportArticlesToDOCX(articles, outputPath);
    } else {
      return { success: false, error: 'Format non supporté' };
    }

    return { success: true, outputPath };
  } catch (error) {
    console.error('Erreur lors de l\'export:', error);
    return { success: false, error: error.message };
  }
});

// ==================== EXPORT PROJECT AS ZIP ====================

// Handler pour exporter un projet en ZIP
ipcMain.handle('export-project-zip', async (event, { projectId, destinationPath }) => {
  try {
    const AdmZip = require('adm-zip');
    const projectPath = getProjectPath(projectId);

    // Vérifier que le projet existe
    if (!fs.existsSync(projectPath)) {
      return { success: false, error: 'Projet introuvable' };
    }

    // Créer le ZIP
    const zip = new AdmZip();
    zip.addLocalFolder(projectPath);

    // Sauvegarder à la destination
    zip.writeZip(destinationPath);

    return { success: true, path: destinationPath };
  } catch (error) {
    console.error('Erreur export ZIP:', error);
    return { success: false, error: error.message };
  }
});

// Handler pour importer un projet ZIP
ipcMain.handle('import-project', async () => {
  try {
    // Demander de sélectionner le fichier ZIP
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Importer un projet',
      filters: [
        { name: 'ZIP', extensions: ['zip'] }
      ],
      properties: ['openFile']
    });

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { success: false, cancelled: true };
    }

    const zipPath = result.filePaths[0];
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(zipPath);

    // Générer un nouvel ID avec timestamp pour éviter les conflits
    const newProjectId = Date.now().toString();
    const projectsPath = path.join(app.getPath('userData'), 'projects');
    const newProjectPath = path.join(projectsPath, newProjectId);

    // Créer le dossier du projet
    if (!fs.existsSync(projectsPath)) {
      fs.mkdirSync(projectsPath, { recursive: true });
    }

    // Extraire le ZIP dans le nouveau dossier
    zip.extractAllTo(newProjectPath, true);

    // Lire ou créer le metadata.json
    const metadataPath = path.join(newProjectPath, 'metadata.json');
    let metadata;

    if (fs.existsSync(metadataPath)) {
      // Metadata existe, le lire et mettre à jour l'ID et les dates
      metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      metadata.id = newProjectId;
      metadata.dateAdded = new Date().toISOString();
      metadata.dateModified = new Date().toISOString();
    } else {
      // Pas de metadata, en créer un nouveau
      const files = fs.readdirSync(newProjectPath);
      const pdfFile = files.find(f => f.endsWith('.pdf'));
      const projectName = pdfFile ? pdfFile.replace('.pdf', '') : `Projet importé`;

      metadata = {
        id: newProjectId,
        name: projectName,
        originalFilename: pdfFile || 'unknown.pdf',
        dateAdded: new Date().toISOString(),
        dateModified: new Date().toISOString(),
        status: 'new'
      };
    }

    // Sauvegarder le metadata mis à jour
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    // Ajouter juste l'ID dans projects.json
    const projectIds = loadProjectsIndex();
    projectIds.push(newProjectId);
    saveProjectsIndex(projectIds);

    return { success: true, projectId: newProjectId };
  } catch (error) {
    console.error('Erreur import projet:', error);
    return { success: false, error: error.message };
  }
});
