/**
 * Firebase configuration and Firestore instance.
 *
 * Shared by all Firebase-dependent modules in the app (notifications, etc.).
 * Config values are loaded from the app config system (env vars / expo config).
 */
import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { loadAppConfig } from '@/sync/appConfig'

const appConfig = loadAppConfig()

if (!appConfig.firebaseApiKey || !appConfig.firebaseProjectId) {
    console.warn('[firebase/config] Missing EXPO_PUBLIC_FIREBASE_API_KEY or EXPO_PUBLIC_FIREBASE_PROJECT_ID — Firestore will not work')
}

const firebaseConfig = {
    apiKey: appConfig.firebaseApiKey ?? '',
    projectId: appConfig.firebaseProjectId ?? '',
    storageBucket: appConfig.firebaseStorageBucket ?? '',
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
