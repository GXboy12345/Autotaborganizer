// DOM elements
const organizeBtn = document.getElementById('organizeBtn');
const organizeBtnText = document.getElementById('organizeBtnText');
const optionsLink = document.getElementById('optionsLink');
const configureApiLink = document.getElementById('configureApiLink');
const learnMoreLink = document.getElementById('learnMoreLink');
const warningContainer = document.getElementById('warningContainer');
const existingGroupsWarning = document.getElementById('existingGroupsWarning');
const progressContainer = document.getElementById('progressContainer');
const progressPercentage = document.getElementById('progressPercentage');
const progressFill = document.getElementById('progressFill');
const statusDetails = document.getElementById('statusDetails');
const resultsContainer = document.getElementById('resultsContainer');
const errorContainer = document.getElementById('errorContainer');
const errorMessage = document.getElementById('errorMessage');

// Status elements
const statusExtract = document.getElementById('statusExtract');
const statusAPI = document.getElementById('statusAPI');
const statusParse = document.getElementById('statusParse');
const statusGroup = document.getElementById('statusGroup');

// Results elements
const statTabs = document.getElementById('statTabs');
const statGroups = document.getElementById('statGroups');
const statSource = document.getElementById('statSource');

// State
let isProcessing = false;

// Event listeners
optionsLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

configureApiLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

learnMoreLink.addEventListener('click', (e) => {
  e.preventDefault();
  // Open the help page in a new tab
  chrome.tabs.create({ url: chrome.runtime.getURL('help.html') });
});

organizeBtn.addEventListener('click', async () => {
  if (isProcessing) return;
  
  startProcessing();
  
  chrome.runtime.sendMessage({ type: 'organize' }, (resp) => {
    if (chrome.runtime.lastError) {
      showError('Connection error: ' + chrome.runtime.lastError.message);
      return;
    }
    
    if (resp?.ok) {
      showResults(resp.meta);
    } else {
      showError(resp?.error || 'Unknown error occurred');
    }
  });
});

// Progress tracking
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'progress') {
    updateProgress(message);
  }
});

// Check API configuration on load
async function checkApiConfiguration() {
  const data = await chrome.storage.local.get(['apiKey']);
  const hasApiKey = data.apiKey && data.apiKey.trim() !== '';
  
  if (!hasApiKey) {
    warningContainer.classList.add('active');
  } else {
    warningContainer.classList.remove('active');
  }
}

// Check for existing groups
async function checkExistingGroups() {
  try {
    const windows = await chrome.windows.getAll();
    let hasExistingGroups = false;
    
    for (const window of windows) {
      const groups = await chrome.tabGroups.query({ windowId: window.id });
      if (groups.length > 0) {
        hasExistingGroups = true;
        break;
      }
    }
    
    if (hasExistingGroups) {
      existingGroupsWarning.classList.add('active');
    } else {
      existingGroupsWarning.classList.remove('active');
    }
  } catch (error) {
    console.error('Error checking existing groups:', error);
  }
}

// Initialize
async function initialize() {
  await checkApiConfiguration();
  await checkExistingGroups();
}

initialize();

function startProcessing() {
  isProcessing = true;
  organizeBtn.disabled = true;
  organizeBtnText.textContent = 'Processing...';
  
  // Reset UI
  progressContainer.classList.add('active');
  resultsContainer.classList.remove('active');
  errorContainer.classList.remove('active');
  
  // Reset progress
  progressFill.style.width = '0%';
  progressPercentage.textContent = '0%';
  statusDetails.textContent = '';
  
  // Reset status icons
  [statusExtract, statusAPI, statusParse, statusGroup].forEach(el => {
    el.className = 'status-icon pending';
    el.textContent = '○';
  });
}

