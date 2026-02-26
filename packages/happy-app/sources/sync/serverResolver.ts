import { MMKV } from 'react-native-mmkv';
import { AsyncLock } from '@/utils/lock';
import { getServerUrl } from './serverConfig';
import { getManualLanUrl } from './serverConfig';

// Persistent storage for resolver state
const resolverStorage = new MMKV({ id: 'server-resolver' });
const ACTIVE_URL_KEY = 'active-url';

// Resolution lock to prevent concurrent probes
const resolveLock = new AsyncLock();

// Cached active URL (in-memory for fast access)
let activeUrl: string | null = resolverStorage.getString(ACTIVE_URL_KEY) ?? null;

// Debounce tracking for notifyConnectionFailed
let lastFailureNotification = 0;
const FAILURE_DEBOUNCE_MS = 10_000;

/**
 * Probe a URL to check if it's a working Happy Server.
 * Returns the URL if successful, or null on failure.
 */
async function probeUrl(url: string, timeoutMs = 3000): Promise<string | null> {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'text/plain' },
            signal: controller.signal,
        });

        clearTimeout(timer);

        if (!response.ok) return null;

        const text = await response.text();
        if (!text.includes('Welcome to Happy Server!')) return null;

        return url;
    } catch {
        return null;
    }
}

/**
 * Probe all candidate URLs in parallel; first success wins.
 * Returns the winning URL, or null if all fail.
 */
async function raceProbes(candidates: string[]): Promise<string | null> {
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return probeUrl(candidates[0]);

    return new Promise<string | null>((resolve) => {
        let settled = false;
        let pending = candidates.length;

        for (const url of candidates) {
            probeUrl(url).then((result) => {
                if (settled) return;
                if (result) {
                    settled = true;
                    resolve(result);
                } else {
                    pending--;
                    if (pending === 0) {
                        settled = true;
                        resolve(null);
                    }
                }
            });
        }
    });
}

/**
 * Re-probe primary and LAN URLs and update the active URL.
 * Uses an AsyncLock so concurrent calls coalesce into one resolution.
 */
export async function resolveNow(): Promise<void> {
    await resolveLock.inLock(async () => {
        const primaryUrl = getServerUrl();
        const lanUrl = getManualLanUrl();

        // Build de-duplicated candidate list
        const candidates: string[] = [primaryUrl];
        if (lanUrl && lanUrl !== primaryUrl) {
            candidates.push(lanUrl);
        }

        const winner = await raceProbes(candidates);
        if (winner) {
            activeUrl = winner;
            resolverStorage.set(ACTIVE_URL_KEY, winner);
        }
        // If all fail, keep existing activeUrl so Socket.IO can retry
    });
}

/**
 * Get the currently resolved server URL.
 * On first call (no cached URL), triggers a synchronous resolution
 * that falls back to the primary URL.
 */
export function getResolvedServerUrl(): string {
    if (activeUrl) return activeUrl;

    // No cached URL yet — use primary URL immediately and resolve in background
    const primary = getServerUrl();
    activeUrl = primary;
    resolveNow();
    return primary;
}

/**
 * Clear cached resolver state. Call when user changes server settings.
 */
export function resetResolver(): void {
    activeUrl = null;
    resolverStorage.delete(ACTIVE_URL_KEY);
}

/**
 * Notify the resolver that a connection attempt failed.
 * Debounced to avoid excessive probing. Triggers re-resolution.
 */
export function notifyConnectionFailed(): void {
    const now = Date.now();
    if (now - lastFailureNotification < FAILURE_DEBOUNCE_MS) return;
    lastFailureNotification = now;
    resolveNow();
}

/**
 * Check whether the currently active URL is the LAN URL.
 */
export function isUsingLanUrl(): boolean {
    if (!activeUrl) return false;
    const lanUrl = getManualLanUrl();
    return lanUrl !== null && activeUrl === lanUrl;
}
