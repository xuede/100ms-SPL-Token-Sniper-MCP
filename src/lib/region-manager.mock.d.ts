import { Connection, Keypair } from '@solana/web3.js';
export interface GCloudRegion {
    name: string;
    functionUrl: string;
    status: 'available' | 'unavailable' | 'unknown';
    lastError?: string;
    metrics: {
        latency: number;
        successRate: number;
        lastSuccess?: Date;
        transactionCount: number;
        failureCount: number;
    };
}
export interface TransactionResult {
    region: string;
    success: boolean;
    signature?: string;
    error?: string;
    executionTime?: number;
}
export declare class RegionManager {
    private regions;
    private wallet;
    private state;
    private heliusConnection;
    constructor(state: any);
    initializeConnections(): Promise<void>;
    getRegions(): GCloudRegion[];
    getRegion(name: string): GCloudRegion | undefined;
    getWallet(): Keypair;
    getHeliusConnection(): Connection;
    connectWebSockets(tokenMint: string): Promise<void>;
    executeInAllRegions(tokenMint: string, slippageBps: number): Promise<TransactionResult[]>;
    closeAllConnections(): Promise<void>;
}
