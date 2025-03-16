interface SnipeResult {
    region: string;
    status: string;
    tokenMint: string;
    slippageBps: number;
    timestamp: string;
    error?: string;
    pools?: {
        amm: number;
        serum: number;
    };
    txId?: string;
}
export declare class RegionManager {
    private state;
    private connection;
    private fallbackConnection;
    private readonly MAX_RETRIES;
    private readonly RETRY_DELAY;
    private readonly RAYDIUM_PROGRAM_ID;
    private readonly MIN_AMM_DATA_SIZE;
    private rpcConnections;
    private ataManager;
    private shyftMarket;
    private wsManager;
    constructor(state: any);
    initializeConnections(): Promise<void>;
    closeAllConnections(): Promise<void>;
    private withRetry;
    private findLiquidityPools;
    private getSerumMarketInfo;
    private combinePoolAndMarketInfo;
    snipeToken(tokenMint: string, slippageBps: number, regions: string[], amountSol?: number): Promise<SnipeResult[]>;
    getRegionStatuses(): Promise<{
        region: string;
        status: string;
        latency: number;
        usingFallback: boolean;
        wsConnected: boolean;
    }[]>;
    private measureLatency;
}
export {};
