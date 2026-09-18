"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.callProviderModel = void 0;
exports.getCloudPlan = getCloudPlan;
exports.callLocalOllama = callLocalOllama;
exports.synthesizeResearchReport = synthesizeResearchReport;
exports.streamGemini = streamGemini;
exports.autoDetectModel = autoDetectModel;
exports.getRecommendedLocalModel = getRecommendedLocalModel;
exports.ensureOllamaRunning = ensureOllamaRunning;
const generative_ai_1 = require("@google/generative-ai");
require("dotenv/config");
const dns_1 = __importDefault(require("dns"));
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
// Reference-counted fetch patching to prevent race conditions between concurrent Tor/non-Tor calls
const ORIGINAL_FETCH = globalThis.fetch;
let torFetchRefCount = 0;
function acquireTorFetch() {
    if (torFetchRefCount === 0) {
        const torSession = electron_1.session.fromPartition('persist:tor-ai-client');
        globalThis.fetch = torSession.fetch;
    }
    torFetchRefCount++;
}
function releaseTorFetch() {
    torFetchRefCount--;
    if (torFetchRefCount <= 0) {
        torFetchRefCount = 0;
        globalThis.fetch = ORIGINAL_FETCH;
    }
}
let localModelCache = null;
let localModelCacheTime = 0;
const LOCAL_MODEL_CACHE_TTL = 30000; // 30 seconds
async function getRecommendedLocalModel(task = 'chat') {
    if (localModelCache && (Date.now() - localModelCacheTime) < LOCAL_MODEL_CACHE_TTL) {
        return localModelCache;
    }
    try {
        const res = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
            const data = (await res.json());
            if (data.models && data.models.length > 0) {
                const sorted = [...data.models].sort((a, b) => (b.size || 0) - (a.size || 0));
                localModelCache = sorted[0].name;
                localModelCacheTime = Date.now();
                return sorted[0].name;
            }
        }
    }
    catch {
        // Ollama not running
    }
    localModelCache = 'qwen2.5:3b';
    localModelCacheTime = Date.now();
    return 'qwen2.5:3b';
}
const SYSTEM_PROMPT = `You are an AI browser assistant built into a custom web browser called ICRUSH Browser.
You can help the user browse the web by executing navigation, search, AND DOM interaction commands.
You MUST respond with a valid JSON object ONLY. Do not write any markdown blocks (like \`\`\`json ... \`\`\`) or text outside of the JSON object.

AGENT MODE: You operate in a loop. After each response, the system feeds back the result of your commands as an observation. Use these observations to decide your next step. Keep going until the goal is achieved. When you see "[Step X/Y] Observation after executing commands:", that means your previous commands were executed and you should continue based on what happened.

CRITICAL RULES:
- NEVER fabricate or guess URLs. Only use "navigate" when the user gives an EXACT URL.
- NEVER guess video IDs or construct URLs with query parameters.
- When the user asks to do something ON A SPECIFIC WEBSITE, you must NAVIGATE to that site first, then INTERACT with it.
- When the user says "search X on this website" or "find X on site.com", navigate to the site, type in its search box, and search.
- When the user asks to COMPARE two websites or open tabs, you have ACCESS to the content of all open tabs in the message context (look for "--- OPEN TABS CONTENT ---"). Use this content to answer questions and make comparisons.
- When the user asks for HTML output, generate a CLEAN, BEAUTIFUL HTML document and use the "openHtml" action.

JSON Response Schema:
{
  "response": "Helpful message explaining what you are doing.",
  "commands": [
    { "action": "navigate", "url": "https://example.com" },
    { "action": "search", "query": "search query" },
    { "action": "newTab", "url": "https://example.com" },
    { "action": "type", "selector": "CSS selector", "text": "text to type" },
    { "action": "click", "selector": "CSS selector" },
    { "action": "fill", "selector": "CSS selector", "value": "text to fill" },
    { "action": "press", "key": "Enter" },
    { "action": "extract" },
    { "action": "openHtml", "html": "<html>...</html>" }
  ]
}

ACTIONS:
1. "navigate" — Open a URL in the current tab.
2. "search" — Search the web using the default search engine.
3. "newTab" — Open a URL in a new tab.
4. "type" — Type text into an input field.
5. "click" — Click on an element.
6. "fill" — Fill a form field with a value.
7. "press" — Press a keyboard key (e.g. "Enter", "Escape").
8. "extract" — Read the current page content and return it.
9. "openHtml" — Open raw HTML content in a new tab as a beautifully styled page.
10. "goBack" / "goForward" / "refresh" / "closeTab" — Navigation controls.

TAB COMPARISON:
- When the message contains "--- OPEN TABS CONTENT ---", you have access to the text content of all open browser tabs.
- Use this content to compare products, prices, features, or anything across tabs.
- When generating comparison HTML, create a clean table with alternating row colors, headers, and a modern design.

HTML GENERATION (openHtml action):
- Generate COMPLETE, SELF-CONTAINED HTML with inline CSS (no external files).
- Use modern design: clean typography, good spacing, subtle colors, rounded corners.
- Include a header with title and timestamp.
- For comparisons: use a styled table with alternating rows, highlighted differences.
- For reports: use cards, sections, visual hierarchy.
- Always include responsive design with max-width.

SELECTOR HELP:
- Search boxes: input[type="search"], input[name="q"], input[name="search"], input[placeholder*="search" i], #search, .search-input
- Search buttons: button[type="submit"], .search-btn, button[aria-label*="search" i]
- Links: a[href*="product"], a.product-link, .product-title a
- If you cannot determine the exact selector, use a common one and the agent will find the closest match.

WORKFLOW for "compare prices on these two tabs":
1. Read the "--- OPEN TABS CONTENT ---" section in the message
2. Extract relevant data (prices, features, names) from both tabs
3. Generate a beautiful HTML comparison table
4. Return the HTML via "openHtml" action
5. The browser will open it in a new tab

WORKFLOW for "search X on website.com":
1. Navigate to website.com
2. Type X into the search box using "type" action
3. Press Enter using "press" action
4. Extract results using "extract" action
5. Open the best result in a new tab using "newTab" action

EXAMPLES:
- User: "compare the prices of these two phones open in my tabs" →
  Read tab contents, generate comparison HTML, use openHtml action
- User: "make a report of the best products on these tabs" →
  Read tab contents, generate HTML report, use openHtml action
- User: "go to amazon" → navigate to amazon.com
- User: "search best guitar under 4000 on amazon" →
  Step 1: navigate to amazon.com
  Step 2: type "best guitar under 4000" into search box
  Step 3: press Enter
- User: "what is the capital of France?" → respond with answer, no commands`;
// Track response extraction state for O(n) incremental parsing
let _responseStartIdx = -1;
let _lastResponseText = '';
function extractPartialResponse(buffer) {
    // Find "response": " only once, then track from there
    if (_responseStartIdx === -1) {
        const idx = buffer.indexOf('"response"');
        if (idx === -1)
            return _lastResponseText;
        const colonIdx = buffer.indexOf(':', idx + 10);
        if (colonIdx === -1)
            return _lastResponseText;
        const quoteIdx = buffer.indexOf('"', colonIdx + 1);
        if (quoteIdx === -1)
            return _lastResponseText;
        _responseStartIdx = quoteIdx + 1;
    }
    // Extract from tracked position to current end
    const segment = buffer.substring(_responseStartIdx);
    // Find the end of the response string (unescaped quote)
    let endIdx = -1;
    for (let i = 0; i < segment.length; i++) {
        if (segment[i] === '\\') {
            i++;
            continue;
        } // skip escaped chars
        if (segment[i] === '"') {
            endIdx = i;
            break;
        }
    }
    const raw = endIdx >= 0 ? segment.substring(0, endIdx) : segment;
    _lastResponseText = raw
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    return _lastResponseText;
}
function resetResponseExtraction() {
    _responseStartIdx = -1;
    _lastResponseText = '';
}
let onlineCache = null;
let onlineCacheTime = 0;
const ONLINE_CACHE_TTL = 5000; // 5 seconds
function isOnline() {
    if (onlineCache !== null && (Date.now() - onlineCacheTime) < ONLINE_CACHE_TTL) {
        return Promise.resolve(onlineCache);
    }
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            onlineCache = false;
            onlineCacheTime = Date.now();
            resolve(false);
        }, 500);
        dns_1.default.lookup('google.com', (err) => {
            clearTimeout(timeout);
            onlineCache = !err;
            onlineCacheTime = Date.now();
            resolve(!err);
        });
    });
}
let isOllamaAutoStarted = false;
let ollamaStatusCache = null;
let ollamaLastCheckTime = 0;
const OLLAMA_CACHE_TTL = 30000; // 30 seconds
async function ensureOllamaRunning() {
    // Return cached status if recent
    if (ollamaStatusCache !== null && (Date.now() - ollamaLastCheckTime) < OLLAMA_CACHE_TTL) {
        return ollamaStatusCache;
    }
    try {
        const res = await fetch('http://127.0.0.1:11434/api/tags', { method: 'GET', signal: AbortSignal.timeout(3000) });
        if (res.ok) {
            ollamaStatusCache = true;
            ollamaLastCheckTime = Date.now();
            return true;
        }
    }
    catch {
        if (!isOllamaAutoStarted) {
            isOllamaAutoStarted = true;
            const localAppData = process.env.LOCALAPPDATA || '';
            const candidatePaths = [
                'ollama',
                path_1.default.join(localAppData, 'Programs', 'Ollama', 'ollama.exe'),
                path_1.default.join('C:', 'Program Files', 'Ollama', 'ollama.exe'),
                path_1.default.join('C:', 'Users', process.env.USERNAME || '', 'AppData', 'Local', 'Programs', 'Ollama', 'ollama.exe')
            ];
            let launched = false;
            for (const cmdPath of candidatePaths) {
                if (cmdPath === 'ollama' || fs_1.default.existsSync(cmdPath)) {
                    try {
                        const proc = (0, child_process_1.spawn)(cmdPath, ['serve'], {
                            detached: true,
                            stdio: 'ignore',
                            windowsHide: true,
                        });
                        proc.unref();
                        proc.on('error', () => { });
                        launched = true;
                        await new Promise(r => setTimeout(r, 2000));
                        break;
                    }
                    catch (e) {
                        console.warn(`[Ollama] Failed to spawn ${cmdPath}:`, e);
                    }
                }
            }
            if (!launched) {
                console.warn('[Ollama] Executable not found in standard system paths.');
                return false;
            }
        }
        // After auto-start attempt, verify Ollama is actually responding
        try {
            const retryRes = await fetch('http://127.0.0.1:11434/api/tags', { method: 'GET', signal: AbortSignal.timeout(3000) });
            ollamaStatusCache = retryRes.ok;
            ollamaLastCheckTime = Date.now();
            return retryRes.ok;
        }
        catch {
            ollamaStatusCache = false;
            ollamaLastCheckTime = Date.now();
            return false;
        }
    }
    return true;
}
async function streamOllama(message, history, onChunk, onCommand, specificModel) {
    await ensureOllamaRunning();
    const formattedMessages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...(history || []).map(msg => ({
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: msg.content,
        })),
        { role: 'user', content: message }
    ];
    const localModel = specificModel || await getRecommendedLocalModel();
    let response;
    try {
        response = await fetch('http://127.0.0.1:11434/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: localModel,
                messages: formattedMessages,
                stream: true,
            }),
            signal: AbortSignal.timeout(120000),
        });
    }
    catch (err) {
        // Invalidate cache on connection error so next request re-checks
        ollamaStatusCache = null;
        throw new Error('Ollama service is not running. Please start Ollama on your local machine to use the AI assistant offline.');
    }
    if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 404) {
            throw new Error(`Local model '${localModel}' not found. Please run 'ollama pull ${localModel}' in your terminal to download it.`);
        }
        throw new Error(`Ollama returned error (${response.status}): ${errorText}`);
    }
    const reader = response.body?.getReader();
    if (!reader) {
        throw new Error('Ollama response body is not readable');
    }
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let fullBuffer = '';
    let lastExtractedText = '';
    for (;;) {
        const { done, value } = await reader.read();
        if (done)
            break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
            const cleanLine = line.trim();
            if (!cleanLine)
                continue;
            try {
                const parsed = JSON.parse(cleanLine);
                const content = parsed.message?.content || '';
                if (content) {
                    fullBuffer += content;
                    const currentExtractedText = extractPartialResponse(fullBuffer);
                    if (currentExtractedText && currentExtractedText !== lastExtractedText) {
                        onChunk(currentExtractedText);
                        lastExtractedText = currentExtractedText;
                    }
                }
            }
            catch (e) {
                // Ignore incomplete JSON lines
            }
        }
    }
    handleFinalResponse(fullBuffer, onChunk, onCommand, lastExtractedText);
}
const modelCache = new Map();
const MODEL_CACHE_TTL = 60000; // 60 seconds
async function autoDetectModel(provider, apiKey) {
    const cacheKey = `${provider}:${apiKey.slice(0, 16)}`;
    const cached = modelCache.get(cacheKey);
    if (cached && (Date.now() - cached.time) < MODEL_CACHE_TTL) {
        return cached.model;
    }
    const model = await _autoDetectModelUncached(provider, apiKey);
    modelCache.set(cacheKey, { model, time: Date.now() });
    return model;
}
async function _autoDetectModelUncached(provider, apiKey) {
    try {
        if (provider === 'mimo' || provider === 'mimo-v2.5') {
            return 'mimo-v2.5-agentic';
        }
        if (provider === 'gemini') {
            const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
            const res = await fetch(url);
            if (res.ok) {
                const data = (await res.json());
                if (data.models && Array.isArray(data.models)) {
                    const names = data.models.map(m => m.name);
                    if (names.includes('models/gemini-3.5-flash'))
                        return 'gemini-3.5-flash';
                    if (names.includes('models/gemini-2.5-flash'))
                        return 'gemini-2.5-flash';
                    if (names.includes('models/gemini-2.0-flash'))
                        return 'gemini-2.0-flash';
                    const match = data.models.find(m => m.name.includes('flash') && m.supportedGenerationMethods?.includes('generateContent'));
                    if (match)
                        return match.name.replace('models/', '');
                }
            }
            return 'gemini-2.5-flash';
        }
        if (provider === 'groq') {
            const res = await fetch('https://api.groq.com/openai/v1/models', {
                headers: { Authorization: `Bearer ${apiKey}` },
            });
            if (res.ok) {
                const data = (await res.json());
                if (data.data && Array.isArray(data.data)) {
                    const ids = data.data.map(m => m.id);
                    if (ids.includes('llama-3.3-70b-versatile'))
                        return 'llama-3.3-70b-versatile';
                    if (ids.includes('llama-3.1-8b-instant'))
                        return 'llama-3.1-8b-instant';
                    if (ids.includes('mixtral-8x7b-32768'))
                        return 'mixtral-8x7b-32768';
                    if (ids.length > 0)
                        return ids[0];
                }
            }
            return 'llama-3.3-70b-versatile';
        }
        if (provider === 'openrouter') {
            const res = await fetch('https://openrouter.ai/api/v1/models', {
                headers: { Authorization: `Bearer ${apiKey}` },
            });
            if (res.ok) {
                const data = (await res.json());
                if (data.data && Array.isArray(data.data)) {
                    const ids = data.data.map(m => m.id);
                    if (ids.includes('google/gemini-2.5-flash'))
                        return 'google/gemini-2.5-flash';
                    if (ids.includes('meta-llama/llama-3-8b-instruct:free'))
                        return 'meta-llama/llama-3-8b-instruct:free';
                    if (ids.includes('meta-llama/llama-3-8b-instruct'))
                        return 'meta-llama/llama-3-8b-instruct';
                    if (ids.length > 0)
                        return ids[0];
                }
            }
            return 'google/gemini-2.5-flash';
        }
        if (provider === 'openai') {
            const res = await fetch('https://api.openai.com/v1/models', {
                headers: { Authorization: `Bearer ${apiKey}` },
            });
            if (res.ok) {
                const data = (await res.json());
                if (data.data && Array.isArray(data.data)) {
                    const ids = data.data.map(m => m.id);
                    if (ids.includes('gpt-4o-mini'))
                        return 'gpt-4o-mini';
                    if (ids.includes('gpt-4o'))
                        return 'gpt-4o';
                    if (ids.includes('gpt-3.5-turbo'))
                        return 'gpt-3.5-turbo';
                }
            }
            return 'gpt-4o-mini';
        }
        if (provider === 'anthropic') {
            return 'claude-3-5-sonnet-latest';
        }
    }
    catch (e) {
        console.error('Error autodetecting model:', e);
    }
    if (provider === 'openai')
        return 'gpt-4o-mini';
    if (provider === 'anthropic')
        return 'claude-3-5-sonnet-latest';
    if (provider === 'groq')
        return 'llama-3.3-70b-versatile';
    if (provider === 'openrouter')
        return 'google/gemini-2.5-flash';
    return 'gemini-2.5-flash';
}
async function parseSSEResponse(response, onChunk, onCommand, provider) {
    const reader = response.body?.getReader();
    if (!reader) {
        throw new Error('Response body is not readable');
    }
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let fullBuffer = '';
    let lastExtractedText = '';
    let currentEventType = '';
    for (;;) {
        const { done, value } = await reader.read();
        if (done)
            break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
            const cleanLine = line.trim();
            if (!cleanLine)
                continue;
            // Track SSE event type (Anthropic sends "event: xxx" lines)
            if (cleanLine.startsWith('event: ')) {
                currentEventType = cleanLine.substring(7).trim();
                continue;
            }
            if (cleanLine.startsWith('data: ')) {
                const dataStr = cleanLine.substring(6);
                if (dataStr === '[DONE]')
                    continue;
                try {
                    const parsed = JSON.parse(dataStr);
                    let chunkText = '';
                    if (provider === 'anthropic') {
                        // Anthropic format: content_block_delta events have delta.text as string
                        if (currentEventType === 'content_block_delta' && typeof parsed.delta?.text === 'string') {
                            chunkText = parsed.delta.text;
                        }
                        // Also handle message_delta with usage info (no content)
                    }
                    else {
                        // OpenAI / Groq / OpenRouter format
                        chunkText = parsed.choices?.[0]?.delta?.content || '';
                        // Google/Gemini format
                        if (!chunkText)
                            chunkText = parsed.delta?.text || '';
                    }
                    if (chunkText) {
                        fullBuffer += chunkText;
                        const currentExtractedText = extractPartialResponse(fullBuffer);
                        if (currentExtractedText && currentExtractedText !== lastExtractedText) {
                            onChunk(currentExtractedText);
                            lastExtractedText = currentExtractedText;
                        }
                    }
                }
                catch (e) {
                    // Ignore incomplete JSON lines
                }
            }
        }
    }
    handleFinalResponse(fullBuffer, onChunk, onCommand, lastExtractedText);
    return fullBuffer;
}
function handleFinalResponse(fullBuffer, onChunk, onCommand, lastStreamedText = '') {
    try {
        let jsonString = fullBuffer.trim();
        if (jsonString.startsWith('```')) {
            jsonString = jsonString
                .replace(/^```json\s*/i, '')
                .replace(/```$/, '')
                .trim();
        }
        const parsed = JSON.parse(jsonString);
        if (parsed.response && parsed.response !== lastStreamedText) {
            onChunk(parsed.response);
        }
        if (parsed.commands && Array.isArray(parsed.commands) && parsed.commands.length > 0) {
            onCommand(parsed.commands);
        }
    }
    catch (err) {
        console.error('Failed to parse final JSON response:', err, 'Raw buffer:', fullBuffer);
        if (fullBuffer !== lastStreamedText) {
            onChunk(fullBuffer);
        }
    }
}
// --- Auto-fallback: local → cloud ---
function loadApiKeys() {
    try {
        const apiKeysPath = path_1.default.join(electron_1.app.getPath('userData'), 'api-keys.enc');
        if (!fs_1.default.existsSync(apiKeysPath))
            return {};
        const encrypted = fs_1.default.readFileSync(apiKeysPath);
        return JSON.parse(electron_1.safeStorage.decryptString(encrypted));
    }
    catch {
        return {};
    }
}
async function findCloudFallback(skipProvider) {
    const keys = loadApiKeys();
    const providers = [
        { id: 'gemini', name: 'Google Gemini', key: keys['gemini'] },
        { id: 'openai', name: 'OpenAI', key: keys['openai'] },
        { id: 'anthropic', name: 'Anthropic', key: keys['anthropic'] },
        { id: 'groq', name: 'Groq', key: keys['groq'] },
        { id: 'openrouter', name: 'OpenRouter', key: keys['openrouter'] },
    ];
    for (const p of providers) {
        if (p.key && p.id !== skipProvider) {
            return { id: p.id, name: p.name, apiKey: p.key };
        }
    }
    return null;
}
async function streamWithCloud(message, history, provider, apiKey, onChunk, onCommand, options) {
    const online = await isOnline();
    if (!online)
        throw new Error('No internet connection.');
    const useTorProxy = options?.isTor && options?.torCloudRouting;
    if (useTorProxy) {
        const torSession = electron_1.session.fromPartition('persist:tor-ai-client');
        await torSession.setProxy({ proxyRules: 'socks5h://127.0.0.1:9050' });
        acquireTorFetch();
    }
    try {
        const detectedModel = await autoDetectModel(provider, apiKey);
        if (provider === 'gemini') {
            const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({
                model: detectedModel,
                systemInstruction: options?.systemInstruction || SYSTEM_PROMPT,
            });
            const formattedHistory = (history || []).map(msg => ({
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: msg.content }],
            }));
            const chat = model.startChat({ history: formattedHistory });
            const messageParts = [{ text: message }];
            if (options?.files && options.files.length > 0) {
                for (const file of options.files) {
                    messageParts.push({ inlineData: file.inlineData });
                }
            }
            const result = await chat.sendMessageStream(messageParts);
            let fullBuffer = '';
            let lastStreamedText = '';
            for await (const chunk of result.stream) {
                const text = chunk.text;
                if (text) {
                    fullBuffer += text;
                    const extractedText = extractPartialResponse(fullBuffer);
                    if (extractedText && extractedText !== lastStreamedText) {
                        onChunk(extractedText);
                        lastStreamedText = extractedText;
                    }
                }
            }
            tryParseCommands(fullBuffer, lastStreamedText, onChunk, onCommand);
        }
        else if (provider === 'anthropic') {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({
                    model: detectedModel,
                    max_tokens: 8192,
                    system: options?.systemInstruction || SYSTEM_PROMPT,
                    messages: (history || []).map(msg => ({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: msg.content })),
                    stream: true,
                }),
            });
            if (!response.ok)
                throw new Error(`Anthropic API error: ${response.status}`);
            const reader = response.body?.getReader();
            if (!reader)
                throw new Error('No response body');
            const decoder = new TextDecoder();
            let fullBuffer = '';
            let lastStreamedText = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            if (data.type === 'content_block_delta' && data.delta?.text) {
                                fullBuffer += data.delta.text;
                                const extractedText = extractPartialResponse(fullBuffer);
                                if (extractedText && extractedText !== lastStreamedText) {
                                    onChunk(extractedText);
                                    lastStreamedText = extractedText;
                                }
                            }
                        }
                        catch { /* skip */ }
                    }
                }
            }
            tryParseCommands(fullBuffer, lastStreamedText, onChunk, onCommand);
        }
        else if (provider === 'openai' || provider === 'groq' || provider === 'openrouter') {
            const baseUrl = provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : provider === 'groq' ? 'https://api.groq.com/openai/v1' : 'https://api.openai.com/v1';
            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model: detectedModel,
                    messages: [
                        { role: 'system', content: options?.systemInstruction || SYSTEM_PROMPT },
                        ...(history || []).map(msg => ({ role: msg.role, content: msg.content })),
                        { role: 'user', content: message },
                    ],
                    stream: true,
                    max_tokens: 8192,
                }),
            });
            if (!response.ok)
                throw new Error(`API error: ${response.status}`);
            const reader = response.body?.getReader();
            if (!reader)
                throw new Error('No response body');
            const decoder = new TextDecoder();
            let fullBuffer = '';
            let lastStreamedText = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                        try {
                            const data = JSON.parse(line.slice(6));
                            const content = data.choices?.[0]?.delta?.content;
                            if (content) {
                                fullBuffer += content;
                                const extractedText = extractPartialResponse(fullBuffer);
                                if (extractedText && extractedText !== lastStreamedText) {
                                    onChunk(extractedText);
                                    lastStreamedText = extractedText;
                                }
                            }
                        }
                        catch { /* skip */ }
                    }
                }
            }
            tryParseCommands(fullBuffer, lastStreamedText, onChunk, onCommand);
        }
    }
    finally {
        if (useTorProxy)
            releaseTorFetch();
    }
}
function tryParseCommands(fullBuffer, lastStreamedText, onChunk, onCommand) {
    try {
        let jsonString = fullBuffer.trim();
        if (jsonString.startsWith('```')) {
            jsonString = jsonString.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
        }
        const parsed = JSON.parse(jsonString);
        if (parsed.response && parsed.response !== lastStreamedText) {
            onChunk(parsed.response);
        }
        if (parsed.commands && Array.isArray(parsed.commands) && parsed.commands.length > 0) {
            onCommand(parsed.commands);
        }
    }
    catch (err) {
        console.error('Failed to parse final JSON response:', err);
        if (fullBuffer !== lastStreamedText) {
            onChunk(fullBuffer);
        }
    }
}
async function streamGemini(message, history, activeProvider, customApiKey, onChunk, onCommand, options) {
    resetResponseExtraction();
    const forceLocal = options?.forceLocal || activeProvider === 'local' || (options?.isTor && !options?.torCloudRouting);
    const online = await isOnline();
    // Auto-fallback: try local first, if it fails and cloud key exists, retry with cloud
    if (forceLocal) {
        try {
            await streamOllama(message, history, onChunk, onCommand, options?.modelName);
            return;
        }
        catch (localErr) {
            // Local model failed — check if we can fall back to cloud
            if (!online) {
                throw new Error(`Local Ollama failed: ${localErr.message}. No internet for cloud fallback.`);
            }
            // Try to find a cloud provider with a key
            const fallbackProvider = await findCloudFallback(customApiKey);
            if (fallbackProvider) {
                onChunk(`\n\n*Local model couldn't handle this. Switching to ${fallbackProvider.name}...*\n\n`);
                // Retry with cloud provider
                resetResponseExtraction();
                await streamWithCloud(message, history, fallbackProvider.id, fallbackProvider.apiKey, onChunk, onCommand, options);
                return;
            }
            throw localErr;
        }
    }
    if (!online) {
        throw new Error('No internet connection detected. To use the AI assistant offline, switch your AI provider to "local" (Ollama) in Settings.');
    }
    const useTorProxy = options?.isTor && options?.torCloudRouting;
    if (useTorProxy) {
        const torSession = electron_1.session.fromPartition('persist:tor-ai-client');
        await torSession.setProxy({ proxyRules: 'socks5h://127.0.0.1:9050' });
        acquireTorFetch();
    }
    try {
        const provider = activeProvider || 'gemini';
        let apiKey = customApiKey;
        if (!apiKey) {
            if (provider === 'gemini')
                apiKey = process.env.GEMINI_API_KEY;
            else if (provider === 'openai')
                apiKey = process.env.OPENAI_API_KEY;
            else if (provider === 'anthropic')
                apiKey = process.env.ANTHROPIC_API_KEY;
            else if (provider === 'groq')
                apiKey = process.env.GROQ_API_KEY;
            else if (provider === 'openrouter')
                apiKey = process.env.OPENROUTER_API_KEY;
        }
        if (!apiKey || apiKey === 'your_gemini_api_key_here' || apiKey === '') {
            throw new Error(`API key for ${provider} is not configured. Please configure it in Settings.`);
        }
        const detectedModel = await autoDetectModel(provider, apiKey);
        if (provider === 'gemini') {
            const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({
                model: detectedModel,
                systemInstruction: options?.systemInstruction || SYSTEM_PROMPT,
            });
            const formattedHistory = (history || []).map(msg => ({
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: msg.content }],
            }));
            const chat = model.startChat({
                history: formattedHistory,
            });
            const messageParts = [{ text: message }];
            if (options?.files && options.files.length > 0) {
                for (const file of options.files) {
                    messageParts.push({ inlineData: file.inlineData });
                }
            }
            const result = await chat.sendMessageStream(messageParts);
            let fullBuffer = '';
            let lastExtractedText = '';
            for await (const chunk of result.stream) {
                const text = chunk.text();
                fullBuffer += text;
                const currentExtractedText = extractPartialResponse(fullBuffer);
                if (currentExtractedText && currentExtractedText !== lastExtractedText) {
                    onChunk(currentExtractedText);
                    lastExtractedText = currentExtractedText;
                }
            }
            handleFinalResponse(fullBuffer, onChunk, onCommand, lastExtractedText);
            return;
        }
        if (provider === 'openai' || provider === 'groq' || provider === 'openrouter') {
            let endpoint = 'https://api.openai.com/v1/chat/completions';
            if (provider === 'groq')
                endpoint = 'https://api.groq.com/openai/v1/chat/completions';
            if (provider === 'openrouter')
                endpoint = 'https://openrouter.ai/api/v1/chat/completions';
            const formattedMessages = [
                { role: 'system', content: options?.systemInstruction || SYSTEM_PROMPT },
                ...(history || []).map(msg => ({
                    role: msg.role === 'assistant' ? 'assistant' : 'user',
                    content: msg.content,
                })),
                { role: 'user', content: message },
            ];
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                    ...(provider === 'openrouter'
                        ? {
                            'HTTP-Referer': 'https://github.com/google-antigravity/gemini-browser',
                            'X-Title': 'Gemini Browser',
                        }
                        : {}),
                },
                body: JSON.stringify({
                    model: detectedModel,
                    messages: formattedMessages,
                    stream: true,
                }),
                signal: AbortSignal.timeout(60000),
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API returned error (${response.status}): ${errorText}`);
            }
            await parseSSEResponse(response, onChunk, onCommand, provider);
            return;
        }
        if (provider === 'anthropic') {
            const formattedMessages = (history || []).map(msg => ({
                role: msg.role === 'assistant' ? 'assistant' : 'user',
                content: msg.content,
            }));
            formattedMessages.push({ role: 'user', content: message });
            const cleanMessages = formattedMessages.filter(m => m.content.trim() !== '');
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({
                    model: detectedModel,
                    max_tokens: 4000,
                    system: options?.systemInstruction || SYSTEM_PROMPT,
                    messages: cleanMessages,
                    stream: true,
                }),
                signal: AbortSignal.timeout(60000),
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Anthropic API returned error (${response.status}): ${errorText}`);
            }
            await parseSSEResponse(response, onChunk, onCommand, provider);
            return;
        }
    }
    finally {
        if (useTorProxy) {
            releaseTorFetch();
        }
    }
}
async function getCloudPlan(prompt, provider, apiKey) {
    try {
        const detectedModel = await autoDetectModel(provider, apiKey);
        if (provider === 'gemini') {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${detectedModel}:generateContent?key=${apiKey}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    systemInstruction: { parts: [{ text: "You are an AI technical roadmap planner. Generate a step-by-step roadmap for the given technical request. Redact any private or personal data." }] }
                })
            });
            if (!res.ok)
                throw new Error(`Gemini planning API returned ${res.status}`);
            const data = await res.json();
            return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        }
        if (provider === 'openai' || provider === 'groq' || provider === 'openrouter') {
            let endpoint = 'https://api.openai.com/v1/chat/completions';
            if (provider === 'groq')
                endpoint = 'https://api.groq.com/openai/v1/chat/completions';
            else if (provider === 'openrouter')
                endpoint = 'https://openrouter.ai/api/v1/chat/completions';
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: detectedModel,
                    messages: [
                        { role: 'system', content: 'You are an AI technical roadmap planner. Generate a step-by-step roadmap for the given technical request. Redact any private or personal data.' },
                        { role: 'user', content: prompt }
                    ]
                })
            });
            if (!res.ok)
                throw new Error(`OpenAI-compatible planning API returned ${res.status}`);
            const data = await res.json();
            return data.choices?.[0]?.message?.content || '';
        }
        if (provider === 'anthropic') {
            const res = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: 'claude-3-5-sonnet-latest',
                    max_tokens: 2000,
                    system: 'You are an AI technical roadmap planner. Generate a step-by-step roadmap for the given technical request. Redact any private or personal data.',
                    messages: [{ role: 'user', content: prompt }]
                })
            });
            if (!res.ok)
                throw new Error(`Anthropic planning API returned ${res.status}`);
            const data = await res.json();
            return data.content?.[0]?.text || '';
        }
    }
    catch (err) {
        console.error('getCloudPlan error:', err);
        throw err;
    }
    return '';
}
async function callLocalOllama(prompt, format) {
    const isRunning = await ensureOllamaRunning();
    if (!isRunning) {
        throw new Error('Ollama service is not running. Please start Ollama on your machine to use local AI features.');
    }
    const model = await getRecommendedLocalModel();
    try {
        const res = await fetch('http://127.0.0.1:11434/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: prompt }],
                stream: false,
                format: format === 'json' ? 'json' : undefined,
            }),
            signal: AbortSignal.timeout(90000),
        });
        if (!res.ok) {
            if (res.status === 404) {
                throw new Error(`Local model '${model}' not found. Please run 'ollama pull ${model}' in your terminal.`);
            }
            const errText = await res.text();
            throw new Error(`Ollama returned error (${res.status}): ${errText}`);
        }
        const data = (await res.json());
        let content = data.message?.content || '';
        if (content.startsWith('```')) {
            content = content
                .replace(/^```json\s*/i, '')
                .replace(/^```html\s*/i, '')
                .replace(/```$/, '')
                .trim();
        }
        return content;
    }
    catch (err) {
        if (err.message && (err.message.includes('Ollama') || err.message.includes('model'))) {
            throw err;
        }
        throw new Error(`Failed to connect to local Ollama (127.0.0.1:11434): ${err.message || 'Connection refused'}`);
    }
}
async function synthesizeResearchReport(topic, dataOrQuery, provider = 'gemini', apiKey = '') {
    const systemInstruction = `You are a professional AI research synthesis engine inside ICRUSH Browser.
Your task is to take research data or search topics and compile a comprehensive, highly-structured, responsive HTML report.
Guidelines:
1. Output ONLY clean semantic HTML (tables, headers <h2>, <h3>, cards <div class="card">, bullet lists <ul>, key takeaway badges).
2. Do NOT output markdown code blocks (no \`\`\`html ... \`\`\`).
3. Include:
   - <h2>Executive Summary</h2>
   - <h2>Comparative Analysis & Findings</h2> (use <table> with styled columns)
   - <h2>Key Takeaways & Actionable Insights</h2>
   - <h2>Verified Sources & Citations</h2>
4. Keep the design clean, high-contrast, and professional.`;
    const prompt = `Topic: "${topic}"\n\nResearch Data / Context:\n${dataOrQuery}\n\nSynthesize the complete HTML research report:`;
    if (provider === 'local') {
        return await callLocalOllama(`${systemInstruction}\n\n${prompt}`);
    }
    const detectedModel = await autoDetectModel(provider, apiKey);
    if (provider === 'gemini') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${detectedModel}:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                systemInstruction: { parts: [{ text: systemInstruction }] },
                tools: [{ googleSearch: {} }] // Enable Google Grounding
            })
        });
        if (!res.ok) {
            // Fallback without googleSearch tool if API key lacks tool permissions
            const fallbackRes = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    systemInstruction: { parts: [{ text: systemInstruction }] }
                })
            });
            if (!fallbackRes.ok)
                throw new Error(`Gemini synthesis API returned ${fallbackRes.status}`);
            const data = await fallbackRes.json();
            let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            return text.replace(/^```html\s*/i, '').replace(/```$/, '').trim();
        }
        const data = await res.json();
        let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        return text.replace(/^```html\s*/i, '').replace(/```$/, '').trim();
    }
    if (provider === 'openai' || provider === 'groq' || provider === 'openrouter') {
        let endpoint = 'https://api.openai.com/v1/chat/completions';
        if (provider === 'groq')
            endpoint = 'https://api.groq.com/openai/v1/chat/completions';
        else if (provider === 'openrouter')
            endpoint = 'https://openrouter.ai/api/v1/chat/completions';
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: detectedModel,
                messages: [
                    { role: 'system', content: systemInstruction },
                    { role: 'user', content: prompt }
                ]
            })
        });
        if (!res.ok)
            throw new Error(`Synthesis API error (${res.status}): ${await res.text()}`);
        const data = await res.json();
        let text = data.choices?.[0]?.message?.content || '';
        return text.replace(/^```html\s*/i, '').replace(/```$/, '').trim();
    }
    if (provider === 'anthropic') {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: detectedModel,
                max_tokens: 4000,
                system: systemInstruction,
                messages: [{ role: 'user', content: prompt }]
            })
        });
        if (!res.ok)
            throw new Error(`Anthropic synthesis error (${res.status})`);
        const data = await res.json();
        let text = data.content?.[0]?.text || '';
        return text.replace(/^```html\s*/i, '').replace(/```$/, '').trim();
    }
    return await callLocalOllama(`${systemInstruction}\n\n${prompt}`);
}

