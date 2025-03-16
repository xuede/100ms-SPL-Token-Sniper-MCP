interface SnipeResult {
    region: string;
    status: string;
    tokenMint: string;
    slippageBps: number;
    timestamp: string;
}
interface StatusUpdate {
    lastTokenMint: string | null;
    status: string;
    regions: Array<{
        region: string;
        status: string;
        latency: number;
    }>;
    activeTransactions: Array<{
        id: string;
        region: string;
        status: string;
        tokenMint: string;
        slippageBps: number;
        timestamp: string;
    }>;
}
export declare class VisualizationManager {
    updateSnipeStatus(results: SnipeResult[]): Promise<void>;
    updateStatus(status: StatusUpdate): Promise<void>;
}
export {};
