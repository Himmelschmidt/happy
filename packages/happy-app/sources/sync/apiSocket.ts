import { io, Socket } from 'socket.io-client';
import { TokenStorage } from '@/auth/tokenStorage';
import { Encryption } from './encryption/encryption';
import * as Network from 'expo-network';

//
// Types
//

export interface SyncSocketConfig {
    endpoint: string;
    token: string;
}

export interface SyncSocketState {
    isConnected: boolean;
    connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
    lastError: Error | null;
}

export type SyncSocketListener = (state: SyncSocketState) => void;

//
// Main Class
//

class ApiSocket {

    // State
    private socket: Socket | null = null;
    private config: SyncSocketConfig | null = null;
    private encryption: Encryption | null = null;
    private messageHandlers: Map<string, (data: any) => void> = new Map();
    private reconnectedListeners: Set<() => void> = new Set();
    private statusListeners: Set<(status: 'disconnected' | 'connecting' | 'connected' | 'error') => void> = new Set();
    private currentStatus: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected';
    private networkSubscription: { remove: () => void } | null = null;

    //
    // Initialization
    //

    initialize(config: SyncSocketConfig, encryption: Encryption) {
        this.config = config;
        this.encryption = encryption;
        this.connect();
    }

    //
    // Connection Management
    //

    connect() {
        if (!this.config || this.socket) {
            return;
        }

        this.updateStatus('connecting');

        this.socket = io(this.config.endpoint, {
            path: '/v1/updates',
            auth: {
                token: this.config.token,
                clientType: 'user-scoped' as const
            },
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: Infinity
        });

        this.setupEventHandlers();
        this.setupNetworkListener();
    }

    disconnect() {
        this.cleanupNetworkListener();
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.updateStatus('disconnected');
    }

    /**
     * Force reconnect if socket exists but is disconnected.
     * If socket is null but config exists, create a fresh connection.
     */
    ensureConnected() {
        if (this.socket && !this.socket.connected) {
            this.socket.connect();
        } else if (!this.socket && this.config) {
            this.connect();
        }
    }

    //
    // Listener Management
    //

    onReconnected = (listener: () => void) => {
        this.reconnectedListeners.add(listener);
        return () => this.reconnectedListeners.delete(listener);
    };

    onStatusChange = (listener: (status: 'disconnected' | 'connecting' | 'connected' | 'error') => void) => {
        this.statusListeners.add(listener);
        // Immediately notify with current status
        listener(this.currentStatus);
        return () => this.statusListeners.delete(listener);
    };

    //
    // Message Handling
    //

    onMessage(event: string, handler: (data: any) => void) {
        this.messageHandlers.set(event, handler);
        return () => this.messageHandlers.delete(event);
    }

    offMessage(event: string, handler: (data: any) => void) {
        this.messageHandlers.delete(event);
    }

    /**
     * RPC call for sessions - uses session-specific encryption
     */
    async sessionRPC<R, A>(sessionId: string, method: string, params: A): Promise<R> {
        const sessionEncryption = this.encryption!.getSessionEncryption(sessionId);
        if (!sessionEncryption) {
            throw new Error(`Session encryption not found for ${sessionId}`);
        }

        await this.waitForConnection();

        const result = await this.socket!.emitWithAck('rpc-call', {
            method: `${sessionId}:${method}`,
            params: await sessionEncryption.encryptRaw(params)
        });

        if (result.ok) {
            return await sessionEncryption.decryptRaw(result.result) as R;
        }
        throw new Error('RPC call failed');
    }

    /**
     * RPC call for machines - uses legacy/global encryption (for now)
     */
    async machineRPC<R, A>(machineId: string, method: string, params: A): Promise<R> {
        const machineEncryption = this.encryption!.getMachineEncryption(machineId);
        if (!machineEncryption) {
            throw new Error(`Machine encryption not found for ${machineId}`);
        }

        await this.waitForConnection();

        const result = await this.socket!.emitWithAck('rpc-call', {
            method: `${machineId}:${method}`,
            params: await machineEncryption.encryptRaw(params)
        });

        if (result.ok) {
            return await machineEncryption.decryptRaw(result.result) as R;
        }
        throw new Error('RPC call failed');
    }

