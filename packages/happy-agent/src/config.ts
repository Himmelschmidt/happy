import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type Config = {
    serverUrl: string;
    homeDir: string;
    credentialPath: string;
};

export function loadConfig(): Config {
    const homeDir = process.env.HAPPY_HOME_DIR ?? join(homedir(), '.happy');
    const settingsFile = join(homeDir, 'settings.json');

    // Server URL priority: environment > settings.json > default
    let settingsServerUrl: string | undefined;
    if (existsSync(settingsFile)) {
        try {
            const raw = JSON.parse(readFileSync(settingsFile, 'utf8'));
            settingsServerUrl = raw.serverUrl;
        } catch { /* ignore parse errors */ }
    }
    const serverUrl = (process.env.HAPPY_SERVER_URL ?? settingsServerUrl ?? 'https://api.cluster-fluster.com').replace(/\/+$/, '');

    const credentialPath = join(homeDir, 'agent.key');
    return { serverUrl, homeDir, credentialPath };
}
