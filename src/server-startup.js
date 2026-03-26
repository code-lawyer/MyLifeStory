import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import { color, urlHostnameToIPv6, getHasIP } from './util.js';

// Express routers
import { router as userDataRouter } from './users.js';
import { router as usersPrivateRouter } from './endpoints/users-private.js';
import { router as usersAdminRouter } from './endpoints/users-admin.js';
import { router as secretsRouter } from './endpoints/secrets.js';
import { router as settingsRouter } from './endpoints/settings.js';
import { router as worldSimRouter } from './endpoints/world-simulation/index.js';

/**
 * @typedef {object} ServerStartupResult
 * @property {boolean} v6Failed If the server failed to start on IPv6
 * @property {boolean} v4Failed If the server failed to start on IPv4
 * @property {boolean} useIPv6 If use IPv6
 * @property {boolean} useIPv4 If use IPv4
 */

/**
 * Setup the routers for the endpoints.
 * @param {import('express').Express} app The Express app to use
 */
export function setupPrivateEndpoints(app) {
    app.use('/', userDataRouter);
    app.use('/api/users', usersPrivateRouter);
    app.use('/api/users', usersAdminRouter);
    app.use('/api/secrets', secretsRouter);
    app.use('/api/settings', settingsRouter);
    app.use('/api/world-sim', worldSimRouter);
}

/**
 * Utilities for starting the express server.
 */
export class ServerStartup {
    /**
     * Creates a new ServerStartup instance.
     * @param {import('express').Express} app The Express app to use
     * @param {import('./command-line.js').CommandLineArguments} cliArgs The command-line arguments
     */
    constructor(app, cliArgs) {
        this.app = app;
        this.cliArgs = cliArgs;
    }

