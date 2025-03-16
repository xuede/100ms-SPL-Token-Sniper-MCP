import { Connection, PublicKey } from '@solana/web3.js';
export declare class AmmManager {
    private readonly RAYDIUM_PROGRAM_ID;
    private readonly MIN_AMM_DATA_SIZE;
    findPools(connection: Connection, tokenMint: PublicKey): Promise<Readonly<{
        account: import("node_modules/@solana/web3.js/lib/index.js").AccountInfo<Buffer>;
        pubkey: PublicKey;
    }>[]>;
}
