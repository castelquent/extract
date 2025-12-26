// Initialize Split.js with 70/30 split
Split(['#column-left', '#column-right'], {
  sizes: [70, 30],
  minSize: [200, 200],
  gutterSize: 5
});

// Initialize Quill editor
const quill = new Quill('#editor-container', {
  theme: 'snow',
  modules: {
    toolbar: [
       ['bold', 'italic', 'underline'],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      ['clean']
    ]
  }
});

// Variables globales
let currentData = null;
let currentArticleIndex = 0;
let panzoomInstance = null;
let baseDirectory = null;
let currentFilePath = null;
let currentProjectId = null;
let currentProjectDetails = null;

// Éléments DOM
const previewContainer = document.getElementById('preview-box-container');
const currentPageSpan = document.getElementById('current-page');
const totalPageSpan = document.getElementById('total-page');
const previousButton = document.getElementById('previous-page');
const nextButton = document.getElementById('next-page');
const articleTitreInput = document.getElementById('article-titre');
const articleAuteurInput = document.getElementById('article-auteur');
const articleIndexSpan = document.getElementById('content-edit-index');
const sendToAiButton = document.getElementById('send-to-ai');
const sommaireTableBody = document.getElementById('sommaire-table-body');
const deleteModal = document.getElementById('delete-modal');
const confirmDeleteBtn = document.getElementById('confirm-delete');
const cancelDeleteBtn = document.getElementById('cancel-delete');
const deleteModalClose = document.getElementById('delete-modal-close');
const transcriptionModal = document.getElementById('transcription-modal');
const transcriptionLog = document.getElementById('transcription-log');
const closeTranscriptionModalBtn = document.getElementById('close-transcription-modal');
const sommaireTranscribeBtn = document.querySelector('#sommaire-controls .button.is-white');

// Variable pour stocker l'index de l'article à supprimer
let articleToDeleteIndex = -1;

// Helper pour vérifier si le contenu HTML est vide (ignore <p><br></p> de Quill)
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

// Fonction pour afficher un article
function displayArticle(index) {
  if (!currentData || !currentData.articles || index < 0 || index >= currentData.articles.length) {
    return;
  }

  currentArticleIndex = index;
  const article = currentData.articles[index];

  // Détruire l'instance Panzoom précédente si elle existe
  if (panzoomInstance) {
    panzoomInstance.destroy();
    panzoomInstance = null;
  }

  // Créer l'image
  const img = document.createElement('img');
  img.id = 'preview-image';
  img.alt = 'Article';

  // Quand l'image est chargée, initialiser Panzoom
  img.onload = () => {
    panzoomInstance = Panzoom(img, {
      maxScale: 5,
      minScale: 1,
      startScale: 1,
      contain:'outside'
    });

    previewContainer.addEventListener('wheel', panzoomInstance.zoomWithWheel);
  };

  // Construire le chemin absolu de l'image
  const imagePath = baseDirectory
    ? `${baseDirectory}/${article.image}`.replace(/\\/g, '/')
    : article.image;

  img.src = imagePath;

  // Vider le container et ajouter la nouvelle image
  previewContainer.innerHTML = '';
  previewContainer.appendChild(img);

  // Mettre à jour les contrôles
  currentPageSpan.textContent = index + 1;
  totalPageSpan.textContent = currentData.articles.length;

  // Désactiver les boutons si nécessaire
  previousButton.disabled = index === 0;
  nextButton.disabled = index === currentData.articles.length - 1;

  // Mettre à jour le panneau d'édition
  articleIndexSpan.textContent = index + 1;

  // Remplir les champs avec les données de l'article (ou vide si n'existe pas)
  articleTitreInput.value = article.titre || '';
  articleAuteurInput.value = article.auteur || '';

  // Remplir Quill avec le contenu (supporte HTML)
  if (article.contenu) {
    quill.root.innerHTML = article.contenu;
  } else {
    quill.setText('');
  }
}

