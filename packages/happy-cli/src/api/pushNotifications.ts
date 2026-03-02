/**
 * Push notification client that sends directly via FCM V1 API.
 *
 * Fetches device tokens from the Happy server, then sends each notification
 * through Google's FCM HTTP V1 endpoint using a local service-account key.
 */

import axios from 'axios'
import { logger } from '@/ui/logger'
import { sendFcmNotification, hasFcmServiceAccount } from '@/firebase/fcm'

export interface PushToken {
    id: string
    token: string
    createdAt: number
    updatedAt: number
}

export class PushNotificationClient {
    private readonly token: string
    private readonly baseUrl: string

    constructor(token: string, baseUrl: string = 'https://api.cluster-fluster.com') {
        this.token = token
        this.baseUrl = baseUrl
    }

    /**
     * Fetch all push tokens for the authenticated user
     */
    async fetchPushTokens(): Promise<PushToken[]> {
        try {
            const response = await axios.get<{ tokens: PushToken[] }>(
                `${this.baseUrl}/v1/push-tokens`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'Content-Type': 'application/json'
                    }
                }
            )

            logger.debug(`Fetched ${response.data.tokens.length} push tokens`)

            response.data.tokens.forEach((token, index) => {
                logger.debug(`[PUSH] Token ${index + 1}: id=${token.id}, created=${new Date(token.createdAt).toISOString()}, updated=${new Date(token.updatedAt).toISOString()}`)
            })

            return response.data.tokens
        } catch (error) {
            logger.debug('[PUSH] [ERROR] Failed to fetch push tokens:', error)
            throw new Error(`Failed to fetch push tokens: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
    }

    /**
     * Send a push notification to all registered devices for the user.
     *
     * Fire-and-forget: errors are logged but never thrown.
     */
    sendToAllDevices(title: string, body: string, data?: Record<string, string>): void {
        logger.debug(`[PUSH] sendToAllDevices called with title: "${title}", body: "${body}"`)

        // Execute async operations without awaiting (fire-and-forget)
        ;(async () => {
            try {
                if (!hasFcmServiceAccount()) {
                    logger.debug('[PUSH] FCM service account not found — push skipped')
                    return
                }

                logger.debug('[PUSH] Fetching push tokens...')
                const tokens = await this.fetchPushTokens()
                logger.debug(`[PUSH] Fetched ${tokens.length} push tokens`)

                if (tokens.length === 0) {
                    logger.debug('[PUSH] No push tokens found for user')
                    return
                }

                const results = await Promise.allSettled(
                    tokens.map((t, i) => {
                        logger.debug(`[PUSH] Sending FCM message ${i + 1} to token id=${t.id}`)
                        return sendFcmNotification(t.token, title, body, data)
                    })
                )

                const succeeded = results.filter(r => r.status === 'fulfilled' && r.value !== null).length
                const failed = results.length - succeeded
                logger.debug(`[PUSH] Done: ${succeeded} sent, ${failed} failed`)
            } catch (error) {
                logger.debug('[PUSH] Error sending to all devices:', error)
            }
        })()
    }
}
