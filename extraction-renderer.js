// Configuration PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Variables globales
let pdfDoc = null;
let currentPage = 1;
let totalPages = 0;
let pageRendering = false;
let pageNumPending = null;
let scale = 1.5;
let pdfPath = null;
let currentProjectId = null;
let currentProjectDetails = null;

// Canvas
const pdfCanvas = document.getElementById('pdf-canvas');
const selectionCanvas = document.getElementById('selection-canvas');
const pdfCtx = pdfCanvas.getContext('2d');
const selCtx = selectionCanvas.getContext('2d');

// Sélection temporaire
let tempSelection = null;
let isDrawing = false;
let startX = 0;
let startY = 0;
let resizeHandle = null;
const handleSize = 8;

// Articles
let articles = [];

// Éléments DOM
const pageLabel = document.getElementById('page-label');
const articlesList = document.getElementById('articles-list');
const prevPageBtn = document.getElementById('prev-page');
const nextPageBtn = document.getElementById('next-page');
const selectFullPageBtn = document.getElementById('select-full-page');
const newArticleBtn = document.getElementById('new-article-btn');
const cancelSelectionBtn = document.getElementById('cancel-selection');
const exportWithImagesBtn = document.getElementById('export-with-images');
const extractionCompleteModal = document.getElementById('extraction-complete-modal');
const gotoTranscriptionBtn = document.getElementById('goto-transcription');
const gotoProjectsBtn = document.getElementById('goto-projects');

// Listen for project loading from main process
if (window.api && window.api.onLoadProject) {
  window.api.onLoadProject(async (projectId) => {
    await loadProject(projectId);
  });
}

// Load project function
async function loadProject(projectId) {
  try {
    const result = await window.api.getProjectDetails(projectId);
    if (!result.success) {
      alert('Erreur lors du chargement du projet: ' + result.error);
      return;
    }

    currentProjectId = projectId;
    currentProjectDetails = result.project;
    pdfPath = result.project.paths.sourcePdf;

    // Load the PDF
    const loadingTask = pdfjsLib.getDocument(pdfPath);
    pdfDoc = await loadingTask.promise;
    totalPages = pdfDoc.numPages;
    currentPage = 1;

    // Try to load saved articles from save.json via IPC
    const saveResult = await window.api.loadProjectSave(projectId);
    if (saveResult && saveResult.success && saveResult.data && saveResult.data.articles) {
      articles = saveResult.data.articles;
    } else {
      articles = [];
    }

    tempSelection = null;
    renderPage(currentPage);
    refreshArticlesList();
  } catch (error) {
    console.error('Erreur chargement projet:', error);
    alert('Erreur lors du chargement du projet: ' + error.message);
  }
}

// Listen for save request from menu (Ctrl+S)
if (window.api && window.api.onSaveRequested) {
  window.api.onSaveRequested(async () => {
    await saveProgress();
  });
}

// Save progress function
async function saveProgress() {
  if (!pdfPath) {
    alert('Aucun PDF chargé');
    return;
  }

  const data = {
    pdf_path: pdfPath,
    articles: articles
  };

  const result = await window.api.savePDFProgress({ pdfPath, data, projectId: currentProjectId });
  if (result.success) {
    // Don't show alert, just silently save
    console.log('Sauvegarde réussie');
  } else {
    alert('Erreur de sauvegarde: ' + result.error);
  }
}

// Render page
async function renderPage(num) {
  if (pageRendering) {
    pageNumPending = num;
    return;
  }
  pageRendering = true;

  const page = await pdfDoc.getPage(num);
  const canvasContainer = document.getElementById('canvas-container');
  const containerWidth = canvasContainer.clientWidth;
  const containerHeight = canvasContainer.clientHeight;

  // Calculer le scale pour fitter dans le container
  const baseViewport = page.getViewport({ scale: 1.0 });
  const scaleX = containerWidth / baseViewport.width;
  const scaleY = containerHeight / baseViewport.height;
  const fitScale = Math.min(scaleX, scaleY) * 0.95; // 95% pour un peu de marge

  const viewport = page.getViewport({ scale: fitScale });

  pdfCanvas.width = viewport.width;
  pdfCanvas.height = viewport.height;
  selectionCanvas.width = viewport.width;
  selectionCanvas.height = viewport.height;

  const renderContext = {
    canvasContext: pdfCtx,
    viewport: viewport
  };

  await page.render(renderContext).promise;

  pageRendering = false;

  if (pageNumPending !== null) {
    renderPage(pageNumPending);
    pageNumPending = null;
  }

  pageLabel.textContent = `Page ${currentPage} / ${totalPages}`;
  drawSelections();
}

