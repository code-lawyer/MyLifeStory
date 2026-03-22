/**
 * Middleware factory that validates URL params match a safe ID pattern.
 * Rejects requests with invalid IDs before they reach storage.
 */
const SAFE_ID = /^[\w-]{1,64}$/;

export function validateIdParams(...paramNames) {
    return (req, res, next) => {
        for (const name of paramNames) {
            const value = req.params[name];
            if (value !== undefined && !SAFE_ID.test(value)) {
                return res.status(400).json({ error: 'invalid_id', param: name });
            }
        }
        next();
    };
}

/**
 * Validate that a body field matches the safe ID pattern.
 */
export function isValidId(id) {
    return typeof id === 'string' && SAFE_ID.test(id);
}
