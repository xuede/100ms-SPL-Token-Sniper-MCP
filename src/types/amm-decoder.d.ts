declare module '../../Base scripts/lib/amm-decoder.js' {
  interface AmmMints {
    baseMint: string;
    quoteMint: string;
  }

  interface DecodedAmmAccount {
    version: number;
    status: number;
    nonce: number;
    maxOrder: number;
    depth: number;
    baseDecimal: number;
    quoteDecimal: number;
    state: number;
    resetFlag: number;
    minSize: string;
    volMaxCutRatio: string;
    amountWaveRatio: string;
    baseLotSize: string;
    quoteLotSize: string;
    minSeparateNumerator: string;
    minSeparateDenominator: string;
    tradeFeeNumerator: string;
    tradeFeeDenominator: string;
    swapFeeNumerator: string;
    swapFeeDenominator: string;
    baseNeedTakePnl: string;
    quoteNeedTakePnl: string;
    quoteTotalPnl: string;
    baseTotalPnl: string;
    systemDecimalValue: string;
    minPriceMultiplier: string;
    maxPriceMultiplier: string;
    baseVault: string;
    quoteVault: string;
    baseMint: string;
    quoteMint: string;
    lpMint: string;
    openOrders: string;
    marketId: string;
    marketProgramId: string;
    targetOrders: string;
    serumBids: string;
    serumAsks: string;
    serumEventQueue: string;
    serumCoinVault: string;
    serumPcVault: string;
    serumVaultSigner: string;
  }

  export function decodeAmmMints(data: Buffer | string): AmmMints | null;
  export function decodeAmmAccount(data: Buffer | string): DecodedAmmAccount | null;
  export function isAmmAccountData(data: Buffer): boolean;
}
