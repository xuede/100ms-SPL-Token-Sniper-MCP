const { PublicKey } = require("@solana/web3.js");
const BN = require('bn.js');

const AMM_ACCOUNT_LAYOUT = {
  VERSION_OFFSET: 0,
  STATUS_OFFSET: 1,
  NONCE_OFFSET: 8,
  MAX_ORDER_OFFSET: 16,
  DEPTH_OFFSET: 24,
  BASE_DECIMAL_OFFSET: 32,
  QUOTE_DECIMAL_OFFSET: 40,
  STATE_OFFSET: 48,
  RESET_FLAG_OFFSET: 56,
  
  U64_FIELDS: [
    { name: 'minSize', offset: 64 },
    { name: 'volMaxCutRatio', offset: 72 },
    { name: 'amountWaveRatio', offset: 80 },
    { name: 'baseLotSize', offset: 88 },
    { name: 'quoteLotSize', offset: 96 },
    { name: 'minSeparateNumerator', offset: 104 },
    { name: 'minSeparateDenominator', offset: 112 },
    { name: 'tradeFeeNumerator', offset: 120 },
    { name: 'tradeFeeDenominator', offset: 128 },
    { name: 'pnlNumerator', offset: 136 },
    { name: 'pnlDenominator', offset: 144 },
    { name: 'swapFeeNumerator', offset: 152 },
    { name: 'swapFeeDenominator', offset: 160 },
    { name: 'baseNeedTakePnl', offset: 168 },
    { name: 'quoteNeedTakePnl', offset: 176 },
    { name: 'quoteTotalPnl', offset: 184 },
    { name: 'baseTotalPnl', offset: 192 },
    { name: 'systemDecimalValue', offset: 200 },
    { name: 'minPriceMultiplier', offset: 208 },
    { name: 'maxPriceMultiplier', offset: 216 },
    { name: 'swapBaseInAmount', offset: 224 },
    { name: 'swapQuoteOutAmount', offset: 232 },
    { name: 'swapBase2QuoteFee', offset: 240 },
    { name: 'swapQuoteInAmount', offset: 248 },
    { name: 'swapBaseOutAmount', offset: 256 },
    { name: 'swapQuote2BaseFee', offset: 264 },
    { name: 'poolOpenTime', offset: 272 },
    { name: 'punishPcAmount', offset: 280 },
    { name: 'punishCoinAmount', offset: 288 },
    { name: 'orderbookToInitTime', offset: 296 },
    { name: 'lpReserve', offset: 304 }
  ],
  
  PUBKEY_FIELDS: [
    { name: 'baseVault', offset: 336 },
    { name: 'quoteVault', offset: 368 },
    { name: 'baseMint', offset: 400 },
    { name: 'quoteMint', offset: 432 },
    { name: 'lpMint', offset: 464 },
    { name: 'openOrders', offset: 496 },
    { name: 'marketId', offset: 528 },
    { name: 'marketProgramId', offset: 560 },
    { name: 'targetOrders', offset: 592 },
    { name: 'serumBids', offset: 688 },
    { name: 'serumAsks', offset: 720 },
    { name: 'serumEventQueue', offset: 752 },
    { name: 'serumCoinVault', offset: 784 },
    { name: 'serumPcVault', offset: 816 },
    { name: 'serumVaultSigner', offset: 848 }
  ]
};

function readUint8(buffer, offset) {
  return buffer[offset];
}

function readUint64LE(buffer, offset) {
  const slice = buffer.slice(offset, offset + 8);
  return new BN(slice, 'le');
}

const publicKeyCache = new Map();
function getCachedPublicKey(key) {
  const cacheKey = typeof key === 'string' ? key : key.toString('hex');
  if (!publicKeyCache.has(cacheKey)) {
    publicKeyCache.set(cacheKey, new PublicKey(key));
  }
  return publicKeyCache.get(cacheKey);
}

const BASEMINT_OFFSET = AMM_ACCOUNT_LAYOUT.PUBKEY_FIELDS.find(f => f.name === 'baseMint').offset;
const QUOTEMINT_OFFSET = AMM_ACCOUNT_LAYOUT.PUBKEY_FIELDS.find(f => f.name === 'quoteMint').offset;

function readPubkey(buffer, offset) {
  try {
    const slice = buffer.slice(offset, offset + 32);
    return getCachedPublicKey(slice);
  } catch (error) {
    return getCachedPublicKey("11111111111111111111111111111111");
  }
}

function decodeAmmMints(data) {
  try {
    const buffer = Buffer.from(data, 'base64');
    
    if (!isAmmAccountData(buffer)) return null;

    const baseMint = readPubkey(buffer, BASEMINT_OFFSET);
    const quoteMint = readPubkey(buffer, QUOTEMINT_OFFSET);

    return {
      baseMint: baseMint.toBase58(),
      quoteMint: quoteMint.toBase58()
    };
  } catch (error) {
    try {
      const buffer = Buffer.from(data);
      if (!isAmmAccountData(buffer)) return null;

      const baseMint = readPubkey(buffer, BASEMINT_OFFSET);
      const quoteMint = readPubkey(buffer, QUOTEMINT_OFFSET);

      return {
        baseMint: baseMint.toBase58(),
        quoteMint: quoteMint.toBase58()
      };
    } catch (error) {
      return null;
    }
  }
}

