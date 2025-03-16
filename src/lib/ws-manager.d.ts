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
export declare class WebSocketManager {
    private wsConnections;
    private wsReconnectTimeouts;
    private onPoolFound;
    private activeSearchTokenMint;
    private readonly WS_ENDPOINTS;
    private readonly RAYDIUM_PROGRAM_ID;
    constructor();
    private initializeWebSockets;
    private initializeWebSocket;
    private handleProgramNotification;
    startPoolSearch(tokenMint: string, callback: (poolInfo: PoolInfo) => void): void;
    stopPoolSearch(): void;
    closeAllConnections(): Promise<void>;
    getActiveConnections(): number;
}
