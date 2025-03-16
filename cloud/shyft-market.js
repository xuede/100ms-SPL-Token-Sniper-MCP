const { Connection, PublicKey } = require('@solana/web3.js');
const dotenv = require('dotenv');
const bs58 = require('bs58');
const WebSocket = require('ws');
const { Market } = require('@raydium-io/raydium-sdk');
const { startWebSockets, setMatchingPoolCallback, closeAllConnections: closeWsConnections } = require('./test-ws-raw.js');
const { getMarketAccounts } = require('./lib/market-decoder.js');

// Re-export closeAllConnections
exports.closeAllConnections = closeWsConnections;

dotenv.config();

// Constants
exports.RAYDIUM_PROGRAM_ID = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');
exports.RENT_EXEMPTION = 2039280;
exports.SLIPPAGE_BPS = 100;

// Constants
const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=471d92ec-a326-49b2-a911-9e4c20645554';
const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';

// Market info cache
const marketInfoCache = new Map();
const MARKET_CACHE_DURATION = 60000; // 60 seconds

// Initialize Helius connection for market data
const heliusConnection = new Connection(HELIUS_RPC, {
  commitment: 'processed',
  confirmTransactionInitialTimeout: 10000
});

// Single active search token mint
let activeSearchTokenMint = null;
let searchResolver = null;

/**
 * Gets pool and market info for a token using WebSocket only.
 */
async function getPoolAndMarketInfo(tokenMint, connection) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('POOL_NOT_FOUND'));
    }, 10 * 60 * 1000); // 10 minutes timeout

    const startTime = Date.now();
    console.log(`[Pool Search] Starting search for ${tokenMint}`);
    
    // Start WebSocket connection
    startWebSockets(tokenMint);
    
    function cleanup() {
      clearTimeout(timeout);
      closeWsConnections(); // Always close connections in cleanup
      setMatchingPoolCallback(null); // Clear callback
    }

    // Set callback for pool discovery
    setMatchingPoolCallback(async (poolInfo) => {
      const poolFoundTime = Date.now();
      console.log(`[Pool Found] Found pool in ${poolFoundTime - startTime}ms via WebSocket`);
      
      try {
        const serumStartTime = Date.now();
        const serumInfo = await getSerumMarketInfo(poolInfo.marketId, poolInfo.marketProgramId, connection);
        console.log(`[Serum] Market info fetched in ${Date.now() - serumStartTime}ms`);
        
        const combined = combinePoolAndMarketInfo(poolInfo, serumInfo);
        if (combined) {
          // Don't cleanup here - let the transaction complete first
          resolve([combined, 'websocket']);
        }
      } catch (error) {
        console.error('[Error] Failed to get market info:', error.message);
        cleanup(); // Only cleanup on error
        reject(error);
      }
    });
  });
}

// Cache PublicKey instances
const publicKeyCache = new Map();
function getCachedPublicKey(key) {
  if (!publicKeyCache.has(key)) {
    publicKeyCache.set(key, new PublicKey(key));
  }
  return publicKeyCache.get(key);
}

async function getSerumMarketInfo(marketId, marketProgramId, connection) {
  try {
    const serumStartTime = Date.now();
    
    // Use provided connection for market accounts
    const marketAccounts = await getMarketAccounts(connection, marketId, marketProgramId);
    if (!marketAccounts) {
      throw new Error('Failed to fetch market accounts');
    }

    return {
      serumProgramId: getCachedPublicKey(marketProgramId),
      serumMarket: getCachedPublicKey(marketId),
      serumBids: getCachedPublicKey(marketAccounts.bids),
      serumAsks: getCachedPublicKey(marketAccounts.asks),
      serumEventQueue: getCachedPublicKey(marketAccounts.eventQueue),
      serumCoinVault: getCachedPublicKey(marketAccounts.baseVault),
      serumPcVault: getCachedPublicKey(marketAccounts.quoteVault),
      serumVaultSigner: getCachedPublicKey(marketAccounts.vaultSigner),
      serumTime: Date.now() - serumStartTime
    };
  } catch (error) {
    throw error;
  }
}

// Cache static PublicKey
const STATIC_AMM_AUTHORITY = new PublicKey('5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1');

function combinePoolAndMarketInfo(pool, serumInfo) {
  return {
    ammMarket: getCachedPublicKey(pool.pubkey),
    ammAuthority: STATIC_AMM_AUTHORITY,
    ammOpenOrders: getCachedPublicKey(pool.openOrders),
    ammTargetOrders: getCachedPublicKey(pool.targetOrders),
    poolCoinTokenAccount: getCachedPublicKey(pool.baseVault),
    poolPcTokenAccount: getCachedPublicKey(pool.quoteVault),
    ...serumInfo
  };
}

/**
 * Derives the market authority using the given programId and marketId.
 */
function getAssociatedAuthority({ programId, marketId }) {
  const seeds = [marketId.toBuffer()];
  let nonce = 0;
  
  while (nonce < 100) {
    try {
      const seedsWithNonce = seeds.concat(Buffer.from([nonce]), Buffer.alloc(7));
      const publicKey = PublicKey.createProgramAddressSync(seedsWithNonce, programId);
      return { publicKey, nonce };
    } catch {
      nonce++;
    }
  }
  return null;
}

// Function to manage active search state
function setActiveSearch(tokenMint) {
  if (tokenMint) {
    activeSearchTokenMint = tokenMint.toLowerCase();
  } else {
    activeSearchTokenMint = null;
  }
}

module.exports = {
  RAYDIUM_PROGRAM_ID: exports.RAYDIUM_PROGRAM_ID,
  RENT_EXEMPTION: exports.RENT_EXEMPTION,
  SLIPPAGE_BPS: exports.SLIPPAGE_BPS,
  getPoolAndMarketInfo,
  setActiveSearch,
  closeAllConnections: exports.closeAllConnections
};
