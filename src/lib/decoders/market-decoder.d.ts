import { Connection } from '@solana/web3.js';
interface MarketAccounts {
    bids: string;
    asks: string;
    eventQueue: string;
    baseVault: string;
    quoteVault: string;
    vaultSigner: string;
}
declare function getMarketAccounts(connection: Connection, marketId: string, programId: string): Promise<MarketAccounts | null>;
export { getMarketAccounts };
export type { MarketAccounts };
