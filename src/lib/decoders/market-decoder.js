import { PublicKey } from '@solana/web3.js';
const MARKET_STATE_LAYOUT = {
    BIDS_OFFSET: 72,
    ASKS_OFFSET: 104,
    EVENT_QUEUE_OFFSET: 136,
    BASE_VAULT_OFFSET: 168,
    QUOTE_VAULT_OFFSET: 200,
    VAULT_SIGNER_NONCE_OFFSET: 232
};
async function getMarketAccounts(connection, marketId, programId) {
    try {
        // Get market account data
        const marketPubkey = new PublicKey(marketId);
        const marketAccount = await connection.getAccountInfo(marketPubkey);
        if (!marketAccount)
            return null;
        const data = marketAccount.data;
        if (!data || data.length < 240)
            return null;
        // Read market account fields
        const bids = new PublicKey(data.slice(MARKET_STATE_LAYOUT.BIDS_OFFSET, MARKET_STATE_LAYOUT.BIDS_OFFSET + 32));
        const asks = new PublicKey(data.slice(MARKET_STATE_LAYOUT.ASKS_OFFSET, MARKET_STATE_LAYOUT.ASKS_OFFSET + 32));
        const eventQueue = new PublicKey(data.slice(MARKET_STATE_LAYOUT.EVENT_QUEUE_OFFSET, MARKET_STATE_LAYOUT.EVENT_QUEUE_OFFSET + 32));
        const baseVault = new PublicKey(data.slice(MARKET_STATE_LAYOUT.BASE_VAULT_OFFSET, MARKET_STATE_LAYOUT.BASE_VAULT_OFFSET + 32));
        const quoteVault = new PublicKey(data.slice(MARKET_STATE_LAYOUT.QUOTE_VAULT_OFFSET, MARKET_STATE_LAYOUT.QUOTE_VAULT_OFFSET + 32));
        // Get vault signer nonce
        const vaultSignerNonce = data.readUInt8(MARKET_STATE_LAYOUT.VAULT_SIGNER_NONCE_OFFSET);
        // Derive vault signer
        const seeds = [marketPubkey.toBuffer(), Buffer.from([vaultSignerNonce])];
        const [vaultSigner] = await PublicKey.findProgramAddress(seeds, new PublicKey(programId));
        return {
            bids: bids.toBase58(),
            asks: asks.toBase58(),
            eventQueue: eventQueue.toBase58(),
            baseVault: baseVault.toBase58(),
            quoteVault: quoteVault.toBase58(),
            vaultSigner: vaultSigner.toBase58()
        };
    }
    catch (error) {
        console.error('Failed to get market accounts:', error);
        return null;
    }
}
export { getMarketAccounts };
