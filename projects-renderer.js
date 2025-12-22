// Projects page renderer logic

let projects = [];
let currentSort = 'dateModified';
let currentRenameProjectId = null;
let currentDeleteProjectId = null;

// DOM elements
const projectsList = document.getElementById('projects-list');
const emptyState = document.getElementById('empty-state');
const sortSelect = document.getElementById('sort-select');
const dropZone = document.getElementById('drop-zone');

// Modals
const renameModal = document.getElementById('rename-modal');
const renameInput = document.getElementById('rename-input');
const renameConfirm = document.getElementById('rename-confirm');
const renameCancel = document.getElementById('rename-cancel');
const renameModalClose = document.getElementById('rename-modal-close');

const deleteModal = document.getElementById('delete-modal');
const deleteProjectName = document.getElementById('delete-project-name');
const deleteConfirm = document.getElementById('delete-confirm');
const deleteCancel = document.getElementById('delete-cancel');
const deleteModalClose = document.getElementById('delete-modal-close');

const newProjectModal = document.getElementById('new-project-modal');
const newProjectName = document.getElementById('new-project-name');
const selectPdfBtn = document.getElementById('select-pdf-btn');
const selectedPdfName = document.getElementById('selected-pdf-name');
const newProjectConfirm = document.getElementById('new-project-confirm');
const newProjectCancel = document.getElementById('new-project-cancel');
const newProjectModalClose = document.getElementById('new-project-modal-close');

let selectedPdfPath = null;

// Load projects on startup
loadProjects();

// Listen for menu events
if (window.api && window.api.onTriggerNewProject) {
  window.api.onTriggerNewProject(() => {
    handleNewProject();
  });
}

if (window.api && window.api.onRefreshProjects) {
  window.api.onRefreshProjects(() => {
    loadProjects();
  });
}

if (window.api && window.api.onTriggerImportProject) {
  window.api.onTriggerImportProject(() => {
    handleImportProject();
  });
}

// Event listeners
sortSelect.addEventListener('change', (e) => {
  currentSort = e.target.value;
  renderProjects();
});

// Rename modal events
renameModalClose.addEventListener('click', closeRenameModal);
renameCancel.addEventListener('click', closeRenameModal);
renameConfirm.addEventListener('click', confirmRename);
renameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    confirmRename();
  }
});

// Delete modal events
deleteModalClose.addEventListener('click', closeDeleteModal);
deleteCancel.addEventListener('click', closeDeleteModal);
deleteConfirm.addEventListener('click', confirmDelete);

// New project modal events
newProjectModalClose.addEventListener('click', closeNewProjectModal);
newProjectCancel.addEventListener('click', closeNewProjectModal);
newProjectConfirm.addEventListener('click', confirmNewProject);
selectPdfBtn.addEventListener('click', selectPdf);
newProjectName.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && selectedPdfPath) {
    confirmNewProject();
  }
});

// Close modals when clicking on background
document.querySelector('#new-project-modal .modal-background')?.addEventListener('click', closeNewProjectModal);
document.querySelector('#rename-modal .modal-background')?.addEventListener('click', closeRenameModal);
document.querySelector('#delete-modal .modal-background')?.addEventListener('click', closeDeleteModal);

// Functions

async function loadProjects() {
  try {
    const result = await window.api.getProjects();
    if (result.success) {
      projects = result.projects;
      renderProjects();
    } else {
      console.error('Erreur chargement projets:', result.error);
    }
  } catch (error) {
    console.error('Erreur chargement projets:', error);
  }
}

function renderProjects() {
  // Sort projects
  const sortedProjects = [...projects].sort((a, b) => {
    if (currentSort === 'name') {
      return a.name.localeCompare(b.name);
    } else if (currentSort === 'dateAdded') {
      return new Date(b.dateAdded) - new Date(a.dateAdded);
    } else {
      // dateModified (default)
      return new Date(b.dateModified) - new Date(a.dateModified);
    }
  });

  // Show/hide empty state
  if (sortedProjects.length === 0) {
    projectsList.style.display = 'none';
    emptyState.style.display = 'block';
    return;
  } else {
    projectsList.style.display = 'block';
    emptyState.style.display = 'none';
  }

  // Render project cards
  projectsList.innerHTML = sortedProjects.map(project => {
    const statusInfo = getStatusInfo(project.status, project.stats);
    const dateAdded = formatDate(project.dateAdded);
    const dateModified = formatDate(project.dateModified);
    const thumbnailPath = getThumbnailPath(project.id);

    return `
      <div class='project-card-container'>
      <div class="box project-card p-1 has-background-dark">
        <div class="project-thumbnail">
          <div class="project-status status-${project.status}">
              <span>${statusInfo.label}</span>
          </div>
          <img src="${thumbnailPath}" alt="Miniature" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22400%22%3E%3Crect width=%22300%22 height=%22400%22 fill=%22%23ddd%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-family=%22Arial%22 font-size=%2224%22 fill=%22%23999%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22%3E📄 PDF%3C/text%3E%3C/svg%3E'" />
        </div>
        <div class="project-header">
          <div class="project-info">
            <div class="project-title has-text-light">${escapeHtml(project.name)} <button style='font-size:0.5em' class="button is-small is-dark" onclick="renameProject('${project.id}', '${escapeForAttribute(project.name)}')">
            <span class="icon"><span>✏️</span></span>
          </button></div>
            <div class="project-meta">
              Modifié: ${dateModified}
            </div>
          </div>
        </div>
        <div class="project-actions">
          ${getActionButtons(project)}

          <div class="dropdown is-right project-dropdown">
            <div class="dropdown-trigger">
              <button class="button is-small" aria-haspopup="true" onclick="toggleDropdown(event, '${project.id}')">
                <span>…</span>
              </button>
            </div>
            <div class="dropdown-menu" role="menu">
              <div class="dropdown-content">
                <a class="dropdown-item" onclick="exportProject('${project.id}')">
                  <span>Exporter (ZIP)</span>
                </a>
                <hr class="dropdown-divider">
                <a class="dropdown-item has-text-danger" onclick="deleteProject('${project.id}', '${escapeForAttribute(project.name)}')">
                  <span>Supprimer</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    `;
  }).join('');
}

