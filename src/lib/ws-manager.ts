import WebSocket from 'ws';
import { PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

export interface PoolInfo {
  pubkey: string;
  marketId: string;
  marketProgramId: string;
  baseVault: string;
  quoteVault: string;
  openOrders: string;
  targetOrders: string;
  endpoint: string;
}

export class WebSocketManager {
  private wsConnections: Map<string, WebSocket> = new Map();
  private wsReconnectTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private onPoolFound: ((poolInfo: PoolInfo) => void) | null = null;
  private activeSearchTokenMint: string | null = null;
  private connectionAttempts: Map<string, number> = new Map();
  private readonly MAX_RETRIES = 3;

  private readonly WS_ENDPOINTS = [
    process.env.HELIUS_WS_ENDPOINT!,
    'wss://api.mainnet-beta.solana.com',
    // Only add Shyft if explicitly enabled
    ...(process.env.ENABLE_SHYFT_WS === 'true' ? [`wss://rpc.shyft.to?api_key=${process.env.SHYFT_API_KEY}`] : [])
  ].filter(Boolean);

  private readonly RAYDIUM_PROGRAM_ID = process.env.RAYDIUM_PROGRAM_ID!;

  constructor() {
    this.initializeWebSockets();
  }

  private async initializeWebSockets() {
    console.error('[WS] Initializing WebSocket connections to:', this.WS_ENDPOINTS.join(', '));
    for (const endpoint of this.WS_ENDPOINTS) {
      await this.initializeWebSocket(endpoint);
    }
    console.error(`[WS] ${this.wsConnections.size}/${this.WS_ENDPOINTS.length} WebSocket connections established`);
  }

  private async initializeWebSocket(endpoint: string) {
    if (this.wsConnections.has(endpoint)) {
      try {
        this.wsConnections.get(endpoint)?.terminate();
      } catch (error) {
        // Ignore termination errors
      }
    }

    if (this.wsReconnectTimeouts.has(endpoint)) {
      clearTimeout(this.wsReconnectTimeouts.get(endpoint)!);
      this.wsReconnectTimeouts.delete(endpoint);
    }

    // Check retry count
    const attempts = this.connectionAttempts.get(endpoint) || 0;
    if (attempts >= this.MAX_RETRIES) {
      console.error(`[WS] Max retries reached for ${endpoint}, skipping further attempts`);
      return;
    }

    return new Promise<void>((resolve) => {
      try {
        console.error(`[WS] Connecting to ${endpoint}`);
        const ws = new WebSocket(endpoint);

        // Set connection timeout
        const connectionTimeout = setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            console.error(`[WS] Connection timeout for ${endpoint}`);
            ws.terminate();
            this.wsConnections.delete(endpoint);
            
            // Increment retry count
            this.connectionAttempts.set(endpoint, attempts + 1);
            
            resolve(); // Continue without WebSocket
          }
        }, 5000);

        ws.on('open', () => {
          clearTimeout(connectionTimeout);
          console.error(`[WS] Connected to ${endpoint}`);
          
          // Reset retry count on successful connection
          this.connectionAttempts.delete(endpoint);
          
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

        ws.on('message', async (data: WebSocket.Data) => {
          try {
            const parsedData = JSON.parse(data.toString());
            if (parsedData.id === 1) {
              console.error(`[WS] Subscribed to Raydium program on ${endpoint}`);
              return;
            }
            
            // Handle program notifications
            if (parsedData.params?.result?.value) {
              await this.handleProgramNotification(parsedData.params.result.value, endpoint);
            }
          } catch (error) {
            console.error(`[WS] Message parsing error on ${endpoint}:`, error);
          }
        });

        ws.on('error', (error) => {
          clearTimeout(connectionTimeout);
          console.error(`[WS] Error on ${endpoint}:`, error);
          this.wsConnections.delete(endpoint);
          resolve(); // Continue without WebSocket
          
          // Only try to reconnect if we haven't exceeded max retries
          if ((this.connectionAttempts.get(endpoint) || 0) < this.MAX_RETRIES) {
            this.wsReconnectTimeouts.set(endpoint, setTimeout(() => {
              this.initializeWebSocket(endpoint);
            }, 1000));
          }
        });

        ws.on('close', () => {
          clearTimeout(connectionTimeout);
          console.error(`[WS] Connection closed for ${endpoint}`);
          this.wsConnections.delete(endpoint);
          resolve(); // Continue without WebSocket
          
          // Only try to reconnect if we haven't exceeded max retries
          if ((this.connectionAttempts.get(endpoint) || 0) < this.MAX_RETRIES) {
            this.wsReconnectTimeouts.set(endpoint, setTimeout(() => {
              this.initializeWebSocket(endpoint);
            }, 1000));
          }
        });

        this.wsConnections.set(endpoint, ws);

      } catch (error) {
        console.error(`[WS] Setup error for ${endpoint}:`, error);
        resolve(); // Continue without WebSocket
      }
    });
  }

  private async handleProgramNotification(notification: any, endpoint: string) {
    // Skip if we're not actively searching for a pool
    if (!this.activeSearchTokenMint || !this.onPoolFound) return;

    // Quick check if this is a transaction we care about
    if (!notification.transaction?.transaction?.message?.accountKeys) return;

    const accounts = notification.transaction.transaction.message.accountKeys;
    const instructions = [
      ...notification.transaction.transaction.message.instructions,
      ...(notification.transaction.meta.innerInstructions || []).map((i: any) => i.instructions).flat()
    ];

    for (const instruction of instructions) {
      // Check if instruction is from Raydium program
      if (accounts[instruction.programIdIndex] !== this.RAYDIUM_PROGRAM_ID) continue;

      // Check if first byte is 1 (pool creation)
      if (instruction.data[0] !== 1) continue;

      const keyIndices = instruction.accounts;
      const accountAddresses = keyIndices.map((i: number) => accounts[i]);

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
        console.error(`[WS] Checking pool token: ${baseMint} against our target: ${this.activeSearchTokenMint}`);
        
        if (baseMint === this.activeSearchTokenMint) {
          console.error(`[WS] Found matching pool on ${endpoint}! Pool: ${poolInfo.pubkey}`);
          this.onPoolFound(poolInfo);
        }
      } catch (error) {
        console.error('[WS] Failed to process pool info:', error);
      }
    }
  }

  startPoolSearch(tokenMint: string, callback: (poolInfo: PoolInfo) => void) {
    this.activeSearchTokenMint = tokenMint.toLowerCase();
    this.onPoolFound = callback;
    console.error(`[WS] Started pool search for token: ${tokenMint}`);
    console.error(`[WS] Active connections: ${this.getActiveConnections()} / ${this.WS_ENDPOINTS.length}`);
    
    if (this.getActiveConnections() === 0) {
      console.error('[WS] WARNING: No active WebSocket connections for pool search!');
      // Try to reconnect if all connections are down
      this.initializeWebSockets();
    }
  }

  stopPoolSearch() {
    console.error(`[WS] Stopped pool search for token: ${this.activeSearchTokenMint}`);
    this.activeSearchTokenMint = null;
    this.onPoolFound = null;
  }

  async closeAllConnections() {
    console.error('[WS] Closing all WebSocket connections...');
    for (const [endpoint, ws] of this.wsConnections) {
      try {
        ws.terminate();
        console.error(`[WS] Closed connection to ${endpoint}`);
      } catch (error) {
        console.error(`[WS] Error closing connection to ${endpoint}:`, error);
      }
    }
    this.wsConnections.clear();

    for (const timeout of this.wsReconnectTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.wsReconnectTimeouts.clear();
    
    // Reset connection attempts
    this.connectionAttempts.clear();
    console.error('[WS] All WebSocket connections closed');
  }

  getActiveConnections(): number {
    return this.wsConnections.size;
  }
  
  getActiveEndpoints(): string[] {
    return Array.from(this.wsConnections.keys());
  }
}
