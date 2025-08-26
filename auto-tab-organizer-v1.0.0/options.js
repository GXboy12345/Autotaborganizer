const apiKeyEl = document.getElementById('apiKey');
const apiUrlEl = document.getElementById('apiUrl');
const modelEl = document.getElementById('model');
const configForm = document.getElementById('configForm');
const statusMessage = document.getElementById('statusMessage');

async function init() {
  const data = await chrome.storage.local.get(['apiKey', 'apiUrl', 'model']);
  apiKeyEl.value = data.apiKey || '';
  apiUrlEl.value = data.apiUrl || 'https://llm.chutes.ai/v1/chat/completions';
  modelEl.value = data.model || 'deepseek-ai/DeepSeek-R1';
}

configForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const apiKey = apiKeyEl.value.trim();
  const apiUrl = apiUrlEl.value.trim();
  const model = modelEl.value.trim();
  
  // Validate URL format
  if (apiUrl && !isValidUrl(apiUrl)) {
    showStatus('Please enter a valid URL', 'error');
    return;
  }
  
  try {
    await chrome.storage.local.set({ 
      apiKey, 
      apiUrl, 
      model 
    });
    
    showStatus('Configuration saved successfully!', 'success');
  } catch (error) {
    showStatus('Failed to save configuration', 'error');
    console.error('Save error:', error);
  }
});

function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

function showStatus(message, type = 'success') {
  statusMessage.textContent = message;
  statusMessage.className = `status-message show ${type}`;
  
  // Auto-hide after 3 seconds
  setTimeout(() => {
    statusMessage.classList.remove('show');
  }, 3000);
}

// Initialize on load
init();


