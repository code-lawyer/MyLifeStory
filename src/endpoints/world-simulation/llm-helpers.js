import { stripFences } from './prompts.js';
import { callLLM } from './llm-client.js';

/**
 * Custom error class for LLM call failures.
 */
export class LLMError extends Error {
    constructor(message, cause) {
        super(message);
        this.name = 'LLMError';
        this.cause = cause;
    }
}

/**
 * Parse an LLM response that may be wrapped in markdown code fences.
 * @param {string} raw - raw LLM output
 * @returns {*} parsed JSON value
 * @throws {SyntaxError} if not valid JSON after stripping fences
 */
export function parseLLMJson(raw) {
    return JSON.parse(stripFences(raw));
}

/**
 * Call LLM and parse JSON response with standard error handling.
 * If res is provided, returns null on failure and sends 502 response.
 * If res is null, throws LLMError on failure.
 * @param {object[]} messages - OpenAI-style message array
 * @param {string} systemPrompt
 * @param {object} apiConfig - { apiUrl, apiKey, model }
 * @param {import('express').Response|null} res - Express response object (optional)
 * @returns {Promise<object|null>} - parsed JSON or null (if res provided and failed)
 */
export async function callLLMForJson(messages, systemPrompt, apiConfig, res = null) {
    try {
        const raw = await callLLM(messages, systemPrompt, apiConfig);
        return parseLLMJson(raw);
    } catch (err) {
        if (res) {
            res.status(502).json({ error: 'llm_unavailable' });
            return null;
        }
        throw new LLMError('LLM call or JSON parse failed', err);
    }
}

/**
 * Call LLM for plain text response with standard error handling.
 * If res is provided, returns null on failure and sends 502 response.
 * @param {object[]} messages
 * @param {string} systemPrompt
 * @param {object} apiConfig
 * @param {import('express').Response|null} res
 * @returns {Promise<string|null>}
 */
export async function callLLMForText(messages, systemPrompt, apiConfig, res = null) {
    try {
        const raw = await callLLM(messages, systemPrompt, apiConfig);
        return raw.trim();
    } catch (err) {
        if (res) {
            res.status(502).json({ error: 'llm_unavailable' });
            return null;
        }
        throw new LLMError('LLM call failed', err);
    }
}
