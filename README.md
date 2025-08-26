# Auto Tab Organizer v1.0.0

I've built a Chrome extension that organizes browser tabs using any chat completion API. This eliminates the need for local servers—you configure your preferred LLM service directly in the extension options.

## What This Does

The extension extracts content from your tabs, sends it to your configured API, and groups tabs by topic. When your API is unavailable, it falls back to domain-based grouping. This approach gives you control over which service processes your data while maintaining functionality regardless of API status.

## Setup: Three Steps

### 1. Load the Extension
- Navigate to `chrome://extensions`
- Enable Developer mode
- Click "Load unpacked" → select the `auto-tab-organizer-v1.0.0` folder

### 2. Configure Your API
- Click the extension icon → "Options"
- Enter your credentials:
  - **API Key**: Your authentication token
  - **API URL**: Endpoint (e.g., `https://api.openai.com/v1/chat/completions`)
  - **Model**: Service-specific model name (e.g., `gpt-4`)

### 3. Organize Your Tabs
- Click the extension icon → "Organize all windows"
- Your tabs will be grouped by topic automatically

## Supported Services

This works with any OpenAI-compatible API. I've tested these specifically:

- **OpenAI**: `https://api.openai.com/v1/chat/completions` (GPT-4, GPT-3.5-turbo)
- **Anthropic**: `https://api.anthropic.com/v1/messages` (Claude models)
- **DeepSeek**: `https://api.deepseek.com/v1/chat/completions` (DeepSeek-R1)
- **Chutes**: `https://llm.chutes.ai/v1/chat/completions` (various models)
- **Ollama**: `http://localhost:11434/v1/chat/completions` (local models)

## Example Configurations

### OpenAI GPT-4
```
API Key: sk-...
API URL: https://api.openai.com/v1/chat/completions
Model: gpt-4
```

### Anthropic Claude
```
API Key: sk-ant-...
API URL: https://api.anthropic.com/v1/messages
Model: claude-3-sonnet-20240229
```

### Local Ollama
```
API Key: (leave empty)
API URL: http://localhost:11434/v1/chat/completions
Model: llama2
```

## How It Works

The extension operates through three phases:

1. **Content Extraction**: For each tab, I extract the title, meta description, and a 4000-character excerpt of the body text. This provides context without overwhelming the API.

2. **LLM Analysis**: The enriched tab data goes to your configured API with a system prompt that emphasizes topic-based grouping over content-type grouping. The prompt specifically avoids generic categories like "Tools" or "Misc."

3. **Smart Grouping**: The API response is parsed, sanitized, and applied to create tab groups. If any tabs aren't covered by the API response, they're grouped by domain as a fallback.

## Privacy & Security

Your tab content is sent to your configured API service—no data passes through any intermediate servers. API keys are stored securely in Chrome's extension storage. The extension functions in fallback mode (domain-based grouping) when no API key is provided.

## Technical Details

The extension uses Chrome's `chrome.scripting.executeScript` API to extract content from tabs. This requires the `scripting` permission and works only on `https://` and `http://` URLs. The LLM prompt is designed to produce valid JSON responses, with fallback parsing for malformed responses.

All in all, this extension provides intelligent tab organization while giving you complete control over which AI service processes your data.