// Fonction pour sauvegarder l'article actuel dans la mémoire
function saveCurrentArticleToMemory() {
  if (!currentData || !currentData.articles || currentArticleIndex < 0) {
    return;
  }

  const article = currentData.articles[currentArticleIndex];

  // Sauvegarder les valeurs des champs dans l'objet article
  article.titre = articleTitreInput.value;
  article.auteur = articleAuteurInput.value;
  article.contenu = quill.root.innerHTML;
}

// Fonction pour remplir la table du sommaire
function populateSommaireTable() {
  if (!currentData || !currentData.articles) {
    sommaireTableBody.innerHTML = '<tr><td colspan="6" class="has-text-centered">Aucun article chargé</td></tr>';
    return;
  }

  sommaireTableBody.innerHTML = '';

  // Ajouter l'event listener pour le checkbox "Tout sélectionner"
  const selectAllCheckbox = document.getElementById('select-all-checkbox');
  selectAllCheckbox.replaceWith(selectAllCheckbox.cloneNode(true)); // Retirer les anciens listeners
  const newSelectAllCheckbox = document.getElementById('select-all-checkbox');

  newSelectAllCheckbox.addEventListener('change', (e) => {
    const checkboxes = document.querySelectorAll('.article-checkbox');
    checkboxes.forEach(cb => {
      cb.checked = e.target.checked;
    });
  });

  currentData.articles.forEach((article, index) => {
    const row = document.createElement('tr');

    // CHECKBOX
    const tdCheckbox = document.createElement('td');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'article-checkbox';
    checkbox.dataset.index = index;
    tdCheckbox.appendChild(checkbox);
    row.appendChild(tdCheckbox);

    // ID
    const tdId = document.createElement('td');
    tdId.textContent = index + 1;
    row.appendChild(tdId);

    // PAGE DEBUT
    const tdPage = document.createElement('td');
    const pageDebut = article.zones && article.zones.length > 0 ? article.zones[0].page : '-';
    tdPage.textContent = pageDebut;
    row.appendChild(tdPage);

    // TITRE
    const tdTitre = document.createElement('td');
    tdTitre.textContent = article.titre || '—';
    row.appendChild(tdTitre);

    // AUTEUR
    const tdAuteur = document.createElement('td');
    tdAuteur.textContent = article.auteur || '—';
    row.appendChild(tdAuteur);

    // CONTENU
    const tdContenu = document.createElement('td');
    tdContenu.style.textAlign = 'center';
    const isContentFilled = !isContentEmpty(article.contenu);
    tdContenu.textContent = isContentFilled ? '✓' : '—';
    if (isContentFilled) {
      tdContenu.style.color = '#48c78e'; // Couleur verte
      tdContenu.style.fontSize = '1.2em';
    }
    row.appendChild(tdContenu);

    // ACTION
    const tdAction = document.createElement('td');
    const fieldDiv = document.createElement('div');
    fieldDiv.className = 'field has-addons';

    // Bouton Modifier
    const controlModifier = document.createElement('div');
    controlModifier.className = 'control';
    const btnModifier = document.createElement('button');
    btnModifier.className = 'button is-small is-white';
    btnModifier.textContent = 'Modifier';
    btnModifier.addEventListener('click', () => {
      // Sauvegarder l'article actuel avant de changer
      saveCurrentArticleToMemory();

      // Basculer vers le tab Preview et afficher cet article
      switchToTab('preview');
      displayArticle(index);
    });
    controlModifier.appendChild(btnModifier);
    fieldDiv.appendChild(controlModifier);

    // Bouton Exporter
    const controlExporter = document.createElement('div');
    controlExporter.className = 'control';
    const btnExporter = document.createElement('button');
    btnExporter.className = 'button is-small is-primary';
    btnExporter.textContent = 'Exporter';
    btnExporter.addEventListener('click', () => {
      // Ouvrir la modale d'export pour cet article
      openExportModal([index]);
    });
    controlExporter.appendChild(btnExporter);
    fieldDiv.appendChild(controlExporter);

    // Bouton Supprimer
    const controlSupprimer = document.createElement('div');
    controlSupprimer.className = 'control';
    const btnSupprimer = document.createElement('button');
    btnSupprimer.className = 'button is-small is-danger';
    btnSupprimer.textContent = 'Supprimer';
    btnSupprimer.addEventListener('click', () => {
      // Ouvrir le modal de confirmation
      articleToDeleteIndex = index;
      deleteModal.classList.add('is-active');
    });
    controlSupprimer.appendChild(btnSupprimer);
    fieldDiv.appendChild(controlSupprimer);

    tdAction.appendChild(fieldDiv);

    row.appendChild(tdAction);


    sommaireTableBody.appendChild(row);
  });
}