function updateProgress(message) {
  const { phase, progress, details, error } = message;
  
  // Update progress bar
  if (progress !== undefined) {
    progressFill.style.width = `${progress}%`;
    progressPercentage.textContent = `${progress}%`;
  }
  
  // Update status details
  if (details) {
    statusDetails.textContent = details;
    
    // Add visual indicator for fallback mode
    if (details.includes('fallback') || details.includes('No API key')) {
      statusDetails.style.color = '#fbbf24'; // Yellow for fallback
    } else {
      statusDetails.style.color = 'rgba(255, 255, 255, 0.7)'; // Default color
    }
  }
  
  // Update phase status
  switch (phase) {
    case 'extract':
      statusExtract.className = 'status-icon active';
      statusExtract.textContent = '⟳';
      break;
    case 'extract_complete':
      statusExtract.className = 'status-icon complete';
      statusExtract.textContent = '✓';
      break;
    case 'api':
      statusAPI.className = 'status-icon active';
      statusAPI.textContent = '⟳';
      break;
    case 'api_complete':
      statusAPI.className = 'status-icon complete';
      statusAPI.textContent = '✓';
      break;
    case 'parse':
      statusParse.className = 'status-icon active';
      statusParse.textContent = '⟳';
      break;
    case 'parse_complete':
      statusParse.className = 'status-icon complete';
      statusParse.textContent = '✓';
      break;
    case 'group':
      statusGroup.className = 'status-icon active';
      statusGroup.textContent = '⟳';
      break;
    case 'group_complete':
      statusGroup.className = 'status-icon complete';
      statusGroup.textContent = '✓';
      break;
    case 'error':
      const errorPhase = message.errorPhase || 'unknown';
      const errorEl = getStatusElement(errorPhase);
      if (errorEl) {
        errorEl.className = 'status-icon error';
        errorEl.textContent = '✗';
      }
      break;
  }
}

function getStatusElement(phase) {
  switch (phase) {
    case 'extract': return statusExtract;
    case 'api': return statusAPI;
    case 'parse': return statusParse;
    case 'group': return statusGroup;
    default: return null;
  }
}

function showResults(meta) {
  isProcessing = false;
  organizeBtn.disabled = false;
  organizeBtnText.textContent = 'Organize All Windows';
  
  progressContainer.classList.remove('active');
  resultsContainer.classList.add('active');
  
  // Update stats
  statTabs.textContent = meta?.totalTabs || 0;
  statGroups.textContent = meta?.totalGroups || 0;
  
  // Determine the processing method and display appropriate messaging
  const source = meta?.source || 'unknown';
  const isAISuccess = meta?.isAISuccess || false;
  const isFallback = meta?.isFallback || false;
  
  let sourceText = 'Unknown';
  let sourceColor = '#4ade80'; // Default green
  
  if (isAISuccess) {
    sourceText = 'AI Processing';
    sourceColor = '#4ade80'; // Green for AI success
  } else if (isFallback) {
    sourceText = 'Domain Grouping';
    sourceColor = '#fbbf24'; // Yellow for fallback
  } else {
    // Map other sources
    const sourceMap = {
      'llm_or_sanitized': 'AI Processing',
      'fallback_missing_key': 'Domain Grouping',
      'fallback_error': 'Domain Grouping',
      'no_tabs': 'No Tabs Found'
    };
    sourceText = sourceMap[source] || source;
  }
  
  statSource.textContent = sourceText;
  statSource.style.color = sourceColor;
  
  // Update results title based on processing method
  const resultsTitle = document.querySelector('.results-title');
  if (isAISuccess) {
    resultsTitle.textContent = 'Organization Complete!';
  } else if (isFallback) {
    resultsTitle.textContent = 'Fallback Organization Complete';
  } else {
    resultsTitle.textContent = 'Organization Complete!';
  }
}

function showError(message) {
  isProcessing = false;
  organizeBtn.disabled = false;
  organizeBtnText.textContent = 'Organize All Windows';
  
  progressContainer.classList.remove('active');
  resultsContainer.classList.remove('active');
  errorContainer.classList.add('active');
  
  errorMessage.textContent = message;
}


