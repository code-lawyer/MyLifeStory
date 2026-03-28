/**
 * Minimal LLM client for world-simulation server-side calls.
 * Reads API config from the user's settings; callers can inject a mock via setLLMAdapter.
 */

let adapter = null;

function validateApiUrl(apiUrl) {
    try {
        const url = new URL(apiUrl);
        if (!['http:', 'https:'].includes(url.protocol)) {
            throw new Error('apiUrl must use http or https protocol');
        }
        // Block private/loopback networks in production to prevent SSRF
        if (process.env.NODE_ENV === 'production') {
            const h = url.hostname;
            if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '0.0.0.0' ||
                h.startsWith('10.') || h.startsWith('192.168.') ||
                h.startsWith('169.254.') ||
                /^172\.(1[6-9]|2\d|3[01])\./.test(h)) {
                throw new Error('apiUrl cannot target private networks in production');
            }
        }
    } catch (err) {
        if (err.message.startsWith('apiUrl')) throw err;
        throw new Error(`Invalid apiUrl: ${apiUrl}`);
    }
}

/**
 * Override the LLM adapter (used in tests).
 * @param {((messages: object[], system: string) => Promise<string>)|null} fn
 */
export function setLLMAdapter(fn) {
    adapter = fn;
}

/**
 * Call the LLM and return the assistant text response.
 * @param {object[]} messages - OpenAI-style message array
 * @param {string} systemPrompt
 * @param {object} apiConfig - { apiUrl, apiKey, model }
 * @returns {Promise<string>}
 */
export async function callLLM(messages, systemPrompt, apiConfig) {
    if (adapter) return adapter(messages, systemPrompt);

    const { apiUrl, apiKey, model } = apiConfig ?? {};
    if (!apiUrl || !apiKey || !model) {
        throw new Error('API 未配置，请前往设置填写 API URL、Key 和模型名称');
    }
    validateApiUrl(apiUrl);
    const response = await fetch(`${apiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                ...messages,
            ],
        }),
    });

    if (!response.ok) {
        throw new Error(`LLM API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (content == null) throw new Error('LLM API returned no content');
    return content;
}

/**
 * Stream LLM response, calling onChunk for each text delta.
 * Falls back to adapter (returns full text as single chunk) in test mode.
 * @param {object[]} messages
 * @param {string} systemPrompt
 * @param {object} apiConfig - { apiUrl, apiKey, model }
 * @param {(delta: string) => void} onChunk
 */
export async function streamLLM(messages, systemPrompt, apiConfig, onChunk) {
    if (adapter) {
        const text = await adapter(messages, systemPrompt);
        onChunk(text);
        return;
    }

    const { apiUrl, apiKey, model } = apiConfig ?? {};
    if (!apiUrl || !apiKey || !model) {
        throw new Error('API 未配置，请前往设置填写 API URL、Key 和模型名称');
    }
    validateApiUrl(apiUrl);
    const response = await fetch(`${apiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            stream: true,
            messages: [
                { role: 'system', content: systemPrompt },
                ...messages,
            ],
        }),
    });

    if (!response.ok) throw new Error(`LLM API error: ${response.status}`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // keep incomplete line
            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const data = line.slice(6).trim();
                if (data === '[DONE]') return;
                try {
                    const parsed = JSON.parse(data);
                    const delta = parsed?.choices?.[0]?.delta?.content;
                    if (delta) onChunk(delta);
                } catch { /* skip malformed lines */ }
            }
        }
    } finally {
        reader.cancel();
    }
}
