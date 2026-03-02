/**
 * Firestore client module for writing notifications.
 *
 * Uses the Firebase client SDK (same project as the mobile app) so no
 * service-account credentials are needed.  Notifications written here
 * are picked up in real-time by the app's `onSnapshot` listener.
 */
import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getFirestore, collection, addDoc } from 'firebase/firestore'
import { configuration } from '@/configuration'

/** Shape of a notification document stored in the `notifications` collection. */
export interface NotificationDoc {
    title: string
    body: string           // supports 1 k+ chars
    source: string         // e.g. "cli", "build-script"
    timestamp: number      // Date.now()
    read: boolean
}

let app: FirebaseApp | null = null

function getDb() {
    if (!app) {
        if (!configuration.firebaseApiKey || !configuration.firebaseProjectId) {
            throw new Error('Missing HAPPY_FIREBASE_API_KEY or HAPPY_FIREBASE_PROJECT_ID environment variables')
        }
        app = initializeApp({
            apiKey: configuration.firebaseApiKey,
            projectId: configuration.firebaseProjectId,
            storageBucket: configuration.firebaseStorageBucket,
        })
    }
    return getFirestore(app)
}

/**
 * Write a notification document to Firestore.
 *
 * @returns The Firestore document ID of the newly created notification.
 */
export async function writeNotification(notification: NotificationDoc): Promise<string> {
    const db = getDb()
    const ref = await addDoc(collection(db, 'notifications'), notification)
    return ref.id
}
