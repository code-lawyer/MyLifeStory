import express from 'express';
import { createServer } from 'node:http';

/**
 * Starts a minimal Express app mounting the given router, returns { url, stop }.
 * Automatically injects a mock request.user with configurable directories.
 */
export async function startTestServer(router, dirs = {}) {
    const app = express();
    app.use(express.json());

    // Inject mock user with provided directories
    app.use((req, _res, next) => {
        req.user = { directories: dirs };
        next();
    });

    app.use('/api/world-sim', router);

    return new Promise((resolve) => {
        const server = createServer(app);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            resolve({
                url: `http://127.0.0.1:${port}/api/world-sim`,
                stop: () => new Promise(r => server.close(r)),
            });
        });
    });
}
