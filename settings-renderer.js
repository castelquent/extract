// Éléments DOM
const providerSelect = document.getElementById('ai-provider');
const openaiSection = document.getElementById('openai-section');
const anthropicSection = document.getElementById('anthropic-section');
const openaiApiKey = document.getElementById('openai-api-key');
const anthropicApiKey = document.getElementById('anthropic-api-key');
const openaiModel = document.getElementById('openai-model');
const anthropicModel = document.getElementById('anthropic-model');
const aiPrompt = document.getElementById('ai-prompt');
const saveBtn = document.getElementById('save-btn');
const cancelBtn = document.getElementById('cancel-btn');

// Charger les paramètres au démarrage
window.addEventListener('DOMContentLoaded', async () => {
  const settings = await window.settingsAPI.loadSettings();

  if (settings && settings.ai) {
    providerSelect.value = settings.ai.provider || 'openai';
    openaiApiKey.value = settings.ai.openai_api_key || '';
    anthropicApiKey.value = settings.ai.anthropic_api_key || '';
    openaiModel.value = settings.ai.openai_model || 'gpt-4o';
    anthropicModel.value = settings.ai.anthropic_model || 'claude-sonnet-4-20250514';
    aiPrompt.value = settings.ai.prompt || '';
  }

  updateProviderVisibility();
});

// Changer la visibilité des sections selon le provider
providerSelect.addEventListener('change', updateProviderVisibility);

function updateProviderVisibility() {
  const provider = providerSelect.value;

  if (provider === 'openai') {
    openaiSection.style.display = 'block';
    anthropicSection.style.display = 'none';
  } else {
    openaiSection.style.display = 'none';
    anthropicSection.style.display = 'block';
  }
}

// Sauvegarder
saveBtn.addEventListener('click', async () => {
  const settings = {
    ai: {
      provider: providerSelect.value,
      openai_api_key: openaiApiKey.value,
      anthropic_api_key: anthropicApiKey.value,
      openai_model: openaiModel.value,
      anthropic_model: anthropicModel.value,
      prompt: aiPrompt.value
    }
  };

  const result = await window.settingsAPI.saveSettings(settings);

  if (result.success) {
    window.settingsAPI.closeWindow();
  } else {
    alert('Erreur lors de la sauvegarde: ' + result.error);
  }
});

// Annuler
cancelBtn.addEventListener('click', () => {
  window.settingsAPI.closeWindow();
});

// ==================== TABS ====================

const tabs = document.querySelectorAll('.tabs li');
const tabContents = document.querySelectorAll('.tab-content');

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const targetTab = tab.getAttribute('data-tab');

    // Update active tab
    tabs.forEach(t => t.classList.remove('is-active'));
    tab.classList.add('is-active');

    // Show corresponding content
    tabContents.forEach(content => {
      if (content.id === `tab-${targetTab}`) {
        content.style.display = 'block';
        content.classList.add('is-active');
      } else {
        content.style.display = 'none';
        content.classList.remove('is-active');
      }
    });
  });
});

// ==================== AUTO-UPDATE ====================

const checkUpdatesBtn = document.getElementById('check-updates-btn');
const installUpdateBtn = document.getElementById('install-update-btn');
const updateStatus = document.getElementById('update-status');
const updateMessage = document.getElementById('update-message');
const updateDownloadProgress = document.getElementById('update-download-progress');
const updateReady = document.getElementById('update-ready');
const downloadProgressBar = document.getElementById('download-progress-bar');
const downloadSpeed = document.getElementById('download-speed');
const appVersion = document.getElementById('app-version');

// Load app version
window.addEventListener('DOMContentLoaded', async () => {
  const version = await window.settingsAPI.getAppVersion();
  appVersion.textContent = version;
});

// Check for updates
checkUpdatesBtn.addEventListener('click', async () => {
  checkUpdatesBtn.classList.add('is-loading');
  hideAllUpdateUI();

  const result = await window.settingsAPI.checkForUpdates();
  checkUpdatesBtn.classList.remove('is-loading');

  if (!result.success) {
    showUpdateStatus('Erreur lors de la vérification: ' + result.error, 'is-danger');
  }
});

// Update available
window.settingsAPI.onUpdateAvailable((info) => {
  showUpdateStatus(`Nouvelle version disponible: ${info.version}`, 'is-info');

  // Auto-download
  setTimeout(() => {
    window.settingsAPI.downloadUpdate();
    updateDownloadProgress.classList.remove('is-hidden');
    updateStatus.classList.add('is-hidden');
  }, 1000);
});

// Update not available
window.settingsAPI.onUpdateNotAvailable(() => {
  showUpdateStatus('Vous avez la dernière version!', 'is-success');
});

// Download progress
window.settingsAPI.onUpdateDownloadProgress((progress) => {
  downloadProgressBar.value = progress.percent;

  const speed = (progress.bytesPerSecond / 1024 / 1024).toFixed(2);
  const transferred = (progress.transferred / 1024 / 1024).toFixed(2);
  const total = (progress.total / 1024 / 1024).toFixed(2);

  downloadSpeed.textContent = `${transferred} MB / ${total} MB (${speed} MB/s)`;
});

// Update downloaded
window.settingsAPI.onUpdateDownloaded(() => {
  updateDownloadProgress.classList.add('is-hidden');
  updateReady.classList.remove('is-hidden');
});

// Update error
window.settingsAPI.onUpdateError((error) => {
  showUpdateStatus('Erreur: ' + error, 'is-danger');
  updateDownloadProgress.classList.add('is-hidden');
});

// Install update
installUpdateBtn.addEventListener('click', () => {
  window.settingsAPI.installUpdate();
});

// Helper functions
function showUpdateStatus(message, className) {
  updateMessage.textContent = message;
  updateStatus.className = `notification mt-3 ${className}`;
  updateStatus.classList.remove('is-hidden');
}

function hideAllUpdateUI() {
  updateStatus.classList.add('is-hidden');
  updateDownloadProgress.classList.add('is-hidden');
  updateReady.classList.add('is-hidden');
}
