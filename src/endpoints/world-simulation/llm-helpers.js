import { stripFences } from './prompts.js';

/**
 * Parse an LLM response that may be wrapped in markdown code fences.
 * @param {string} raw - raw LLM output
 * @returns {*} parsed JSON value
 * @throws {SyntaxError} if not valid JSON after stripping fences
 */
export function parseLLMJson(raw) {
    return JSON.parse(stripFences(raw));
}