// Dessiner toutes les sélections
function drawSelections() {
  selCtx.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);

  // Dessiner les articles existants
  articles.forEach((article, index) => {
    article.zones.forEach(zone => {
      if (zone.page === currentPage - 1) {
        const x1 = zone.x1 * pdfCanvas.width;
        const y1 = zone.y1 * pdfCanvas.height;
        const x2 = zone.x2 * pdfCanvas.width;
        const y2 = zone.y2 * pdfCanvas.height;

        // Rectangle vert
        selCtx.strokeStyle = '#22c55e';
        selCtx.lineWidth = 3;
        selCtx.strokeRect(x1, y1, x2 - x1, y2 - y1);

        // Label à l'intérieur du rectangle en haut à gauche
        selCtx.fillStyle = 'rgba(34, 197, 94, 0.9)';
        selCtx.fillRect(x1, y1, 100, 25);
        selCtx.fillStyle = 'white';
        selCtx.font = 'bold 14px Arial';
        selCtx.fillText(`Article ${index + 1}`, x1 + 5, y1 + 17);
      }
    });
  });

  // Dessiner la sélection temporaire
  if (tempSelection && tempSelection.page === currentPage - 1) {
    const x1 = tempSelection.x1 * pdfCanvas.width;
    const y1 = tempSelection.y1 * pdfCanvas.height;
    const x2 = tempSelection.x2 * pdfCanvas.width;
    const y2 = tempSelection.y2 * pdfCanvas.height;

    // Rectangle rouge
    selCtx.strokeStyle = '#ef4444';
    selCtx.lineWidth = 4;
    selCtx.strokeRect(x1, y1, x2 - x1, y2 - y1);

    // Resize handles
    const handles = [
      { x: x1, y: y1 }, { x: x2, y: y1 },
      { x: x1, y: y2 }, { x: x2, y: y2 },
      { x: (x1 + x2) / 2, y: y1 }, { x: (x1 + x2) / 2, y: y2 },
      { x: x1, y: (y1 + y2) / 2 }, { x: x2, y: (y1 + y2) / 2 }
    ];

    handles.forEach(handle => {
      selCtx.fillStyle = '#ef4444';
      selCtx.strokeStyle = 'white';
      selCtx.lineWidth = 2;
      selCtx.fillRect(handle.x - handleSize, handle.y - handleSize, handleSize * 2, handleSize * 2);
      selCtx.strokeRect(handle.x - handleSize, handle.y - handleSize, handleSize * 2, handleSize * 2);
    });

    // Label à l'intérieur du rectangle en haut à gauche
    selCtx.fillStyle = 'rgba(239, 68, 68, 0.9)';
    selCtx.fillRect(x1, y1, 110, 25);
    selCtx.fillStyle = 'white';
    selCtx.font = 'bold 14px Arial';
    selCtx.fillText('En attente', x1 + 5, y1 + 17);
  }
}

// Navigation
prevPageBtn.addEventListener('click', () => {
  if (currentPage > 1) {
    currentPage--;
    renderPage(currentPage);
  }
});

nextPageBtn.addEventListener('click', () => {
  if (currentPage < totalPages) {
    currentPage++;
    renderPage(currentPage);
  }
});

// Sélection page entière
selectFullPageBtn.addEventListener('click', () => {
  if (!pdfDoc) return;

  tempSelection = {
    page: currentPage - 1,
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1
  };

  drawSelections();
});

