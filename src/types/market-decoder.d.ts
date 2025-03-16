declare module '../../Base scripts/lib/market-decoder.js' {
  interface MarketAccounts {
    bids: string;
    asks: string;
    eventQueue: string;
    baseVault: string;
    quoteVault: string;
    vaultSigner: string;
  }

  export function getMarketAccounts(
    connection: import('@solana/web3.js').Connection,
    marketId: string,
    marketProgramId?: string | import('@solana/web3.js').PublicKey
  ): Promise<MarketAccounts | null>;
}
