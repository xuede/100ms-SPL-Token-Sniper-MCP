import WebSocket from 'ws';
import dotenv from 'dotenv';
dotenv.config();
export class WebSocketManager {
    constructor() {
        this.wsConnections = new Map();
        this.wsReconnectTimeouts = new Map();
        this.onPoolFound = null;
        this.activeSearchTokenMint = null;
        this.WS_ENDPOINTS = [
            process.env.HELIUS_WS_ENDPOINT,
            'wss://api.mainnet-beta.solana.com',
            `wss://rpc.shyft.to?api_key=${process.env.SHYFT_API_KEY}`
        ];
        this.RAYDIUM_PROGRAM_ID = process.env.RAYDIUM_PROGRAM_ID;
        this.initializeWebSockets();
    }
    async initializeWebSockets() {
        for (const endpoint of this.WS_ENDPOINTS) {
            await this.initializeWebSocket(endpoint);
        }
    }
    async initializeWebSocket(endpoint) {
        if (this.wsConnections.has(endpoint)) {
            try {
                this.wsConnections.get(endpoint)?.terminate();
            }
            catch (error) {
                // Ignore termination errors
            }
        }
        if (this.wsReconnectTimeouts.has(endpoint)) {
            clearTimeout(this.wsReconnectTimeouts.get(endpoint));
            this.wsReconnectTimeouts.delete(endpoint);
        }
        return new Promise((resolve) => {
            try {
                console.error(`[WebSocket] Connecting to ${endpoint}`);
                const ws = new WebSocket(endpoint);
                // Set connection timeout
                const connectionTimeout = setTimeout(() => {
                    if (ws.readyState !== WebSocket.OPEN) {
                        console.error(`[WebSocket] Connection timeout for ${endpoint}`);
                        ws.terminate();
                        this.wsConnections.delete(endpoint);
                        resolve(); // Continue without WebSocket
                    }
                }, 5000);
                ws.on('open', () => {
                    clearTimeout(connectionTimeout);
                    console.error(`[WebSocket] Connected to ${endpoint}`);
                    const subscribeMessage = {
                        jsonrpc: '2.0',
                        id: 1,
                        method: 'programSubscribe',
                        params: [
                            this.RAYDIUM_PROGRAM_ID,
                            {
                                encoding: 'base64',
                                commitment: 'processed'
                            }
                        ]
                    };
                    ws.send(JSON.stringify(subscribeMessage));
                    resolve();
                });
                ws.on('message', async (data) => {
                    try {
                        const parsedData = JSON.parse(data.toString());
                        if (parsedData.id === 1) {
                            console.error(`[WebSocket] Subscribed to Raydium program on ${endpoint}`);
                            return;
                        }
                        // Handle program notifications
                        if (parsedData.params?.result?.value) {
                            await this.handleProgramNotification(parsedData.params.result.value, endpoint);
                        }
                    }
                    catch (error) {
                        console.error(`[WebSocket] Message parsing error on ${endpoint}:`, error);
                    }
                });
                ws.on('error', (error) => {
                    clearTimeout(connectionTimeout);
                    console.error(`[WebSocket] Error on ${endpoint}:`, error);
                    this.wsConnections.delete(endpoint);
                    resolve(); // Continue without WebSocket
                    // Try to reconnect
                    this.wsReconnectTimeouts.set(endpoint, setTimeout(() => {
                        this.initializeWebSocket(endpoint);
                    }, 1000));
                });
                ws.on('close', () => {
                    clearTimeout(connectionTimeout);
                    console.error(`[WebSocket] Connection closed for ${endpoint}`);
                    this.wsConnections.delete(endpoint);
                    resolve(); // Continue without WebSocket
                    // Try to reconnect
                    this.wsReconnectTimeouts.set(endpoint, setTimeout(() => {
                        this.initializeWebSocket(endpoint);
                    }, 1000));
                });
                this.wsConnections.set(endpoint, ws);
            }
            catch (error) {
                console.error(`[WebSocket] Setup error for ${endpoint}:`, error);
                resolve(); // Continue without WebSocket
            }
        });
    }
    async handleProgramNotification(notification, endpoint) {
        if (!notification.transaction?.transaction?.message?.accountKeys)
            return;
        const accounts = notification.transaction.transaction.message.accountKeys;
        const instructions = [
            ...notification.transaction.transaction.message.instructions,
            ...(notification.transaction.meta.innerInstructions || []).map((i) => i.instructions).flat()
        ];
        for (const instruction of instructions) {
            // Check if instruction is from Raydium program
            if (accounts[instruction.programIdIndex] !== this.RAYDIUM_PROGRAM_ID)
                continue;
            // Check if first byte is 1 (pool creation)
            if (instruction.data[0] !== 1)
                continue;
            const keyIndices = instruction.accounts;
            const accountAddresses = keyIndices.map((i) => accounts[i]);
            // Get pool info
            const poolInfo = {
                pubkey: accountAddresses[4],
                marketId: accountAddresses[16],
                marketProgramId: accountAddresses[16], // Will be updated with actual owner
                openOrders: accountAddresses[6],
                targetOrders: accountAddresses[12],
                baseVault: accountAddresses[10],
                quoteVault: accountAddresses[11],
                endpoint
            };
            // Get market account owner
            try {
                const baseMint = accountAddresses[8].toLowerCase();
                if (this.activeSearchTokenMint && baseMint === this.activeSearchTokenMint && this.onPoolFound) {
                    console.error(`[WebSocket] Found matching pool on ${endpoint}`);
                    this.onPoolFound(poolInfo);
                }
            }
            catch (error) {
                console.error('Failed to process pool info:', error);
            }
        }
    }
    startPoolSearch(tokenMint, callback) {
        this.activeSearchTokenMint = tokenMint.toLowerCase();
        this.onPoolFound = callback;
    }
    stopPoolSearch() {
        this.activeSearchTokenMint = null;
        this.onPoolFound = null;
    }
    async closeAllConnections() {
        console.error('[Shutdown] Closing WebSocket connections...');
        for (const [endpoint, ws] of this.wsConnections) {
            try {
                ws.terminate();
            }
            catch (error) {
                console.error(`[Shutdown] WebSocket termination error for ${endpoint}:`, error);
            }
        }
        this.wsConnections.clear();
        for (const timeout of this.wsReconnectTimeouts.values()) {
            clearTimeout(timeout);
        }
        this.wsReconnectTimeouts.clear();
    }
    getActiveConnections() {
        return this.wsConnections.size;
    }
}
