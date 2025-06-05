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
  private readonly MAX_RETRIES = 5; // Increased max retries
  private readonly INITIAL_RECONNECT_DELAY = 1000; // 1 second
  private readonly MAX_RECONNECT_DELAY = 30000; // 30 seconds
  private pingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private lastPongReceived: Map<string, number> = new Map();
  private readonly PING_INTERVAL_MS = 30000; // 30 seconds
  private readonly PONG_TIMEOUT_MS = 45000; // 45 seconds (must be > PING_INTERVAL_MS)

  private readonly WS_ENDPOINTS = [
    process.env.HELIUS_WS_ENDPOINT!, // Prioritize Helius
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
      // Reset attempts for this initialization cycle
      this.connectionAttempts.set(endpoint, 0);
      this.initializeWebSocket(endpoint); // Don't await here, let them connect in parallel
    }
    // Log status after a short delay to allow connections to establish
    setTimeout(() => {
      console.error(`[WS] Initial connection status: ${this.wsConnections.size}/${this.WS_ENDPOINTS.length} connections active`);
    }, 7000); // Wait a bit longer than connection timeout
  }

  private initializeWebSocket(endpoint: string) {
    const currentAttempts = this.connectionAttempts.get(endpoint) || 0;
    if (currentAttempts >= this.MAX_RETRIES) {
      console.error(`[WS] Max retries (${this.MAX_RETRIES}) reached for ${endpoint}. Stopping attempts.`);
      return;
    }

    // Clear any existing reconnect timeout for this endpoint
    if (this.wsReconnectTimeouts.has(endpoint)) {
      clearTimeout(this.wsReconnectTimeouts.get(endpoint)!);
      this.wsReconnectTimeouts.delete(endpoint);
    }

    // Terminate existing connection if any
    if (this.wsConnections.has(endpoint)) {
      try {
        console.warn(`[WS] Terminating existing connection for ${endpoint} before reconnecting.`);
        this.wsConnections.get(endpoint)?.terminate();
      } catch (termError) {
        console.error(`[WS] Error terminating existing connection for ${endpoint}:`, termError);
      }
      this.wsConnections.delete(endpoint);
      this.clearPingPongState(endpoint);
    }

    console.log(`[WS] Attempt ${currentAttempts + 1}/${this.MAX_RETRIES}: Connecting to ${endpoint}`);

    try {
      const ws = new WebSocket(endpoint);
      this.wsConnections.set(endpoint, ws); // Add early to track attempts

      const connectionTimeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          console.error(`[WS] Connection timeout for ${endpoint}`);
          ws.terminate(); // This will trigger 'close' event
        }
      }, 10000); // Increased connection timeout

      ws.on('open', () => {
        clearTimeout(connectionTimeout);
        console.log(`[WS] Connected to ${endpoint}`);
        this.connectionAttempts.set(endpoint, 0); // Reset attempts on successful connection
        this.lastPongReceived.set(endpoint, Date.now()); // Initialize pong time

        // Start ping interval
        this.clearPingInterval(endpoint); // Clear previous interval if any
        this.pingIntervals.set(endpoint, setInterval(() => this.sendPing(endpoint), this.PING_INTERVAL_MS));

        // Subscribe to program changes
        const subscribeMessage = {
          jsonrpc: '2.0',
          id: 1,
          method: 'programSubscribe',
          params: [
            this.RAYDIUM_PROGRAM_ID,
            {
              encoding: 'base64',
              commitment: 'processed' // Use 'processed' for faster detection
            }
          ]
        };
        ws.send(JSON.stringify(subscribeMessage));
      });

      ws.on('message', async (data: WebSocket.Data) => {
        this.lastPongReceived.set(endpoint, Date.now()); // Treat any message as activity
        try {
          const parsedData = JSON.parse(data.toString());
          if (parsedData.id === 1 && parsedData.result) {
            console.log(`[WS] Subscription successful on ${endpoint} (ID: ${parsedData.result})`);
            return;
          }
          if (parsedData.method === 'programNotification' && parsedData.params?.result?.value) {
            await this.handleProgramNotification(parsedData.params.result.value, endpoint);
          }
        } catch (error) {
          console.error(`[WS] Message parsing error on ${endpoint}:`, error);
        }
      });

      ws.on('pong', () => {
        // console.log(`[WS] Pong received from ${endpoint}`);
        this.lastPongReceived.set(endpoint, Date.now());
      });

      ws.on('error', (error) => {
        clearTimeout(connectionTimeout);
        console.error(`[WS] Error on ${endpoint}: ${error.message}`);
        // Close event will handle cleanup and reconnect
      });

      ws.on('close', (code, reason) => {
        clearTimeout(connectionTimeout);
        const reasonStr = reason ? reason.toString() : 'No reason provided';
        console.log(`[WS] Connection closed for ${endpoint}. Code: ${code}, Reason: ${reasonStr}`);
        this.cleanupConnection(endpoint);
        // Schedule reconnect only if not a normal closure (code 1000) and retries not exceeded
        if (code !== 1000) {
          this.scheduleReconnect(endpoint);
        } else {
           console.log(`[WS] Normal closure for ${endpoint}, not reconnecting.`);
        }
      });

    } catch (error) {
      console.error(`[WS] Failed to create WebSocket for ${endpoint}:`, error);
      this.scheduleReconnect(endpoint); // Attempt to reconnect even if creation fails
    }
  }

  private scheduleReconnect(endpoint: string) {
    const attempts = (this.connectionAttempts.get(endpoint) || 0) + 1;
    if (attempts > this.MAX_RETRIES) {
      console.error(`[WS] Max retries (${this.MAX_RETRIES}) reached for ${endpoint}. Stopping attempts.`);
      return;
    }
    this.connectionAttempts.set(endpoint, attempts);

    // Exponential backoff with jitter
    const delay = Math.min(
      this.INITIAL_RECONNECT_DELAY * Math.pow(2, attempts - 1),
      this.MAX_RECONNECT_DELAY
    );
    const jitter = delay * 0.2 * (Math.random() - 0.5); // +/- 10% jitter
    const reconnectDelay = Math.max(500, delay + jitter); // Ensure minimum 500ms delay

    console.log(`[WS] Scheduling reconnect attempt ${attempts}/${this.MAX_RETRIES} for ${endpoint} in ${reconnectDelay.toFixed(0)}ms`);

    // Clear previous timeout if exists
    if (this.wsReconnectTimeouts.has(endpoint)) {
      clearTimeout(this.wsReconnectTimeouts.get(endpoint)!);
    }

    this.wsReconnectTimeouts.set(endpoint, setTimeout(() => {
      this.initializeWebSocket(endpoint);
    }, reconnectDelay));
  }

  private sendPing(endpoint: string) {
    const ws = this.wsConnections.get(endpoint);
    if (ws && ws.readyState === WebSocket.OPEN) {
      // Check if pong was received recently
      const lastPong = this.lastPongReceived.get(endpoint) || 0;
      if (Date.now() - lastPong > this.PONG_TIMEOUT_MS) {
        console.warn(`[WS] Pong timeout for ${endpoint}. Terminating connection.`);
        ws.terminate(); // Will trigger 'close' and reconnect logic
        return;
      }
      // console.log(`[WS] Sending ping to ${endpoint}`);
      ws.ping();
    } else {
       console.warn(`[WS] Cannot send ping, WebSocket not open for ${endpoint}. State: ${ws?.readyState}`);
       this.clearPingInterval(endpoint); // Stop pinging if connection is not open
    }
  }

  private cleanupConnection(endpoint: string) {
      this.wsConnections.delete(endpoint);
      this.clearPingPongState(endpoint);
  }

  private clearPingInterval(endpoint: string) {
      if (this.pingIntervals.has(endpoint)) {
          clearInterval(this.pingIntervals.get(endpoint)!);
          this.pingIntervals.delete(endpoint);
      }
  }

  private clearPingPongState(endpoint: string) {
      this.clearPingInterval(endpoint);
      this.lastPongReceived.delete(endpoint);
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
