const apiKeyEl = document.getElementById('apiKey');
const apiUrlEl = document.getElementById('apiUrl');
const modelEl = document.getElementById('model');
const saveBtn = document.getElementById('saveBtn');
const savedEl = document.getElementById('saved');

async function init() {
  const data = await chrome.storage.local.get(['apiKey', 'apiUrl', 'model']);
  apiKeyEl.value = data.apiKey || '';
  apiUrlEl.value = data.apiUrl || 'https://llm.chutes.ai/v1/chat/completions';
  modelEl.value = data.model || 'deepseek-ai/DeepSeek-R1';
}

saveBtn.addEventListener('click', async () => {
  const apiKey = apiKeyEl.value.trim();
  const apiUrl = apiUrlEl.value.trim();
  const model = modelEl.value.trim();
  
  await chrome.storage.local.set({ 
    apiKey, 
    apiUrl, 
    model 
  });
  
  savedEl.textContent = 'Saved';
  setTimeout(() => (savedEl.textContent = ''), 1200);
});

init();