const base64Buffer = Buffer.allocUnsafe(3000);

function decodeAmmAccount(data) {
  let buffer;
  try {
    buffer = Buffer.from(data, 'base64', base64Buffer);
    
    if (!isAmmAccountData(buffer)) {
      buffer = Buffer.from(data);
      if (!isAmmAccountData(buffer)) return null;
    }
  } catch (error) {
    try {
      buffer = Buffer.from(data);
      if (!isAmmAccountData(buffer)) return null;
    } catch (error) {
      return null;
    }
  }
  
  return decodeBuffer(buffer);
}

function decodeBuffer(buffer) {
  try {
    const decoded = {
      version: readUint8(buffer, AMM_ACCOUNT_LAYOUT.VERSION_OFFSET),
      status: readUint8(buffer, AMM_ACCOUNT_LAYOUT.STATUS_OFFSET),
      nonce: readUint8(buffer, AMM_ACCOUNT_LAYOUT.NONCE_OFFSET),
      maxOrder: readUint8(buffer, AMM_ACCOUNT_LAYOUT.MAX_ORDER_OFFSET),
      depth: readUint8(buffer, AMM_ACCOUNT_LAYOUT.DEPTH_OFFSET),
      baseDecimal: readUint8(buffer, AMM_ACCOUNT_LAYOUT.BASE_DECIMAL_OFFSET),
      quoteDecimal: readUint8(buffer, AMM_ACCOUNT_LAYOUT.QUOTE_DECIMAL_OFFSET),
      state: readUint8(buffer, AMM_ACCOUNT_LAYOUT.STATE_OFFSET),
      resetFlag: readUint8(buffer, AMM_ACCOUNT_LAYOUT.RESET_FLAG_OFFSET)
    };

    for (const field of AMM_ACCOUNT_LAYOUT.U64_FIELDS) {
      decoded[field.name] = readUint64LE(buffer, field.offset).toString();
    }

    for (const field of AMM_ACCOUNT_LAYOUT.PUBKEY_FIELDS) {
      decoded[field.name] = readPubkey(buffer, field.offset).toBase58();
    }

    return {
      ...decoded,
      version: parseInt(decoded.version),
      status: parseInt(decoded.status),
      nonce: parseInt(decoded.nonce),
      maxOrder: parseInt(decoded.maxOrder),
      depth: parseInt(decoded.depth),
      baseDecimal: parseInt(decoded.baseDecimal),
      quoteDecimal: parseInt(decoded.quoteDecimal),
      state: parseInt(decoded.state),
      resetFlag: parseInt(decoded.resetFlag),
      minSize: decoded.minSize,
      volMaxCutRatio: parseInt(decoded.volMaxCutRatio),
      amountWaveRatio: parseInt(decoded.amountWaveRatio),
      baseLotSize: decoded.baseLotSize,
      quoteLotSize: decoded.quoteLotSize,
      minSeparateNumerator: parseInt(decoded.minSeparateNumerator),
      minSeparateDenominator: parseInt(decoded.minSeparateDenominator),
      tradeFeeNumerator: parseInt(decoded.tradeFeeNumerator),
      tradeFeeDenominator: parseInt(decoded.tradeFeeDenominator),
      swapFeeNumerator: parseInt(decoded.swapFeeNumerator),
      swapFeeDenominator: parseInt(decoded.swapFeeDenominator),
      pnlNumerator: parseInt(decoded.pnlNumerator),
      pnlDenominator: parseInt(decoded.pnlDenominator),
      baseNeedTakePnl: decoded.baseNeedTakePnl,
      quoteNeedTakePnl: decoded.quoteNeedTakePnl,
      quoteTotalPnl: decoded.quoteTotalPnl,
      baseTotalPnl: decoded.baseTotalPnl,
      systemDecimalValue: decoded.systemDecimalValue,
      minPriceMultiplier: parseInt(decoded.minPriceMultiplier),
      maxPriceMultiplier: parseInt(decoded.maxPriceMultiplier),
      swapBaseInAmount: decoded.swapBaseInAmount,
      swapQuoteOutAmount: decoded.swapQuoteOutAmount,
      swapBase2QuoteFee: decoded.swapBase2QuoteFee,
      swapQuoteInAmount: decoded.swapQuoteInAmount,
      swapBaseOutAmount: decoded.swapBaseOutAmount,
      swapQuote2BaseFee: decoded.swapQuote2BaseFee,
      poolOpenTime: decoded.poolOpenTime,
      punishPcAmount: decoded.punishPcAmount,
      punishCoinAmount: decoded.punishCoinAmount,
      orderbookToInitTime: decoded.orderbookToInitTime,
      lpReserve: decoded.lpReserve
    };
  } catch (error) {
    return null;
  }
}

function isAmmAccountData(data) {
  try {
    if (!data || data.length < 752) return false;
    const version = data[AMM_ACCOUNT_LAYOUT.VERSION_OFFSET];
    const nonce = data[AMM_ACCOUNT_LAYOUT.NONCE_OFFSET];
    return version === 6 && nonce === 254;
  } catch (error) {
    return false;
  }
}

module.exports = {
  decodeAmmMints,
  decodeAmmAccount,
  isAmmAccountData
};
