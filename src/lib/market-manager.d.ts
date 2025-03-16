import { Connection, PublicKey } from '@solana/web3.js';
export declare class MarketManager {
    private readonly SERUM_PROGRAM_ID;
    private readonly MIN_MARKET_SIZE;
    findMarkets(connection: Connection, tokenMint: PublicKey): Promise<Readonly<{
        account: import("node_modules/@solana/web3.js/lib/index.js").AccountInfo<Buffer>;
        pubkey: PublicKey;
    }>[]>;
}
