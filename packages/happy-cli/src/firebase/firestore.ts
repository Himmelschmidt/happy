/**
 * Firestore module for writing notifications via service-account auth.
 *
 * Uses the same service-account key as FCM (`~/.happy/fcm-service-account.json`)
 * to call the Firestore REST API directly.  This bypasses Firestore security
 * rules, so the rules can block all unauthenticated creates.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { JWT } from 'google-auth-library'
import { configuration } from '@/configuration'
import { logger } from '@/ui/logger'

const SERVICE_ACCOUNT_PATH = join(configuration.happyHomeDir, 'fcm-service-account.json')
const FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore'

/** Shape of a notification document stored in the `notifications` collection. */
export interface NotificationDoc {
    title: string
    body: string           // supports 1 k+ chars
    source: string         // e.g. "cli", "build-script"
    timestamp: number      // Date.now()
    read: boolean
}

interface ServiceAccountKey {
    project_id: string
    client_email: string
    private_key: string
}

let cachedJwt: JWT | null = null
let cachedProjectId: string | null = null

async function getAuth(): Promise<{ jwt: JWT; projectId: string }> {
    if (cachedJwt && cachedProjectId) {
        return { jwt: cachedJwt, projectId: cachedProjectId }
    }

    const raw = await readFile(SERVICE_ACCOUNT_PATH, 'utf-8')
    const key: ServiceAccountKey = JSON.parse(raw)

    const jwt = new JWT({
        email: key.client_email,
        key: key.private_key,
        scopes: [FIRESTORE_SCOPE],
    })

    cachedJwt = jwt
    cachedProjectId = key.project_id
    return { jwt, projectId: key.project_id }
}

/**
 * Convert a NotificationDoc into Firestore REST API field format.
 */
function toFirestoreFields(doc: NotificationDoc): Record<string, unknown> {
    return {
        title: { stringValue: doc.title },
        body: { stringValue: doc.body },
        source: { stringValue: doc.source },
        timestamp: { integerValue: String(doc.timestamp) },
        read: { booleanValue: doc.read },
    }
}

/**
 * Write a notification document to Firestore via REST API.
 *
 * @returns The Firestore document ID of the newly created notification.
 */
export async function writeNotification(notification: NotificationDoc): Promise<string> {
    const { jwt, projectId } = await getAuth()
    const accessToken = await jwt.authorize()

    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/notifications`

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken.access_token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields: toFirestoreFields(notification) }),
    })

    if (!response.ok) {
        const errorBody = await response.text()
        logger.debug(`[Firestore] Write failed (${response.status}): ${errorBody}`)
        throw new Error(`Firestore write failed (${response.status}): ${errorBody}`)
    }

    const result = await response.json() as { name: string }
    // name is like "projects/.../documents/notifications/DOC_ID"
    const docId = result.name.split('/').pop()!
    logger.debug(`[Firestore] Notification written: ${docId}`)
    return docId
}
