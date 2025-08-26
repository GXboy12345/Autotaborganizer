const ALLOWED_COLORS = ['grey','blue','red','yellow','green','pink','purple','cyan','orange'];

async function getApiConfig() {
  const data = await chrome.storage.local.get(['apiKey', 'apiUrl', 'model']);
  return {
    apiKey: data.apiKey || '',
    apiUrl: data.apiUrl || 'https://llm.chutes.ai/v1/chat/completions',
    model: data.model || 'deepseek-ai/DeepSeek-R1'
  };
}

async function extractContentInTab(tabId) {
  try {
    // Add timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Content extraction timeout')), 3000)
    );
    
    const resultPromise = chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        try {
          const title = document.title || '';
          const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
          const h1 = Array.from(document.querySelectorAll('h1')).map(n => n.textContent?.trim()).filter(Boolean).slice(0, 3).join(' | ');
          let bodyText = document.body?.innerText || '';
          bodyText = bodyText.replace(/\s+/g, ' ').trim();
          if (bodyText.length > 4000) bodyText = bodyText.slice(0, 4000);
          return { title, metaDesc, h1, excerpt: bodyText };
        } catch (e) {
          return { error: String(e) };
        }
      }
    });
    
    const result = await Promise.race([resultPromise, timeoutPromise]);
    return result[0].result;
  } catch (e) {
    console.warn('[extension] content extraction failed for tab', tabId, e.message);
    return { error: String(e) };
  }
}

async function enrichTabsWithContent(tabs) {
  const enriched = [];
  for (const t of tabs) {
    // Skip system/extension scheme tabs
    if (!t.url || !/^https?:/i.test(t.url) || t.url.startsWith('chrome://') || t.url.startsWith('chrome-extension://')) {
      enriched.push({ id: t.id, title: t.title, url: t.url });
      continue;
    }
    
    // Skip tabs that might not allow scripting
    if (t.status !== 'complete') {
      enriched.push({ id: t.id, title: t.title, url: t.url });
      continue;
    }
    
    const content = await extractContentInTab(t.id);
    enriched.push({ id: t.id, title: t.title, url: t.url, content });
  }
  console.log('[extension] enriched tabs', enriched.map(x => ({ 
    id: x.id, 
    hasContent: Boolean(x.content && !x.content.error),
    url: x.url?.slice(0, 50) + '...'
  })));
  return enriched;
}

