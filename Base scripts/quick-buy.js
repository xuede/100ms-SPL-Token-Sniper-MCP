const {
  Connection,
  Keypair,
  PublicKey,
  ComputeBudgetProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction
} = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const dotenv = require('dotenv');
const bs58 = require('bs58');
const BN = require('bn.js');
const { 
  RAYDIUM_PROGRAM_ID, 
  getPoolAndMarketInfo, 
  setActiveSearch, 
  closeAllConnections 
} = require('./shyft-market.js');
const { getOrCreateATA } = require('./test-ata.js');

// Constants
const TX_TEMPLATE = {
  instructions: [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000_000 })
  ],
  lamportsIn: 0.2 * 1e9,
  minimumOutBps: 5000,
  instructionData: Buffer.from([9])
};

const HARDCODED_WSOL = new PublicKey("DzsAERbVAab8pLxf419BjGbigNYVjwc7gC4MydiWJK3h");
const heliusEndpoint = 'https://mainnet.helius-rpc.com/?api-key=471d92ec-a326-49b2-a911-9e4c20645554';
const heliusConnection = new Connection(heliusEndpoint, {
  commitment: 'processed',
  confirmTransactionInitialTimeout: 10000,
  wsEndpoint: null
});

// Initialize wallet
const wallet = Keypair.fromSecretKey(bs58.decode(process.env.WALLET_PRIVATE_KEY));

// Blockhash caching
let cachedBlockhash = null;
let lastBlockhashTime = 0;
let blockhashInterval = null;
const FAST_CACHE_INTERVAL = 50;

async function getLatestBlockhashWithCache() {
  const now = Date.now();
  if (cachedBlockhash && now - lastBlockhashTime < FAST_CACHE_INTERVAL) {
    return cachedBlockhash;
  }

  try {
    const response = await fetch(heliusEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getLatestBlockhash',
        params: [{ commitment: 'processed' }]
      })
    });

    const data = await response.json();
    if (data?.result?.value) {
      const { blockhash, lastValidBlockHeight } = data.result.value;
      cachedBlockhash = { blockhash, lastValidBlockHeight };
      lastBlockhashTime = now;
      return cachedBlockhash;
    }
    throw new Error('Invalid blockhash response');
  } catch (error) {
    throw new Error(`Failed to get blockhash: ${error.message}`);
  }
}

function setBlockhashCacheSpeed(fast = false) {
  if (blockhashInterval) {
    clearInterval(blockhashInterval);
  }
  
  const interval = fast ? FAST_CACHE_INTERVAL : 1000;
  blockhashInterval = setInterval(async () => {
    try {
      await getLatestBlockhashWithCache();
    } catch (error) {
      // Silent error - will retry on next interval
    }
  }, interval);
}

async function buildTransaction(marketInfo, tokenAccountAddress, blockhash) {
  try {
    const minimumOut = Math.floor(TX_TEMPLATE.lamportsIn * TX_TEMPLATE.minimumOutBps / 10000);
    
    const instructionData = Buffer.concat([
      TX_TEMPLATE.instructionData,
      new BN(TX_TEMPLATE.lamportsIn).toArrayLike(Buffer, 'le', 8),
      new BN(minimumOut).toArrayLike(Buffer, 'le', 8)
    ]);

    const keys = [
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: marketInfo.ammMarket, isSigner: false, isWritable: true },
      { pubkey: marketInfo.ammAuthority, isSigner: false, isWritable: false },
      { pubkey: marketInfo.ammOpenOrders, isSigner: false, isWritable: true },
      { pubkey: marketInfo.ammTargetOrders, isSigner: false, isWritable: true },
      { pubkey: marketInfo.poolCoinTokenAccount, isSigner: false, isWritable: true },
      { pubkey: marketInfo.poolPcTokenAccount, isSigner: false, isWritable: true },
      { pubkey: marketInfo.serumProgramId, isSigner: false, isWritable: false },
      { pubkey: marketInfo.serumMarket, isSigner: false, isWritable: true },
      { pubkey: marketInfo.serumBids, isSigner: false, isWritable: true },
      { pubkey: marketInfo.serumAsks, isSigner: false, isWritable: true },
      { pubkey: marketInfo.serumEventQueue, isSigner: false, isWritable: true },
      { pubkey: marketInfo.serumCoinVault, isSigner: false, isWritable: true },
      { pubkey: marketInfo.serumPcVault, isSigner: false, isWritable: true },
      { pubkey: marketInfo.serumVaultSigner, isSigner: false, isWritable: false },
      { pubkey: HARDCODED_WSOL, isSigner: false, isWritable: true },
      { pubkey: new PublicKey(tokenAccountAddress), isSigner: false, isWritable: true },
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true }
    ];

    const tx = new VersionedTransaction(
      new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: blockhash,
        instructions: [
          ...TX_TEMPLATE.instructions,
          new TransactionInstruction({
            programId: RAYDIUM_PROGRAM_ID,
            keys,
            data: instructionData
          })
        ]
      }).compileToV0Message()
    );
    tx.sign([wallet]);
    
    return tx;
  } catch (error) {
    console.error(`Failed to build transaction: ${error.message}`);
    throw error;
  }
}

async function sendTransaction(connection, transaction) {
  try {
    const rawTransaction = transaction.serialize();
    
    const response = await fetch(heliusEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'sendTransaction',
        params: [
          bs58.encode(rawTransaction),
          {
            encoding: 'base58',
            skipPreflight: true,
            preflightCommitment: 'processed',
            maxRetries: 0
          }
        ]
      })
    });
    
    const data = await response.json();
    if (data.error) {
      throw new Error(`RPC error: ${JSON.stringify(data.error)}`);
    }
    
    const signature = data.result;
    
    return { signature, success: true };
  } catch (error) {
    console.error(`Transaction failed: ${error.message}`);
    throw error;
  }
}

async function quickBuy(tokenMint) {
    setActiveSearch(tokenMint);
    setBlockhashCacheSpeed(true);

    try {
        const [poolResult, { address: ata }] = await Promise.all([
            getPoolAndMarketInfo(tokenMint, heliusConnection),
            getOrCreateATA(heliusConnection, wallet, tokenMint)
        ]);

        if (!poolResult || !Array.isArray(poolResult)) {
            throw new Error('No pool found for token');
        }

        const [marketInfo, source] = poolResult;

        if (!cachedBlockhash) {
            await getLatestBlockhashWithCache();
        }

        const transaction = await buildTransaction(marketInfo, ata, cachedBlockhash.blockhash);
        const { signature } = await sendTransaction(heliusConnection, transaction);

        return signature;
    } catch (error) {
        console.error(`Error in quickBuy: ${error.message}`);
        throw error;
    } finally {
        closeAllConnections();
        setActiveSearch(null);
        setBlockhashCacheSpeed(false);
    }
}

module.exports = { quickBuy };