/**
 * Call a cloud provider model directly (OpenAI, Anthropic, Groq, OpenRouter, DeepSeek).
 * Used by the local-model-router when cloud consent is granted.
 */
async function callProviderModel(apiKey, prompt, provider, model, responseFormat) {
    const format = responseFormat || 'text';
    const detectedModel = model || 'gpt-4o-mini';
    if (provider === 'openai') {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: detectedModel,
                messages: [{ role: 'user', content: prompt }],
                response_format: format === 'json' ? { type: 'json_object' } : undefined
            })
        });
        if (!res.ok) throw new Error(`OpenAI error (${res.status}): ${await res.text()}`);
        const data = await res.json();
        return data.choices?.[0]?.message?.content || '';
    }
    if (provider === 'anthropic') {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: detectedModel,
                max_tokens: 4096,
                messages: [{ role: 'user', content: prompt }]
            })
        });
        if (!res.ok) throw new Error(`Anthropic error (${res.status})`);
        const data = await res.json();
        return data.content?.[0]?.text || '';
    }
    if (provider === 'groq') {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: detectedModel || 'llama-3.3-70b-versatile',
                messages: [{ role: 'user', content: prompt }],
                response_format: format === 'json' ? { type: 'json_object' } : undefined
            })
        });
        if (!res.ok) throw new Error(`Groq error (${res.status}): ${await res.text()}`);
        const data = await res.json();
        return data.choices?.[0]?.message?.content || '';
    }
    if (provider === 'openrouter') {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: detectedModel,
                messages: [{ role: 'user', content: prompt }]
            })
        });
        if (!res.ok) throw new Error(`OpenRouter error (${res.status}): ${await res.text()}`);
        const data = await res.json();
        return data.choices?.[0]?.message?.content || '';
    }
    if (provider === 'deepseek') {
        const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: detectedModel || 'deepseek-chat',
                messages: [{ role: 'user', content: prompt }]
            })
        });
        if (!res.ok) throw new Error(`DeepSeek error (${res.status}): ${await res.text()}`);
        const data = await res.json();
        return data.choices?.[0]?.message?.content || '';
    }
    throw new Error(`Unsupported provider: ${provider}`);
}
