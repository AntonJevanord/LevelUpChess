const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({ testDir: './tests', webServer: { command: 'npm start', url: 'http://127.0.0.1:4173', reuseExistingServer: false }, use: { browserName: 'chromium', headless: true, launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {} }, workers: 2 });