function getStatusInfo(status, stats) {
  const statusMap = {
    'new': { label: 'Nouveau' },
    'in_progress': { label: 'En cours' },
    'extracted': { label: 'Extrait' },
    'completed': { label: 'Complété' }
  };

  const baseInfo = statusMap[status] || statusMap['new'];

  // Ajouter les détails selon le statut
  if (status === 'extracted' && stats && stats.articleCount) {
    baseInfo.label = `${stats.articleCount} article${stats.articleCount > 1 ? 's' : ''} extrait${stats.articleCount > 1 ? 's' : ''}`;
  } else if (status === 'in_progress' && stats && stats.filledFields !== undefined) {
    baseInfo.label = `${stats.filledFields}/${stats.totalFields} champs complétés`;
  } else if (status === 'completed' && stats && stats.articleCount) {
    baseInfo.label = 'Complété';
  }

  return baseInfo;
}

function getActionButtons(project) {
  switch (project.status) {
    case 'new':
      return `
        <button class="button is-small is-white" onclick="startExtraction('${project.id}')">
          <span>Extraire</span>
        </button>
      `;
    case 'in_progress':
      // Si stats.filledFields existe, c'est une transcription en cours
      // Sinon c'est une extraction en cours
      if (project.stats && project.stats.filledFields !== undefined) {
        // Transcription en cours
        return `
          <button class="button is-small is-white" onclick="editProject('${project.id}')">
            <span>Éditer</span>
          </button>
          <button class="button is-small is-white" onclick="reExtractProject('${project.id}')">
            <span>Ré-extraire</span>
          </button>
        `;
      } else {
        // Extraction en cours
        return `
          <button class="button is-small is-white" onclick="continueExtraction('${project.id}')">
            <span>Continuer</span>
          </button>
        `;
      }
    case 'extracted':
    case 'completed':
      return `
        <button class="button is-small is-white" onclick="editProject('${project.id}')">
          <span>Éditer</span>
        </button>
        <button class="button is-small is-white" onclick="reExtractProject('${project.id}')">
          <span>Ré-extraire</span>
        </button>
      `;
    default:
      return '';
  }
}

