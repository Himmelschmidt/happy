/**
 * FCM (Firebase Cloud Messaging) V1 API client.
 *
 * Sends push notifications directly to devices using a Google service-account
 * key file, bypassing the Expo push relay entirely.
 *
 * Service account key is expected at `~/.happy/fcm-service-account.json`
 * (or `$HAPPY_HOME_DIR/fcm-service-account.json`).
 */

import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { JWT } from 'google-auth-library'
import { configuration } from '@/configuration'
import { logger } from '@/ui/logger'

/** Resolved path to the service-account key file. */
const SERVICE_ACCOUNT_PATH = join(configuration.happyHomeDir, 'fcm-service-account.json')

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'

interface ServiceAccountKey {
    project_id: string
    client_email: string
    private_key: string
}

interface FcmMessagePayload {
    message: {
        token: string
        notification: {
            title: string
            body: string
        }
        data?: Record<string, string>
        android?: {
            priority: 'HIGH' | 'NORMAL'
        }
    }
}

/** Cached JWT client — reused across calls so tokens are refreshed automatically. */
let cachedJwt: JWT | null = null
let cachedProjectId: string | null = null

/**
 * Returns true if the FCM service account key file exists on disk.
 */
export function hasFcmServiceAccount(): boolean {
    return existsSync(SERVICE_ACCOUNT_PATH)
}

async function getJwtClient(): Promise<{ jwt: JWT; projectId: string }> {
    if (cachedJwt && cachedProjectId) {
        return { jwt: cachedJwt, projectId: cachedProjectId }
    }

    const raw = await readFile(SERVICE_ACCOUNT_PATH, 'utf-8')
    const key: ServiceAccountKey = JSON.parse(raw)

    const jwt = new JWT({
        email: key.client_email,
        key: key.private_key,
        scopes: [FCM_SCOPE],
    })

    cachedJwt = jwt
    cachedProjectId = key.project_id
    return { jwt, projectId: key.project_id }
}

/**
 * Send a push notification to a single device via FCM V1 HTTP API.
 *
 * @returns The FCM message name (ID) on success, or null on failure.
 */
export async function sendFcmNotification(
    deviceToken: string,
    title: string,
    body: string,
    data?: Record<string, string>,
): Promise<string | null> {
    const { jwt, projectId } = await getJwtClient()
    const accessToken = await jwt.authorize()

    const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`

    const payload: FcmMessagePayload = {
        message: {
            token: deviceToken,
            notification: { title, body },
            android: { priority: 'HIGH' },
        },
    }

    if (data) {
        // FCM data values must be strings
        payload.message.data = data
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken.access_token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    })

    if (!response.ok) {
        const errorBody = await response.text()
        logger.debug(`[FCM] Send failed (${response.status}): ${errorBody}`)
        return null
    }

    const result = await response.json() as { name: string }
    logger.debug(`[FCM] Message sent: ${result.name}`)
    return result.name
}
