export interface PoolInfo {
    pubkey: string;
    marketId: string;
    marketProgramId: string;
    baseVault: string;
    quoteVault: string;
    openOrders: string;
    targetOrders: string;
}
export declare class ShyftMarket {
    private readonly REST_API_URL;
    /**
     * Fetch pool info using REST API as a fallback
     */
    private getPoolInfoREST;
    /**
     * Fetch pool info using Shyft GraphQL with aggressive polling
     */
    pollPoolInfo(tokenMint: string, signal: AbortSignal): Promise<PoolInfo | null>;
}
