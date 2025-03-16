import { Connection, PublicKey, Keypair, Transaction, ComputeBudgetProgram, VersionedTransaction, Commitment, TransactionInstruction, TransactionMessage, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import dotenv from 'dotenv';
import BN from 'bn.js';
import { decodeAmmMints, decodeAmmAccount } from './decoders/amm-decoder.js';
import { getMarketAccounts } from './decoders/market-decoder.js';
import { ATAManager } from './ata-manager.js';
import { ShyftMarket } from './shyft-market.js';
import { WebSocketManager } from './ws-manager.js';

dotenv.config();

// Constants
const TX_TEMPLATE = {
  instructions: [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000_000 })
  ],
  minimumOutBps: 5000,
  instructionData: Buffer.from([9])
};

const HARDCODED_WSOL = new PublicKey("DzsAERbVAab8pLxf419BjGbigNYVjwc7gC4MydiWJK3h");
const STATIC_AMM_AUTHORITY = new PublicKey('5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1');

// RPC endpoints
const RPC_ENDPOINTS = [
  process.env.RPC_ENDPOINT!,
  process.env.FALLBACK_RPC!,
  'https://api.mainnet-beta.solana.com'
];

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForConfirmation(connection: Connection, signature: string) {
  console.error('[TX] Waiting for confirmation...');
  
  // Wait for transaction to propagate
  await sleep(2000);
  
  // Try up to 5 times with 2 second intervals
  for (let i = 0; i < 5; i++) {
    try {
      const response = await connection.getSignatureStatus(signature);
      const status = response?.value;
      console.error(`[TX] Status check ${i + 1}/5:`, status?.confirmationStatus || 'unknown');
      
      if (status?.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
      }
      
      if (status?.confirmationStatus === 'processed' || 
          status?.confirmationStatus === 'confirmed' || 
          status?.confirmationStatus === 'finalized') {
        console.error('[TX] Transaction confirmed!');
        return true;
      }
    } catch (error: any) {
      console.error(`[TX] Error checking status: ${error.message}`);
    }
    
    if (i < 4) { // Don't sleep on the last iteration
      await sleep(2000);
    }
  }
  
  throw new Error('Transaction confirmation timeout');
}

interface SnipeResult {
  region: string;
  status: string;
  tokenMint: string;
  slippageBps: number;
  timestamp: string;
  error?: string;
  pools?: {
    amm: number;
    serum: number;
  };
  txId?: string;
}

export class RegionManager {
  private connection: Connection;
  private fallbackConnection: Connection;
  private readonly MAX_RETRIES = Number(process.env.MAX_RETRIES) || 3;
  private readonly RETRY_DELAY = Number(process.env.RETRY_DELAY) || 1000;
  private readonly RAYDIUM_PROGRAM_ID = process.env.RAYDIUM_PROGRAM_ID!;
  private readonly MIN_AMM_DATA_SIZE = Number(process.env.MIN_AMM_DATA_SIZE) || 300;
  private rpcConnections: Connection[];

  private ataManager: ATAManager;
  private shyftMarket: ShyftMarket;
  private wsManager: WebSocketManager;

  constructor(private state: any) {
    const commitment = (process.env.COMMITMENT_LEVEL || 'processed') as Commitment;

    // Initialize RPC connections
    this.rpcConnections = RPC_ENDPOINTS.map(endpoint => new Connection(endpoint, {
      commitment,
      confirmTransactionInitialTimeout: 10000
    }));

    // Set primary and fallback connections
    [this.connection, this.fallbackConnection] = this.rpcConnections;

    // Initialize managers
    this.ataManager = new ATAManager(this.connection);
    this.shyftMarket = new ShyftMarket();
    this.wsManager = new WebSocketManager();
  }

  async initializeConnections() {
    console.error('[Startup] Initializing connections...');
    try {
      await this.connection.getSlot();
      console.error('[Startup] Primary RPC connection established');
    } catch (error) {
      console.error('[Startup] Failed to initialize primary connection:', error);
      try {
        await this.fallbackConnection.getSlot();
        console.error('[Startup] Fallback connection established');
      } catch (fallbackError) {
        console.error('[Startup] Failed to initialize fallback connection:', fallbackError);
      }
    }
  }

  async closeAllConnections() {
    await this.wsManager.closeAllConnections();
  }

  private async withRetry<T>(
    operation: (connection: Connection) => Promise<T>
  ): Promise<T> {
    let lastError: Error | undefined;

    // Try all RPC endpoints
    for (const connection of this.rpcConnections) {
      for (let i = 0; i < this.MAX_RETRIES; i++) {
        try {
          return await operation(connection);
        } catch (error: any) {
          lastError = error;
          console.error(`[RPC] Attempt ${i + 1} failed:`, error.message);
          
          // Check if error is due to rate limit or auth
          if (error.message.includes('429') || error.message.includes('403')) {
            break; // Skip remaining attempts for this endpoint
          }
          
          if (i < this.MAX_RETRIES - 1) {
            await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
          }
        }
      }
    }

    throw lastError || new Error('All RPC attempts failed');
  }

