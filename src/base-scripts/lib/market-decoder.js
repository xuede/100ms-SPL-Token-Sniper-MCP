const { PublicKey } = require("@solana/web3.js");
const { MARKET_STATE_LAYOUT_V3, Market } = require("@raydium-io/raydium-sdk");

// Cache for market accounts to avoid redundant RPC calls
const marketCache = new Map();
const CACHE_TTL = 5000; // 5 seconds TTL

// Cache for PublicKey instances
const publicKeyCache = new Map();
function getCachedPublicKey(key) {
  if (!publicKeyCache.has(key)) {
    publicKeyCache.set(key, new PublicKey(key));
  }
  return publicKeyCache.get(key);
}

// Default program ID as PublicKey
const DEFAULT_PROGRAM_ID = getCachedPublicKey('srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX');

async function getMarketAccounts(connection, marketId, marketProgramId = DEFAULT_PROGRAM_ID) {
  try {
    // Check cache first
    const cacheKey = `${marketId}:${marketProgramId}`;
    const now = Date.now();
    const cached = marketCache.get(cacheKey);
    if (cached && now - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }

    // Convert inputs to PublicKey (using cache)
    const marketPubKey = getCachedPublicKey(marketId);
    const programId = typeof marketProgramId === 'string' ? getCachedPublicKey(marketProgramId) : marketProgramId;

    // 1. Fetch market account data with minimal commitment
    const marketAccount = await connection.getAccountInfo(marketPubKey, { commitment: 'processed' });
    if (!marketAccount) {
      throw new Error('Market account not found');
    }

    // 2. Decode market account using Raydium SDK layout
    const marketInfo = MARKET_STATE_LAYOUT_V3.decode(marketAccount.data);
    if (!marketInfo || !marketInfo.bids || !marketInfo.asks || !marketInfo.eventQueue || 
        !marketInfo.baseVault || !marketInfo.quoteVault) {
      throw new Error('Invalid market data structure');
    }

    // 3. Get vault signer using Raydium SDK helper (cached PublicKey)
    const { publicKey: vaultSigner } = Market.getAssociatedAuthority({
      programId,
      marketId: marketPubKey
    });

    // 4. Return all market-related accounts
    const result = {
      bids: marketInfo.bids.toString(),
      asks: marketInfo.asks.toString(),
      eventQueue: marketInfo.eventQueue.toString(),
      baseVault: marketInfo.baseVault.toString(),
      quoteVault: marketInfo.quoteVault.toString(),
      vaultSigner: vaultSigner.toString()
    };

    // Cache the result
    marketCache.set(cacheKey, {
      timestamp: now,
      data: result
    });

    return result;
  } catch (error) {
    throw error;
  }
}

// Cleanup old cache entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of marketCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      marketCache.delete(key);
    }
  }
}, CACHE_TTL);

module.exports = { getMarketAccounts };