    send(event: string, data: any) {
        if (!this.socket?.connected) {
            return false;
        }
        this.socket.emit(event, data);
        return true;
    }

    async emitWithAck<T = any>(event: string, data: any): Promise<T> {
        await this.waitForConnection();
        return await this.socket!.emitWithAck(event, data);
    }

    //
    // HTTP Requests
    //

    async request(path: string, options?: RequestInit): Promise<Response> {
        if (!this.config) {
            throw new Error('SyncSocket not initialized');
        }

        const credentials = await TokenStorage.getCredentials();
        if (!credentials) {
            throw new Error('No authentication credentials');
        }

        const url = `${this.config.endpoint}${path}`;
        const headers = {
            'Authorization': `Bearer ${credentials.token}`,
            ...options?.headers
        };

        return fetch(url, {
            ...options,
            headers
        });
    }

    //
    // Token Management
    //

    updateToken(newToken: string) {
        if (this.config && this.config.token !== newToken) {
            this.config.token = newToken;

            if (this.socket) {
                this.disconnect();
                this.connect();
            }
        }
    }

    //
    // Private Methods
    //

    /**
     * Wait for the socket to be connected, or throw after timeout.
     * Resolves immediately if already connected.
     */
    private waitForConnection(timeoutMs = 10000): Promise<void> {
        if (this.socket?.connected) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            if (!this.socket) {
                reject(new Error('Socket not initialized'));
                return;
            }

            const timeout = setTimeout(() => {
                this.socket?.off('connect', onConnect);
                reject(new Error('Socket connection timeout'));
            }, timeoutMs);

            const onConnect = () => {
                clearTimeout(timeout);
                resolve();
            };

            this.socket.once('connect', onConnect);
        });
    }

    private updateStatus(status: 'disconnected' | 'connecting' | 'connected' | 'error') {
        if (this.currentStatus !== status) {
            this.currentStatus = status;
            this.statusListeners.forEach(listener => listener(status));
        }
    }

    private setupNetworkListener() {
        this.cleanupNetworkListener();
        this.networkSubscription = Network.addNetworkStateListener((state) => {
            if (state.isConnected && state.isInternetReachable !== false) {
                if (this.socket && !this.socket.connected) {
                    // Force a fresh reconnect when network comes back
                    this.socket.disconnect();
                    this.socket.connect();
                }
            }
        });
    }

    private cleanupNetworkListener() {
        if (this.networkSubscription) {
            this.networkSubscription.remove();
            this.networkSubscription = null;
        }
    }

    private setupEventHandlers() {
        if (!this.socket) return;

        // Connection events
        this.socket.on('connect', () => {
            // console.log('🔌 SyncSocket: Connected, recovered: ' + this.socket?.recovered);
            // console.log('🔌 SyncSocket: Socket ID:', this.socket?.id);
            this.updateStatus('connected');
            if (!this.socket?.recovered) {
                this.reconnectedListeners.forEach(listener => listener());
            }
        });

        this.socket.on('disconnect', (reason) => {
            // console.log('🔌 SyncSocket: Disconnected', reason);
            this.updateStatus('disconnected');
        });

        // Error events
        this.socket.on('connect_error', (error) => {
            // console.error('🔌 SyncSocket: Connection error', error);
            this.updateStatus('error');
        });

        this.socket.on('error', (error) => {
            // console.error('🔌 SyncSocket: Error', error);
            this.updateStatus('error');
        });

        // Message handling
        this.socket.onAny((event, data) => {
            // console.log(`📥 SyncSocket: Received event '${event}':`, JSON.stringify(data).substring(0, 200));
            const handler = this.messageHandlers.get(event);
            if (handler) {
                // console.log(`📥 SyncSocket: Calling handler for '${event}'`);
                handler(data);
            } else {
                // console.log(`📥 SyncSocket: No handler registered for '${event}'`);
            }
        });
    }
}

//
// Singleton Export
//

export const apiSocket = new ApiSocket();