  private async findLiquidityPools(
    connection: Connection,
    tokenMint: PublicKey
  ): Promise<{ ammPools: any[]; markets: any[] }> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.wsManager.stopPoolSearch();
        reject(new Error('Pool search timeout'));
      }, 30000); // 30 second timeout

      let wsPoolFound = false;
      let rpcPoolFound = false;

      // Create AbortController for cleanup
      const controller = new AbortController();
      const { signal } = controller;

      console.error('[Pool] Starting search for token:', tokenMint.toString());

      // Start both methods concurrently at maximum speed
      const promises: Promise<{ ammPools: any[]; markets: any[] }>[] = [
        // Method 1: Aggressive GraphQL polling
        (async () => {
          console.error('[Pool] Starting GraphQL polling search...');
          const pool = await this.shyftMarket.pollPoolInfo(tokenMint.toString(), signal);
          if (pool) {
            console.error('[Pool] GraphQL found pool:', pool.pubkey);
            const serumInfo = await this.getSerumMarketInfo(pool.marketId, pool.marketProgramId, connection);
            const combined = this.combinePoolAndMarketInfo(pool, serumInfo);
            rpcPoolFound = true;
            if (!wsPoolFound) {
              return { 
                ammPools: [combined],
                markets: []
              };
            }
          } else {
            console.error('[Pool] GraphQL polling did not find any pool');
          }
          return { ammPools: [], markets: [] };
        })(),

        // Method 2: WebSocket subscription
        new Promise<{ ammPools: any[]; markets: any[] }>((wsResolve) => {
          console.error('[Pool] Starting WebSocket subscription search...');
          this.wsManager.startPoolSearch(tokenMint.toString(), async (poolInfo) => {
            try {
              console.error('[Pool] WebSocket found pool:', poolInfo.pubkey);
              const serumInfo = await this.getSerumMarketInfo(
                poolInfo.marketId,
                poolInfo.marketProgramId,
                connection
              );

              const combined = this.combinePoolAndMarketInfo(poolInfo, serumInfo);
              wsPoolFound = true;
              wsResolve({ 
                ammPools: [combined],
                markets: []
              });
            } catch (error) {
              console.error('[Pool] WebSocket pool processing error:', error);
              wsResolve({ ammPools: [], markets: [] });
            }
          });
        })
      ];

      Promise.race(promises).then(resolve).catch(reject).finally(() => {
        // Cleanup
        controller.abort();
        this.wsManager.stopPoolSearch();
        clearTimeout(timeout);

        // Log which method found the pool first
        console.error(`[Pool] Search finished - WebSocket found: ${wsPoolFound}, GraphQL found: ${rpcPoolFound}`);
      });
    });
  }

  private async getSerumMarketInfo(marketId: string, marketProgramId: string, connection: Connection) {
    try {
      const marketAccounts = await getMarketAccounts(connection, marketId, marketProgramId);
      if (!marketAccounts) {
        throw new Error('Failed to fetch market accounts');
      }

      return {
        serumProgramId: new PublicKey(marketProgramId),
        serumMarket: new PublicKey(marketId),
        serumBids: new PublicKey(marketAccounts.bids),
        serumAsks: new PublicKey(marketAccounts.asks),
        serumEventQueue: new PublicKey(marketAccounts.eventQueue),
        serumCoinVault: new PublicKey(marketAccounts.baseVault),
        serumPcVault: new PublicKey(marketAccounts.quoteVault),
        serumVaultSigner: new PublicKey(marketAccounts.vaultSigner)
      };
    } catch (error) {
      throw error;
    }
  }

  private combinePoolAndMarketInfo(pool: any, serumInfo: any) {
    return {
      ammMarket: new PublicKey(pool.pubkey),
      ammAuthority: STATIC_AMM_AUTHORITY,
      ammOpenOrders: new PublicKey(pool.openOrders),
      ammTargetOrders: new PublicKey(pool.targetOrders),
      poolCoinTokenAccount: new PublicKey(pool.baseVault),
      poolPcTokenAccount: new PublicKey(pool.quoteVault),
      ...serumInfo
    };
  }

  async snipeToken(tokenMint: string, slippageBps: number, regions: string[], amountSol?: number): Promise<SnipeResult[]> {
    const results: SnipeResult[] = [];
    const mint = new PublicKey(tokenMint);
    const snipeAmount = (amountSol || 0.05) * LAMPORTS_PER_SOL;

    console.error(`[Sniper] Sniping token ${tokenMint} with ${slippageBps/100}% slippage and ${amountSol || 0.05} SOL`);
    console.error(`[Sniper] Requested regions: ${regions.join(', ')}`);
    
    try {
      // Get wallet from state
      const wallet = this.state.wallet as Keypair;
      if (!wallet) {
        throw new Error('Wallet not found in state');
      }

      // Check wallet SOL balance first
      const solBalance = await this.connection.getBalance(wallet.publicKey);
      console.error(`[Wallet] SOL balance: ${solBalance / LAMPORTS_PER_SOL} SOL`);
      
      if (solBalance < snipeAmount) {
        throw new Error(`Insufficient SOL balance: ${solBalance / LAMPORTS_PER_SOL} SOL, need at least ${snipeAmount / LAMPORTS_PER_SOL} SOL`);
      }

      // Start pool finding and ATA creation in parallel
      console.error('[Sniper] Starting pool search and ATA creation in parallel');
      let poolPromise = this.withRetry(
        async (connection) => await this.findLiquidityPools(connection, mint)
      );

      let ataPromise = this.withRetry(
        async (connection) => await this.ataManager.getOrCreateATA(wallet, mint)
      );

      // Run pool finding and ATA creation in parallel
      const [{ ammPools, markets }, { address: outputAta }] = await Promise.all([
        poolPromise,
        ataPromise
      ]);

      console.error(`[Sniper] Found ${ammPools.length} AMM pools and ${markets.length} markets`);
      
      if (ammPools.length === 0 && markets.length === 0) {
        throw new Error('No liquidity pools found');
      }

      // Get market info from first pool
      const marketInfo = ammPools[0];
      console.error(`[Sniper] Using AMM market: ${marketInfo.ammMarket.toString()}`);

      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash('processed');

      // Build transaction
      const minimumOut = Math.floor(snipeAmount * TX_TEMPLATE.minimumOutBps / 10000);
      
      const instructionData = Buffer.concat([
        TX_TEMPLATE.instructionData,
        new BN(snipeAmount).toArrayLike(Buffer, 'le', 8),
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
        { pubkey: outputAta, isSigner: false, isWritable: true },
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true }
      ];

      const transaction = new VersionedTransaction(
        new TransactionMessage({
          payerKey: wallet.publicKey,
          recentBlockhash: blockhash,
          instructions: [
            ...TX_TEMPLATE.instructions,
            new TransactionInstruction({
              programId: new PublicKey(this.RAYDIUM_PROGRAM_ID),
              keys,
              data: instructionData
            })
          ]
        }).compileToV0Message()
      );

      transaction.sign([wallet]);

      console.error('[TX] Sending swap transaction...');
      const txId = await this.connection.sendTransaction(transaction, { skipPreflight: true });
      console.error(`[TX] Sent transaction: ${txId}`);

      await waitForConfirmation(this.connection, txId);
      console.error(`[TX] Confirmed transaction: ${txId}`);
      
      // Generate results for each requested region
      for (const region of regions) {
        const result: SnipeResult = {
          region,
          status: 'success',
          tokenMint,
          slippageBps,
          timestamp: new Date().toISOString(),
          pools: {
            amm: ammPools.length,
            serum: markets.length
          },
          txId
        };
        
        results.push(result);
      }
      
      // Add to active transactions
      const txKey = `${Date.now()}`;
      this.state.activeTransactions.set(txKey, results[0]); // Just store the first one

      // Print status update in a more visible format
      console.error('\n=== Snipe Status Update ===');
      for (const result of results) {
        console.error(`[${result.region}] success - Token: ${tokenMint}, Slippage: ${slippageBps/100}%, TX: ${txId}`);
      }
      console.error('=========================\n');

    } catch (error: unknown) {
      console.error('[Sniper] Error sniping token:', error);
      
      // Generate error results for each requested region
      for (const region of regions) {
        results.push({
          region,
          status: 'error',
          tokenMint,
          slippageBps,
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error)
        });
      }
      
      // Print status update in a more visible format
      console.error('\n=== Snipe Status Update ===');
      for (const result of results) {
        console.error(`[${result.region}] error - Token: ${tokenMint}, Slippage: ${slippageBps/100}%`);
      }
      console.error('=========================\n');
    }

    return results;
  }

  async getRegionStatuses() {
    console.error('[Status] Checking region statuses...');
    const statuses = [];
    
    try {
      // Use withRetry for health check
      const { blockhash } = await this.withRetry(
        async (conn) => await conn.getLatestBlockhash()
      );
      const latency = await this.measureLatency(this.connection);
      
      // For each configured region
      for (const region of this.state.regions) {
        statuses.push({
          region,
          status: blockhash ? 'connected' : 'degraded',
          latency,
          usingFallback: false,
          wsConnected: this.wsManager.getActiveConnections() > 0
        });
      }
    } catch (error: unknown) {
      // Try fallback
      try {
        const { blockhash } = await this.fallbackConnection.getLatestBlockhash();
        const latency = await this.measureLatency(this.fallbackConnection);
        
        // For each configured region
        for (const region of this.state.regions) {
          statuses.push({
            region,
            status: 'connected',
            latency,
            usingFallback: true,
            wsConnected: this.wsManager.getActiveConnections() > 0
          });
        }
      } catch (fallbackError) {
        // For each configured region
        for (const region of this.state.regions) {
          statuses.push({
            region,
            status: 'error',
            latency: -1,
            usingFallback: false,
            wsConnected: this.wsManager.getActiveConnections() > 0
          });
        }
      }
    }

    return statuses;
  }

  private async measureLatency(connection: Connection): Promise<number> {
    const start = Date.now();
    try {
      await connection.getSlot();
      return Date.now() - start;
    } catch (error: unknown) {
      console.error('[Status] Latency measurement error:', error);
      return -1;
    }
  }
}