// Détection de resize handle sous la souris
function getResizeHandle(mouseX, mouseY) {
  if (!tempSelection || tempSelection.page !== currentPage - 1) return null;

  const x1 = tempSelection.x1 * pdfCanvas.width;
  const y1 = tempSelection.y1 * pdfCanvas.height;
  const x2 = tempSelection.x2 * pdfCanvas.width;
  const y2 = tempSelection.y2 * pdfCanvas.height;

  const handles = [
    { name: 'nw', x: x1, y: y1 },
    { name: 'ne', x: x2, y: y1 },
    { name: 'sw', x: x1, y: y2 },
    { name: 'se', x: x2, y: y2 },
    { name: 'n', x: (x1 + x2) / 2, y: y1 },
    { name: 's', x: (x1 + x2) / 2, y: y2 },
    { name: 'w', x: x1, y: (y1 + y2) / 2 },
    { name: 'e', x: x2, y: (y1 + y2) / 2 }
  ];

  for (const handle of handles) {
    const dist = Math.sqrt(Math.pow(mouseX - handle.x, 2) + Math.pow(mouseY - handle.y, 2));
    if (dist <= handleSize + 2) {
      return handle.name;
    }
  }

  return null;
}

// Mouse events
selectionCanvas.addEventListener('mousedown', (e) => {
  if (!pdfDoc) return;

  const rect = selectionCanvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  // Check resize handle
  resizeHandle = getResizeHandle(mouseX, mouseY);

  if (resizeHandle) {
    isDrawing = true;
    startX = mouseX;
    startY = mouseY;
  } else {
    // Nouvelle sélection
    isDrawing = true;
    startX = mouseX;
    startY = mouseY;

    tempSelection = {
      page: currentPage - 1,
      x1: mouseX / pdfCanvas.width,
      y1: mouseY / pdfCanvas.height,
      x2: mouseX / pdfCanvas.width,
      y2: mouseY / pdfCanvas.height
    };
  }
});

selectionCanvas.addEventListener('mousemove', (e) => {
  if (!pdfDoc) return;

  const rect = selectionCanvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  if (!isDrawing) {
    // Update cursor based on handle
    const handle = getResizeHandle(mouseX, mouseY);
    if (handle) {
      const cursors = {
        nw: 'nw-resize', ne: 'ne-resize',
        sw: 'sw-resize', se: 'se-resize',
        n: 'n-resize', s: 's-resize',
        w: 'w-resize', e: 'e-resize'
      };
      selectionCanvas.style.cursor = cursors[handle];
    } else {
      selectionCanvas.style.cursor = 'crosshair';
    }
    return;
  }

  if (resizeHandle) {
    // Resize
    const x1 = tempSelection.x1 * pdfCanvas.width;
    const y1 = tempSelection.y1 * pdfCanvas.height;
    const x2 = tempSelection.x2 * pdfCanvas.width;
    const y2 = tempSelection.y2 * pdfCanvas.height;

    let newX1 = x1, newY1 = y1, newX2 = x2, newY2 = y2;

    if (resizeHandle.includes('n')) newY1 = mouseY;
    if (resizeHandle.includes('s')) newY2 = mouseY;
    if (resizeHandle.includes('w')) newX1 = mouseX;
    if (resizeHandle.includes('e')) newX2 = mouseX;

    tempSelection.x1 = Math.min(newX1, newX2) / pdfCanvas.width;
    tempSelection.y1 = Math.min(newY1, newY2) / pdfCanvas.height;
    tempSelection.x2 = Math.max(newX1, newX2) / pdfCanvas.width;
    tempSelection.y2 = Math.max(newY1, newY2) / pdfCanvas.height;
  } else {
    // Drag new selection
    const x = mouseX / pdfCanvas.width;
    const y = mouseY / pdfCanvas.height;

    tempSelection.x1 = Math.min(startX / pdfCanvas.width, x);
    tempSelection.y1 = Math.min(startY / pdfCanvas.height, y);
    tempSelection.x2 = Math.max(startX / pdfCanvas.width, x);
    tempSelection.y2 = Math.max(startY / pdfCanvas.height, y);
  }

  drawSelections();
});

selectionCanvas.addEventListener('mouseup', () => {
  isDrawing = false;
  resizeHandle = null;
});



// Cancel selection
cancelSelectionBtn.addEventListener('click', () => {
  tempSelection = null;
  drawSelections();
});

