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