// Fonction pour basculer entre les tabs
function switchToTab(tabName) {
  // Sauvegarder l'article actuel avant de changer de tab
  saveCurrentArticleToMemory();

  // Retirer la classe is-active de tous les tabs
  document.querySelectorAll('.tabs li').forEach(li => {
    li.classList.remove('is-active');
  });

  // Retirer la classe is-active de tous les tab-content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('is-active');
  });

  // Ajouter is-active au tab sélectionné
  const selectedTab = document.querySelector(`.tabs li[data-tab="${tabName}"]`);
  if (selectedTab) {
    selectedTab.classList.add('is-active');
  }

  // Ajouter is-active au contenu du tab
  const selectedContent = document.getElementById(`tab-${tabName}`);
  if (selectedContent) {
    selectedContent.classList.add('is-active');
  }

  // Si on ouvre le tab Sommaire, remplir la table
  if (tabName === 'sommaire') {
    populateSommaireTable();
  }

  // Si on ouvre le tab Preview, rafraîchir l'article actuel
  if (tabName === 'preview') {
    if (currentArticleIndex >= 0 && currentData && currentData.articles && currentData.articles.length > 0) {
      displayArticle(currentArticleIndex);
    }
  }
}

// Event listeners pour les tabs
document.querySelectorAll('.tabs li').forEach(li => {
  li.addEventListener('click', () => {
    const tabName = li.getAttribute('data-tab');
    switchToTab(tabName);
  });
});

// Gestionnaires de navigation
previousButton.addEventListener('click', () => {
  if (currentArticleIndex > 0) {
    saveCurrentArticleToMemory();
    displayArticle(currentArticleIndex - 1);
  }
});

nextButton.addEventListener('click', () => {
  if (currentData && currentArticleIndex < currentData.articles.length - 1) {
    saveCurrentArticleToMemory();
    displayArticle(currentArticleIndex + 1);
  }
});

// Listen for project loading from main process
if (window.api && window.api.onLoadProjectEditor) {
  window.api.onLoadProjectEditor(async (projectId) => {
    await loadProjectEditor(projectId);
  });
}

// Load project in editor
async function loadProjectEditor(projectId) {
  try {
    const result = await window.api.getProjectDetails(projectId);
    if (!result.success) {
      alert('Erreur lors du chargement du projet: ' + result.error);
      return;
    }

    currentProjectId = projectId;
    currentProjectDetails = result.project;

    // Load export.json from project directory
    const exportJsonPath = result.project.paths.exportJson;

    // Read the export.json via IPC
    const loadResult = await window.api.loadProjectExport(projectId);
    if (!loadResult || !loadResult.success) {
      alert('Aucun fichier export.json trouvé. Veuillez d\'abord exporter le projet.');
      return;
    }

    currentData = loadResult.data;
    currentArticleIndex = 0;
    currentFilePath = exportJsonPath;
    baseDirectory = result.project.paths.projectDir;

    displayArticle(0);
    populateSommaireTable();

    // Force reflow/repaint pour éviter le bug d'inputs bloqués
    setTimeout(() => {
      // Forcer un reflow en lisant une propriété layout
      document.body.offsetHeight;

      // Focus temporaire sur le premier input pour "réveiller" les inputs
      const firstInput = document.getElementById('article-titre');
      if (firstInput) {
        firstInput.focus();
        firstInput.blur();
      }
    }, 150);
  } catch (error) {
    console.error('Erreur chargement projet:', error);
    alert('Erreur lors du chargement du projet: ' + error.message);
  }
}

