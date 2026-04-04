const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const http = require('http');

const PORT = 8768;
const DEV_DATA_ROOT = path.join(__dirname, '..', 'data');
const PROD_DATA_ROOT = path.join(app.getPath('userData'), 'data');
const DATA_ROOT = app.isPackaged ? PROD_DATA_ROOT : DEV_DATA_ROOT;

let mainWindow = null;

// Inject CLI args before server.js reads them
process.argv.push('--dataRoot', DATA_ROOT, '--port', String(PORT), '--disableCsrf', '--whitelist', 'false');

async function startServer() {
    try {
        await import('../server.js');
    } catch (err) {
        console.error('[electron] Failed to start server:', err);
        app.quit();
    }
}

function waitForServer(retries = 30) {
    return new Promise((resolve, reject) => {
        const attempt = (n) => {
            http.get(`http://127.0.0.1:${PORT}/api/world-sim/health`, (res) => {
                if (res.statusCode === 200) return resolve();
                res.resume(); // drain socket before retrying
                retry(n);
            }).on('error', () => retry(n));
        };
        const retry = (n) => {
            if (n <= 0) return reject(new Error('Server did not start in time'));
            setTimeout(() => attempt(n - 1), 500);
        };
        attempt(retries);
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        title: 'MyLifeStory',
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    mainWindow.loadURL(`http://127.0.0.1:${PORT}`);

    // Open external links in system browser, not in-app
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (!url.startsWith(`http://127.0.0.1:${PORT}`)) {
            shell.openExternal(url);
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });

    mainWindow.on('closed', () => { mainWindow = null; });
}

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.whenReady().then(async () => {
    try {
        await startServer();
        await waitForServer();
        createWindow();
    } catch (err) {
        console.error('[electron] Startup failed:', err);
        app.quit();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