// New article
newArticleBtn.addEventListener('click', () => {
  if (!tempSelection) {
    alert('Aucune sélection en attente');
    return;
  }

  articles.push({
    zones: [{ ...tempSelection }]
  });

  tempSelection = null;
  drawSelections();
  refreshArticlesList();

  // Auto-scroll vers le nouvel article (le dernier)
  setTimeout(() => {
    const cards = articlesList.querySelectorAll('.article-card');
    if (cards.length > 0) {
      const lastCard = cards[cards.length - 1];
      lastCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, 100);
});

// Refresh articles list
function refreshArticlesList() {
  if (articles.length === 0) {
    articlesList.innerHTML = '<p class="has-text-grey has-text-centered">Aucun article</p>';
    return;
  }

  articlesList.innerHTML = '';

  articles.forEach((article, index) => {
    const card = document.createElement('div');
    card.className = 'article-card has-background-light';

    const header = document.createElement('div');
    header.className = 'article-header';

    const title = document.createElement('div');
    title.className = 'article-title';
    title.textContent = `📄 Article ${index + 1}`;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Supprimer l'article ${index + 1} ?`)) {
        articles.splice(index, 1);
        refreshArticlesList();
        drawSelections();
      }
    });

    header.appendChild(title);
    header.appendChild(deleteBtn);

    card.appendChild(header);

    article.zones.forEach((zone, zIndex) => {
      const zoneDetail = document.createElement('div');
      zoneDetail.className = 'zone-info';
      zoneDetail.textContent = `  Zone ${zIndex + 1}: Page ${zone.page + 1}`;
      card.appendChild(zoneDetail);
    });

    // Bouton "Ajouter la sélection à cet article"
    const addZoneBtn = document.createElement('button');
    addZoneBtn.className = 'button is-small is-dark is-fullwidth';
    addZoneBtn.textContent = 'Ajouter la sélection à cet article';
    addZoneBtn.style.marginTop = '8px';
    addZoneBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      addToArticle(index);
    });
    card.appendChild(addZoneBtn);

    // Click to go to first zone page
    card.addEventListener('click', () => {
      if (article.zones.length > 0) {
        const targetPage = article.zones[0].page + 1;
        if (targetPage !== currentPage) {
          currentPage = targetPage;
          renderPage(currentPage);
        }
      }
    });

    articlesList.appendChild(card);
  });
}

// Add to existing article
function addToArticle(articleIndex) {
  if (!tempSelection) {
    alert('Aucune sélection en attente');
    return;
  }

  articles[articleIndex].zones.push({ ...tempSelection });

  tempSelection = null;
  drawSelections();
  refreshArticlesList();

  alert(`Zone ajoutée à l'Article ${articleIndex + 1}!`);
}

// Export with images - show modal after completion
exportWithImagesBtn.addEventListener('click', async () => {
  if (!pdfPath || articles.length === 0) {
    alert('Aucun article à exporter');
    return;
  }

  // Auto-save before export
  await saveProgress();

  const result = await window.api.exportPDFWithImages({ pdfPath, articles, scale, projectId: currentProjectId });
  if (result.success) {
    // Afficher message avec nombre de transcriptions conservées
    const messageEl = document.getElementById('extraction-message');
    if (result.transcriptionsPreserved > 0) {
      messageEl.textContent = `Extraction terminée ! ${result.transcriptionsPreserved} transcription(s) conservée(s).`;
      messageEl.className = 'mb-4 has-text-success has-text-weight-bold';
    } else {
      messageEl.textContent = 'Les articles ont été extraits avec succès.';
      messageEl.className = 'mb-4';
    }

    // Show modal with choices
    extractionCompleteModal.classList.add('is-active');
  } else {
    alert('Erreur lors de l\'extraction: ' + result.error);
  }
});

// Modal handlers
gotoTranscriptionBtn.addEventListener('click', () => {
  extractionCompleteModal.classList.remove('is-active');

  // Petit délai pour laisser le temps à la modale de se fermer
  // Fix pour le bug où les inputs sont bloqués sans DevTools
  setTimeout(() => {
    if (currentProjectId) {
      window.api.openEditor(currentProjectId);
    }
  }, 100);
});

gotoProjectsBtn.addEventListener('click', () => {
  extractionCompleteModal.classList.remove('is-active');
  window.api.navigateToProjects();
});