function extractHostname(urlString) {
  try {
    const u = new URL(urlString);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

function fallbackGroupByDomain(tabs) {
  const domainToTabs = new Map();
  for (const tab of tabs) {
    const host = extractHostname(tab.url || '');
    if (!domainToTabs.has(host)) domainToTabs.set(host, []);
    domainToTabs.get(host).push(tab.id);
  }
  const groups = [];
  let colorIndex = 0;
  for (const [host, tabIds] of domainToTabs.entries()) {
    const color = ALLOWED_COLORS[colorIndex % ALLOWED_COLORS.length];
    colorIndex += 1;
    groups.push({ name: host, color, tabIds });
  }
  return { groups };
}

function tryParseFirstJsonObject(text) {
  if (typeof text !== 'string') return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function fetchGroupsForWindow(tabs) {
  const { apiKey, apiUrl, model } = await getApiConfig();
  
  if (!apiKey) {
    // No key: graceful fallback
    const fb = fallbackGroupByDomain(tabs);
    console.log('[extension] fallback: missing API key, groups', fb.groups.map(g => ({ name: g.name, n: g.tabIds.length })));
    return { 
      ...fb, 
      meta: { 
        source: 'fallback_missing_key',
        totalTabs: tabs.length,
        groupedTabs: fb.groups.reduce((sum, g) => sum + g.tabIds.length, 0)
      } 
    };
  }

  const systemPrompt = [
    'You are a browser tab organizer. Group tabs by their PRIMARY TOPIC/SUBJECT, not by content type.',
    '',
    'CRITICAL: Respond with ONLY valid JSON in this exact format:',
    '{',
    '  "groups": [',
    '    {',
    '      "name": "Group Name",',
    '      "color": "blue",',
    '      "tabIds": [123, 456]',
    '    }',
    '  ]',
    '}',
    '',
    'Available colors: ' + ALLOWED_COLORS.join(', '),
    '',
    'ORGANIZATION PRINCIPLE:',
    '- Group by SUBJECT/TOPIC first, not by content type',
    '- If tabs relate to the same subject, group them together regardless of content type',
    '- Content type (assignments, docs, modules) should be secondary to subject',
    '- Prefer specific, descriptive names over generic categories',
    '',
    'Rules:',
    '- Group by primary subject/topic (e.g., "Chemistry", "Work Projects", "Personal Finance")',
    '- Keep names short and descriptive (max 20 chars)',
    '- Use different colors for different groups',
    '- Include every tabId exactly once',
    '- Do not add any text before or after the JSON',
    '- Do not use markdown formatting or code blocks',
    '- Avoid generic terms like "Tools", "Apps", "Misc", "Other"',
    '',
    'Examples of GOOD grouping:',
    '- "Chemistry" (assignments, modules, docs, labs all together)',
    '- "Work Projects" (emails, docs, meetings, research all together)',
    '- "Personal Finance" (banking, budgeting, investments all together)',
    '- "Email & Calendar" (specific communication tools)',
    '- "Browser Extensions" (specific category)',
    '- "Music & Media" (specific entertainment)',
    '',
    'Examples of BAD grouping:',
    '- "Assignments" (mixing chemistry + physics + math assignments)',
    '- "Documents" (mixing work + personal + school docs)',
    '- "Modules" (mixing different subjects)',
    '- "Personal Tools" (too generic - be more specific)',
    '- "Apps" (too generic - specify purpose)',
    '- "Misc" or "Other" (avoid catch-all categories)'
  ].join('\n');

  const userContent = JSON.stringify({ tabs }, null, 2);

  const payload = {
    model: model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ],
    stream: false,
    temperature: 0.1,
    max_tokens: 2048,
    response_format: { type: 'json_object' }
  };

  console.log('[extension] calling LLM', { url: apiUrl, model: payload.model, tabsCount: tabs.length });
  
  try {
    const startedAt = Date.now();
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const ms = Date.now() - startedAt;

    if (!resp.ok) {
      throw new Error(`API responded with ${resp.status}: ${resp.statusText}`);
    }

    const data = await resp.json();
    const choice = data?.choices?.[0];
    const content = choice?.message?.content || choice?.delta?.content || '';
    console.log('[extension] LLM responded', { status: resp.status, ms, contentPreview: String(content).slice(0, 200) });
    
    let parsed = null;
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      console.warn('[extension] JSON parse failed, trying to extract JSON object:', parseError.message);
      parsed = tryParseFirstJsonObject(content);
    }

    if (!parsed || !Array.isArray(parsed.groups)) {
      console.warn('[extension] invalid/missing groups in LLM response, using fallback by domain');
      console.warn('[extension] raw content:', content);
      parsed = fallbackGroupByDomain(tabs);
    }

    // sanitize
    const validIds = new Set(tabs.map(t => t.id));
    const groups = [];
    let colorIndex = 0;
    for (const g of parsed.groups) {
      const name = String(g.name || 'Group');
      let color = g.color && ALLOWED_COLORS.includes(g.color) ? g.color : ALLOWED_COLORS[colorIndex % ALLOWED_COLORS.length];
      colorIndex += 1;
      const tabIds = Array.isArray(g.tabIds)
        ? g.tabIds.map(Number).filter(id => validIds.has(id))
        : [];
      if (tabIds.length > 0) groups.push({ name, color, tabIds });
    }

    // ensure coverage: any missing tab -> its own domain group
    const covered = new Set(groups.flatMap(g => g.tabIds));
    const missing = tabs.filter(t => !covered.has(t.id));
    if (missing.length > 0) {
      for (const m of missing) {
        groups.push({ name: extractHostname(m.url), color: ALLOWED_COLORS[colorIndex % ALLOWED_COLORS.length], tabIds: [m.id] });
        colorIndex += 1;
      }
    }

    console.log('[extension] returning groups', groups.map(g => ({ name: g.name, color: g.color, n: g.tabIds.length })));
    return { 
      groups, 
      meta: { 
        source: 'llm_or_sanitized',
        totalTabs: tabs.length,
        groupedTabs: groups.reduce((sum, g) => sum + g.tabIds.length, 0)
      } 
    };
  } catch (err) {
    console.error('[extension] LLM API error:', err?.message || err);
    const fb = fallbackGroupByDomain(tabs);
    console.log('[extension] fallback: error during LLM call, groups', fb.groups.map(g => ({ name: g.name, n: g.tabIds.length })));
    return { 
      ...fb, 
      meta: { 
        source: 'fallback_error',
        totalTabs: tabs.length,
        groupedTabs: fb.groups.reduce((sum, g) => sum + g.tabIds.length, 0)
      } 
    };
  }
}

async function organizeWindow(windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  if (!tabs || tabs.length === 0) return;
  const enriched = await enrichTabsWithContent(tabs);
  const { groups } = await fetchGroupsForWindow(enriched);

  for (const group of groups) {
    console.log('[extension] creating group', { name: group.name, color: group.color, n: group.tabIds?.length });
    const tabIds = group.tabIds.filter(id => tabs.some(t => t.id === id));
    if (tabIds.length === 0) continue;
    const groupId = await chrome.tabs.group({ tabIds });
    const update = { title: String(group.name || 'Group') };
    const color = group.color && ALLOWED_COLORS.includes(group.color) ? group.color : undefined;
    if (color) update.color = color;
    await chrome.tabGroups.update(groupId, update);
  }
}

async function organizeAllWindows() {
  const wins = await chrome.windows.getAll();
  for (const w of wins) {
    await organizeWindow(w.id);
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'organize') {
    (async () => {
      try {
        console.log('[extension] starting organization...');
        await organizeAllWindows();
        console.log('[extension] organization complete');
        sendResponse({ ok: true, meta: { source: 'success' } });
      } catch (e) {
        console.error('[extension] organization failed:', e);
        sendResponse({ ok: false, error: e?.message || String(e) });
      }
    })();
    return true; // keep channel open for async sendResponse
  }
});


