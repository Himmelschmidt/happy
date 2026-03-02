/**
 * Firestore-backed notification system.
 *
 * Provides a real-time `useNotifications` hook (via `onSnapshot`) and a
 * helper to mark individual notifications as read.
 */
import { useState, useEffect } from 'react'
import {
    collection,
    query,
    orderBy,
    limit,
    onSnapshot,
    doc,
    updateDoc,
} from 'firebase/firestore'
import { db } from './config'

/** A single notification as stored in Firestore + its document ID. */
export interface Notification {
    id: string
    title: string
    body: string
    source: string
    timestamp: number
    read: boolean
}

interface UseNotificationsResult {
    notifications: Notification[]
    loading: boolean
    unreadCount: number
}

/**
 * Subscribe to the 50 most-recent notifications in real-time.
 *
 * Returns the list, a loading flag, and the count of unread items.
 */
export function useNotifications(): UseNotificationsResult {
    const [notifications, setNotifications] = useState<Notification[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const q = query(
            collection(db, 'notifications'),
            orderBy('timestamp', 'desc'),
            limit(50),
        )

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const docs: Notification[] = snapshot.docs.map((d) => ({
                    id: d.id,
                    ...(d.data() as Omit<Notification, 'id'>),
                }))
                setNotifications(docs)
                setLoading(false)
            },
            (error) => {
                console.error('Firestore notifications listener error:', error)
                setLoading(false)
            },
        )

        return unsubscribe
    }, [])

    const unreadCount = notifications.filter((n) => !n.read).length

    return { notifications, loading, unreadCount }
}

/** Mark a single notification as read in Firestore. */
export async function markNotificationRead(id: string): Promise<void> {
    await updateDoc(doc(db, 'notifications', id), { read: true })
}
