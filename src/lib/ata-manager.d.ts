import { Connection, PublicKey, Keypair } from '@solana/web3.js';
export declare class ATAManager {
    private readonly connection;
    constructor(connection: Connection);
    getOrCreateATA(wallet: Keypair, mint: PublicKey, options?: {
        skipBalanceCheck: boolean;
    }): Promise<{
        address: PublicKey;
        created: boolean;
    }>;
}
