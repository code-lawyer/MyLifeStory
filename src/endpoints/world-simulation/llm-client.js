/**
 * Minimal LLM client for world-simulation server-side calls.
 * Reads API config from the user's settings; callers can inject a mock via setLLMAdapter.
 */

let adapter = null;

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

    const { apiUrl, apiKey, model } = apiConfig;
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
    return data.choices[0].message.content;
}