    /**
     * Prints a fatal error message and exits the process.
     * @param {string} message
     */
    #fatal(message) {
        console.error(color.red(message));
        process.exit(1);
    }

    /**
     * Checks if SSL options are valid. If not, it will print an error message and exit the process.
     * @returns {void}
     */
    #verifySslOptions() {
        if (!this.cliArgs.ssl) return;

        if (!this.cliArgs.certPath) {
            this.#fatal('Error: SSL certificate path is required when using HTTPS. Check your config');
        }

        if (!this.cliArgs.keyPath) {
            this.#fatal('Error: SSL key path is required when using HTTPS. Check your config');
        }

        if (!fs.existsSync(this.cliArgs.certPath)) {
            this.#fatal('Error: SSL certificate path does not exist');
        }

        if (!fs.existsSync(this.cliArgs.keyPath)) {
            this.#fatal('Error: SSL key path does not exist');
        }
    }

    /**
     * Creates an HTTPS server.
     * @param {URL} url The URL to listen on
     * @param {number} ipVersion the ip version to use
     * @returns {Promise<void>} A promise that resolves when the server is listening
     */
    #createHttpsServer(url, ipVersion) {
        this.#verifySslOptions();
        return new Promise((resolve, reject) => {
            /** @type {import('https').ServerOptions} */
            const sslOptions = {
                cert: fs.readFileSync(this.cliArgs.certPath),
                key: fs.readFileSync(this.cliArgs.keyPath),
                passphrase: String(this.cliArgs.keyPassphrase ?? ''),
            };
            const server = https.createServer(sslOptions, this.app);
            server.on('error', reject);
            server.on('listening', resolve);

            let host = url.hostname;
            if (ipVersion === 6) host = urlHostnameToIPv6(url.hostname);
            server.listen({
                host: host,
                port: Number(url.port || 443),
                // see https://nodejs.org/api/net.html#serverlisten for why ipv6Only is used
                ipv6Only: true,
            });
        });
    }

    /**
     * Creates an HTTP server.
     * @param {URL} url The URL to listen on
     * @param {number} ipVersion the ip version to use
     * @returns {Promise<void>} A promise that resolves when the server is listening
     */
    #createHttpServer(url, ipVersion) {
        return new Promise((resolve, reject) => {
            const server = http.createServer(this.app);
            server.on('error', reject);
            server.on('listening', resolve);

            let host = url.hostname;
            if (ipVersion === 6) host = urlHostnameToIPv6(url.hostname);
            server.listen({
                host: host,
                port: Number(url.port || 80),
                // see https://nodejs.org/api/net.html#serverlisten for why ipv6Only is used
                ipv6Only: true,
            });
        });
    }

    /**
     * Starts the server using http or https depending on config
     * @param {boolean} useIPv6 If use IPv6
     * @param {boolean} useIPv4 If use IPv4
     * @returns {Promise<[boolean, boolean]>} A promise that resolves with an array of booleans indicating if the server failed to start on IPv6 and IPv4, respectively
     */
    async #startHTTPorHTTPS(useIPv6, useIPv4) {
        let v6Failed = false;
        let v4Failed = false;

        const createFunc = this.cliArgs.ssl ? this.#createHttpsServer.bind(this) : this.#createHttpServer.bind(this);

        if (useIPv6) {
            try {
                await createFunc(this.cliArgs.getIPv6ListenUrl(), 6);
            } catch (error) {
                console.error('Warning: failed to start server on IPv6');
                console.error(error);

                v6Failed = true;
            }
        }

        if (useIPv4) {
            try {
                await createFunc(this.cliArgs.getIPv4ListenUrl(), 4);
            } catch (error) {
                console.error('Warning: failed to start server on IPv4');
                console.error(error);

                v4Failed = true;
            }
        }

        return [v6Failed, v4Failed];
    }

    /**
     * Handles the case where the server failed to start on one or both protocols.
     * @param {ServerStartupResult} result The results of the server startup
     * @returns {void}
     */
    #handleServerListenFail({ v6Failed, v4Failed, useIPv6, useIPv4 }) {
        if (v6Failed && !useIPv4) {
            this.#fatal('Error: Failed to start server on IPv6 and IPv4 disabled');
        }

        if (v4Failed && !useIPv6) {
            this.#fatal('Error: Failed to start server on IPv4 and IPv6 disabled');
        }

        if (v6Failed && v4Failed) {
            this.#fatal('Error: Failed to start server on both IPv6 and IPv4');
        }
    }

    /**
     * Performs the server startup.
     * @returns {Promise<ServerStartupResult>} A promise that resolves with an object containing the results of the server startup
     */
    async start() {
        let useIPv6 = (this.cliArgs.enableIPv6 === true);
        let useIPv4 = (this.cliArgs.enableIPv4 === true);

        if (this.cliArgs.enableIPv6 === 'auto' || this.cliArgs.enableIPv4 === 'auto') {
            const ipQuery = await getHasIP();
            let hasIPv6 = false, hasIPv4 = false;

            hasIPv6 = this.cliArgs.listen ? ipQuery.hasIPv6Any : ipQuery.hasIPv6Local;
            if (this.cliArgs.enableIPv6 === 'auto') {
                useIPv6 = hasIPv6;
            }
            if (hasIPv6) {
                if (useIPv6) {
                    console.log(color.green('IPv6 support detected'));
                } else {
                    console.log('IPv6 support detected (but disabled)');
                }
            }

            hasIPv4 = this.cliArgs.listen ? ipQuery.hasIPv4Any : ipQuery.hasIPv4Local;
            if (this.cliArgs.enableIPv4 === 'auto') {
                useIPv4 = hasIPv4;
            }
            if (hasIPv4) {
                if (useIPv4) {
                    console.log(color.green('IPv4 support detected'));
                } else {
                    console.log('IPv4 support detected (but disabled)');
                }
            }

            if (this.cliArgs.enableIPv6 === 'auto' && this.cliArgs.enableIPv4 === 'auto') {
                if (!hasIPv6 && !hasIPv4) {
                    console.error('Both IPv6 and IPv4 are not detected');
                    process.exit(1);
                }
            }
        }

        if (!useIPv6 && !useIPv4) {
            console.error('Both IPv6 and IPv4 are disabled or not detected');
            process.exit(1);
        }

        const [v6Failed, v4Failed] = await this.#startHTTPorHTTPS(useIPv6, useIPv4);
        const result = { v6Failed, v4Failed, useIPv6, useIPv4 };
        this.#handleServerListenFail(result);
        return result;
    }
}