// Écouter le chargement du JSON (legacy)
window.electronAPI.onJSONLoaded((result) => {
  if (result && result.data) {
    currentData = result.data;
    currentArticleIndex = 0;
    currentProjectId = null; // Not a project

    // Extraire le répertoire de base du fichier JSON
    const jsonPath = result.filePath;
    currentFilePath = jsonPath;
    baseDirectory = jsonPath.substring(0, jsonPath.lastIndexOf('\\'));

    displayArticle(0);
  }
});

// Écouter la demande de sauvegarde
window.electronAPI.onSaveRequested(async () => {
  if (!currentData || !currentFilePath) {
    console.error('Aucun fichier chargé');
    return;
  }

  // Sauvegarder l'article actuel avant d'écrire le fichier
  saveCurrentArticleToMemory();

  // Envoyer les données au main process pour écriture
  const result = await window.api.saveJSON({
    filePath: currentFilePath,
    jsonData: currentData,
    projectId: currentProjectId
  });

  if (result.success) {
    console.log('Fichier sauvegardé avec succès');
  } else {
    console.error('Erreur lors de la sauvegarde:', result.error);
  }
});

// Gestionnaire du bouton Transcrire
sendToAiButton.addEventListener('click', async () => {
  if (!currentData || !currentData.articles || currentArticleIndex < 0) {
    alert('Aucun article chargé');
    return;
  }

  const article = currentData.articles[currentArticleIndex];
  const imagePath = baseDirectory
    ? `${baseDirectory}\\${article.image}`.replace(/\//g, '\\')
    : article.image;

  // Désactiver le bouton et afficher un état de chargement
  sendToAiButton.disabled = true;
  sendToAiButton.textContent = 'Transcription...';

  try {
    // Charger les settings
    const settings = await window.electronAPI.loadSettings();

    if (!settings || !settings.ai) {
      alert('Veuillez configurer les paramètres IA dans Préférences');
      return;
    }

    // Appeler l'API de transcription
    const result = await window.electronAPI.transcribeImage({
      imagePath: imagePath,
      settings: settings
    });

    if (result.success) {
      // Remplir les champs avec la réponse
      const data = result.data;
      console.log('Données reçues:', data);

      if (data.titre) {
        articleTitreInput.value = data.titre;
      }

      if (data.auteur) {
        articleAuteurInput.value = data.auteur;
      }

      if (data.contenu) {
        quill.root.innerHTML = data.contenu;
      }

      // Sauvegarder dans la mémoire
      saveCurrentArticleToMemory();
    } else {
      console.error('Erreur:', result.error);
      alert('Erreur: ' + result.error);
    }
  } catch (error) {
    console.error('Erreur complète:', error);
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
    alert('Erreur: ' + error.message);
  } finally {
    // Réactiver le bouton
    sendToAiButton.disabled = false;
    sendToAiButton.textContent = 'Transcrire';
  }
});

// Gestionnaires du modal de suppression
confirmDeleteBtn.addEventListener('click', () => {
  if (articleToDeleteIndex >= 0 && currentData && currentData.articles) {
    // Supprimer l'article du tableau
    currentData.articles.splice(articleToDeleteIndex, 1);

    // Si l'article supprimé était celui en cours d'édition
    if (currentArticleIndex === articleToDeleteIndex) {
      // Afficher le premier article ou un message si plus d'articles
      if (currentData.articles.length > 0) {
        currentArticleIndex = 0;
        displayArticle(0);
      } else {
        currentArticleIndex = -1;
      }
    } else if (currentArticleIndex > articleToDeleteIndex) {
      // Si l'article actuel est après celui supprimé, décrémenter l'index
      currentArticleIndex--;
    }

    // Fermer le modal
    deleteModal.classList.remove('is-active');
    articleToDeleteIndex = -1;

    // Recharger la table du sommaire
    populateSommaireTable();
  }
});

cancelDeleteBtn.addEventListener('click', () => {
  deleteModal.classList.remove('is-active');
  articleToDeleteIndex = -1;
});

deleteModalClose.addEventListener('click', () => {
  deleteModal.classList.remove('is-active');
  articleToDeleteIndex = -1;
});

// Fermer le modal en cliquant sur le background
deleteModal.querySelector('.modal-background').addEventListener('click', () => {
  deleteModal.classList.remove('is-active');
  articleToDeleteIndex = -1;
});

// Fonction pour ajouter un log dans le modal de transcription
function addLog(message, type = 'info') {
  const logEntry = document.createElement('div');
  logEntry.style.marginBottom = '0.5em';

  if (type === 'success') {
    logEntry.style.color = '#48c774';
  } else if (type === 'error') {
    logEntry.style.color = '#f14668';
  } else if (type === 'warning') {
    logEntry.style.color = '#ffdd57';
  } else {
    logEntry.style.color = '#e0e0e0';
  }

  const timestamp = new Date().toLocaleTimeString();
  logEntry.textContent = `[${timestamp}] ${message}`;
  transcriptionLog.appendChild(logEntry);

  // Auto-scroll vers le bas
  transcriptionLog.scrollTop = transcriptionLog.scrollHeight;
}

// Fonction pour transcrire les articles cochés
async function transcribeCheckedArticles() {
  const checkedCheckboxes = document.querySelectorAll('.article-checkbox:checked');

  if (checkedCheckboxes.length === 0) {
    alert('Aucun article sélectionné');
    return;
  }

  // Ouvrir le modal et réinitialiser les logs
  transcriptionLog.innerHTML = '';
  transcriptionModal.classList.add('is-active');
  closeTranscriptionModalBtn.disabled = true;

  addLog(`Début de la transcription de ${checkedCheckboxes.length} article(s)`);

  // Charger les settings une seule fois
  let settings;
  try {
    settings = await window.electronAPI.loadSettings();
    if (!settings || !settings.ai) {
      addLog('Erreur: Paramètres IA non configurés', 'error');
      closeTranscriptionModalBtn.disabled = false;
      return;
    }
  } catch (error) {
    addLog(`Erreur lors du chargement des paramètres: ${error.message}`, 'error');
    closeTranscriptionModalBtn.disabled = false;
    return;
  }

  let successCount = 0;
  let errorCount = 0;

  // Transcrire chaque article coché
  for (const checkbox of checkedCheckboxes) {
    const index = parseInt(checkbox.dataset.index);
    const article = currentData.articles[index];

    addLog(`--- Article ${index + 1} ---`);

    try {
      const imagePath = baseDirectory
        ? `${baseDirectory}\\${article.image}`.replace(/\//g, '\\')
        : article.image;

      addLog(`Transcription de l'article ${index + 1}...`, 'info');

      const result = await window.electronAPI.transcribeImage({
        imagePath: imagePath,
        settings: settings
      });

      if (result.success) {
        const data = result.data;

        // Mettre à jour l'article
        if (data.titre) article.titre = data.titre;
        if (data.auteur) article.auteur = data.auteur;
        if (data.contenu) article.contenu = data.contenu;

        addLog(`✓ Article ${index + 1} transcrit avec succès`, 'success');
        addLog(`  Titre: ${data.titre || '(vide)'}`, 'info');
        addLog(`  Auteur: ${data.auteur || '(vide)'}`, 'info');
        successCount++;
      } else {
        addLog(`✗ Erreur: ${result.error}`, 'error');
        errorCount++;
      }
    } catch (error) {
      addLog(`✗ Erreur: ${error.message}`, 'error');
      errorCount++;
    }
  }

  addLog('');
  addLog(`=== Terminé ===`);
  addLog(`Succès: ${successCount}, Erreurs: ${errorCount}`, successCount === checkedCheckboxes.length ? 'success' : 'warning');

  // Recharger la table pour afficher les nouveaux titres/auteurs
  populateSommaireTable();

  // Activer le bouton fermer
  closeTranscriptionModalBtn.disabled = false;
}

// Event listener pour le bouton Transcrire dans sommaire-controls
sommaireTranscribeBtn.addEventListener('click', transcribeCheckedArticles);

// Event listener pour fermer le modal de transcription
closeTranscriptionModalBtn.addEventListener('click', () => {
  transcriptionModal.classList.remove('is-active');
});

// ==================== EXPORT FUNCTIONALITY ====================

// Éléments de la modale d'export
const exportModal = document.getElementById('export-modal');
const exportModalClose = document.getElementById('export-modal-close');
const exportFormatSelect = document.getElementById('export-format-select');
const selectExportDestinationBtn = document.getElementById('select-export-destination');
const exportDestinationName = document.getElementById('export-destination-name');
const confirmExportBtn = document.getElementById('confirm-export');
const cancelExportBtn = document.getElementById('cancel-export');
const exportSelectionBtn = document.getElementById('export-selection-btn');

let selectedExportPath = null;
let articlesToExport = [];

// Fonction pour ouvrir la modale d'export
function openExportModal(articleIndices) {
  articlesToExport = articleIndices;
  selectedExportPath = null;
  exportDestinationName.textContent = 'Parcourir...';
  exportModal.classList.add('is-active');
}

// Event listener pour le bouton "Exporter la sélection"
exportSelectionBtn.addEventListener('click', () => {
  const checkedCheckboxes = document.querySelectorAll('.article-checkbox:checked');

  if (checkedCheckboxes.length === 0) {
    alert('Aucun article sélectionné');
    return;
  }

  const indices = Array.from(checkedCheckboxes).map(cb => parseInt(cb.dataset.index));
  openExportModal(indices);
});

// Event listener pour sélectionner la destination
selectExportDestinationBtn.addEventListener('click', async () => {
  const format = exportFormatSelect.value;
  const extension = format === 'pdf' ? 'pdf' : 'docx';

  const result = await window.api.selectExportDestination(extension, null);

  if (result && result.filePath) {
    selectedExportPath = result.filePath;
    const fileName = result.filePath.split('\\').pop().split('/').pop();
    exportDestinationName.textContent = fileName;
  }
});

// Event listener pour confirmer l'export
confirmExportBtn.addEventListener('click', async () => {
  if (!selectedExportPath) {
    alert('Veuillez sélectionner une destination');
    return;
  }

  if (!currentData || !currentData.articles) {
    alert('Aucun document chargé');
    return;
  }

  // Sauvegarder l'article actuel avant l'export
  saveCurrentArticleToMemory();

  const format = exportFormatSelect.value;
  const articlesData = articlesToExport.map(index => {
    const article = currentData.articles[index];
    return {
      titre: article.titre || '',
      auteur: article.auteur || '',
      contenu: article.contenu || ''
    };
  });

  // Désactiver le bouton pendant l'export
  confirmExportBtn.disabled = true;
  confirmExportBtn.textContent = 'Export en cours...';

  try {
    const result = await window.api.exportArticles({
      articles: articlesData,
      format: format,
      outputPath: selectedExportPath
    });

    if (result.success) {
      alert(`Export réussi !\n${articlesToExport.length} article(s) exporté(s)`);
      exportModal.classList.remove('is-active');
    } else {
      alert('Erreur lors de l\'export: ' + result.error);
    }
  } catch (error) {
    alert('Erreur lors de l\'export: ' + error.message);
  } finally {
    confirmExportBtn.disabled = false;
    confirmExportBtn.textContent = 'Exporter';
  }
});

// Event listeners pour fermer la modale
exportModalClose.addEventListener('click', () => {
  exportModal.classList.remove('is-active');
});

cancelExportBtn.addEventListener('click', () => {
  exportModal.classList.remove('is-active');
});

document.querySelector('#export-modal .modal-background')?.addEventListener('click', () => {
  exportModal.classList.remove('is-active');
});
