const statusEl = document.getElementById('status');
const detailsEl = document.getElementById('details');
const organizeBtn = document.getElementById('organizeBtn');
const optionsLink = document.getElementById('optionsLink');

optionsLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

organizeBtn.addEventListener('click', async () => {
  statusEl.textContent = 'Organizing...';
  detailsEl.textContent = '';
  organizeBtn.disabled = true;
  
  chrome.runtime.sendMessage({ type: 'organize' }, (resp) => {
    organizeBtn.disabled = false;
    if (chrome.runtime.lastError) {
      statusEl.textContent = 'Error: ' + chrome.runtime.lastError.message;
      return;
    }
    if (resp?.ok) {
      statusEl.textContent = 'Done!';
      if (resp.meta) {
        detailsEl.textContent = `Grouped ${resp.meta.groupedTabs} tabs into ${resp.meta.groups?.length || 0} groups (${resp.meta.source})`;
      }
    } else {
      statusEl.textContent = 'Failed: ' + (resp?.error || 'unknown');
    }
  });
});