function formatDate(isoString) {
  const date = new Date(isoString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeForAttribute(text) {
  return text.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function getThumbnailPath(projectId) {
  // Le chemin sera résolu via le protocole file://
  // Electron résout les chemins dans userData automatiquement
  return `scantools-project://${projectId}/thumbnail.png`;
}

// Action handlers (called from onclick in HTML)
async function handleNewProject() {
  openNewProjectModal();
}

async function handleImportProject() {
  try {
    const result = await window.api.importProject();

    if (result.success) {
      await loadProjects();
      alert('Projet importé avec succès !');
    } else if (!result.cancelled) {
      alert(`Erreur lors de l'import: ${result.error}`);
    }
  } catch (error) {
    console.error('Erreur import projet:', error);
    alert(`Erreur: ${error.message}`);
  }
}

async function startExtraction(projectId) {
  try {
    await window.api.openExtraction(projectId);
  } catch (error) {
    console.error('Erreur ouverture extraction:', error);
  }
}

async function continueExtraction(projectId) {
  try {
    await window.api.openExtraction(projectId);
  } catch (error) {
    console.error('Erreur ouverture extraction:', error);
  }
}

async function editProject(projectId) {
  try {
    await window.api.openEditor(projectId);
  } catch (error) {
    console.error('Erreur ouverture éditeur:', error);
  }
}

async function reExtractProject(projectId) {
  try {
    await window.api.openExtraction(projectId);
  } catch (error) {
    console.error('Erreur ré-extraction:', error);
  }
}

// Dropdown management
function toggleDropdown(event, projectId) {
  event.stopPropagation();

  // Fermer tous les autres dropdowns
  document.querySelectorAll('.dropdown.is-active').forEach(dd => {
    dd.classList.remove('is-active');
  });

  // Toggle le dropdown cliqué
  const dropdown = event.target.closest('.dropdown');
  dropdown.classList.toggle('is-active');
}

// Fermer dropdown au clic à l'extérieur
document.addEventListener('click', (e) => {
  if (!e.target.closest('.dropdown')) {
    document.querySelectorAll('.dropdown.is-active').forEach(dd => {
      dd.classList.remove('is-active');
    });
  }
});

// Export project as ZIP
async function exportProject(projectId) {
  try {
    // Trouver le projet pour obtenir son nom
    const project = projects.find(p => p.id === projectId);
    const projectName = project ? project.name : 'export';

    // Demander où sauvegarder le ZIP avec le nom du projet par défaut
    const result = await window.api.selectExportDestination('zip', projectName);

    if (!result || !result.filePath) {
      return; // User cancelled
    }

    // Créer le ZIP
    const exportResult = await window.api.exportProjectZip(projectId, result.filePath);

    if (exportResult.success) {
      alert(`Projet exporté avec succès !\n${exportResult.path}`);
    } else {
      alert(`Erreur lors de l'export: ${exportResult.error}`);
    }
  } catch (error) {
    console.error('Erreur export projet:', error);
    alert(`Erreur: ${error.message}`);
  }
}

// Rename modal functions
function renameProject(projectId, currentName) {
  currentRenameProjectId = projectId;
  renameInput.value = currentName;
  renameModal.classList.add('is-active');
  renameInput.focus();
  renameInput.select();
}

function closeRenameModal() {
  renameModal.classList.remove('is-active');
  currentRenameProjectId = null;
  renameInput.value = '';
}

async function confirmRename() {
  const newName = renameInput.value.trim();
  if (!newName) {
    alert('Le nom ne peut pas être vide');
    return;
  }

  try {
    const result = await window.api.renameProject(currentRenameProjectId, newName);
    if (result.success) {
      closeRenameModal();
      await loadProjects();
    } else {
      alert('Erreur lors du renommage: ' + result.error);
    }
  } catch (error) {
    console.error('Erreur renommage:', error);
    alert('Erreur lors du renommage');
  }
}

// Delete modal functions
function deleteProject(projectId, projectName) {
  currentDeleteProjectId = projectId;
  deleteProjectName.textContent = projectName;
  deleteModal.classList.add('is-active');
}

function closeDeleteModal() {
  deleteModal.classList.remove('is-active');
  currentDeleteProjectId = null;
}

async function confirmDelete() {
  try {
    const result = await window.api.deleteProject(currentDeleteProjectId);
    if (result.success) {
      closeDeleteModal();
      // Clear projects list before reloading
      projects = [];
      projectsList.innerHTML = '';
      await loadProjects();
    } else {
      alert('Erreur lors de la suppression: ' + result.error);
    }
  } catch (error) {
    console.error('Erreur suppression:', error);
    alert('Erreur lors de la suppression');
  }
}

// New project modal functions
function openNewProjectModal() {
  selectedPdfPath = null;
  newProjectName.value = '';
  selectedPdfName.textContent = 'Sélectionner un PDF...';
  newProjectModal.classList.add('is-active');
  newProjectName.focus();
}

function closeNewProjectModal() {
  newProjectModal.classList.remove('is-active');
  selectedPdfPath = null;
  newProjectName.value = '';
  selectedPdfName.textContent = 'Sélectionner un PDF...';
}

async function selectPdf() {
  const result = await window.api.loadPDF();
  if (result && result.filePath) {
    selectedPdfPath = result.filePath;
    const fileName = result.filePath.split('\\').pop().split('/').pop();
    selectedPdfName.textContent = fileName;

    // Pré-remplir le nom du projet avec le nom du PDF (sans extension)
    if (!newProjectName.value) {
      const projectName = fileName.replace('.pdf', '');
      newProjectName.value = projectName;
    }
  }
}

async function confirmNewProject() {
  const projectName = newProjectName.value.trim();

  if (!projectName) {
    alert('Veuillez entrer un nom de projet');
    return;
  }

  if (!selectedPdfPath) {
    alert('Veuillez sélectionner un fichier PDF');
    return;
  }

  try {
    const result = await window.api.createProject(selectedPdfPath, projectName);
    if (result.success) {
      closeNewProjectModal();
      await loadProjects();

      // Ouvrir automatiquement l'extraction
      await startExtraction(result.project.id);
    } else {
      alert('Erreur lors de la création du projet: ' + result.error);
    }
  } catch (error) {
    console.error('Erreur création projet:', error);
    alert('Erreur lors de la création du projet');
  }
}

// Expose functions to window for onclick handlers
window.startExtraction = startExtraction;
window.continueExtraction = continueExtraction;
window.editProject = editProject;
window.reExtractProject = reExtractProject;
window.renameProject = renameProject;
window.deleteProject = deleteProject;
window.exportProject = exportProject;
window.toggleDropdown = toggleDropdown;
