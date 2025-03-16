// Implementation of quick-buy for cloud function
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
const bs58 = require('bs58');
const BN = require('bn.js');
const { getOrCreateATA } = require('./test-ata.js');

// Constants - same as reference implementation
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
const RAYDIUM_PROGRAM_ID = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');

// Blockhash caching
let cachedBlockhash = null;
let lastBlockhashTime = 0;
const FAST_CACHE_INTERVAL = 50;

async function getLatestBlockhashWithCache(connection) {
  const now = Date.now();
  if (cachedBlockhash && now - lastBlockhashTime < FAST_CACHE_INTERVAL) {
    return cachedBlockhash;
  }

  try {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('processed');
    cachedBlockhash = { blockhash, lastValidBlockHeight };
    lastBlockhashTime = now;
    return cachedBlockhash;
  } catch (error) {
    throw new Error(`Failed to get blockhash: ${error.message}`);
  }
}

async function buildTransaction(marketInfo, tokenAccountAddress, blockhash, wallet) {
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
    const signature = await connection.sendTransaction(transaction, {
      skipPreflight: true,
      preflightCommitment: 'processed'
    });
    
    return { signature, success: true };
  } catch (error) {
    console.error(`Transaction failed: ${error.message}`);
    throw error;
  }
}

async function waitForConfirmation(connection, signature) {
  console.log('Waiting for confirmation...');
  
  // Wait for transaction to propagate
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Try up to 5 times with 2 second intervals
  for (let i = 0; i < 5; i++) {
    try {
      const response = await connection.getSignatureStatus(signature);
      const status = response?.value;
      console.log(`Status check ${i + 1}/5:`, status?.confirmationStatus || 'unknown');
      
      if (status?.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
      }
      
      if (status?.confirmationStatus === 'processed' || 
          status?.confirmationStatus === 'confirmed' || 
          status?.confirmationStatus === 'finalized') {
        console.log('Transaction confirmed!');
        return true;
      }
    } catch (error) {
      console.log(`Error checking status: ${error.message}`);
    }
    
    if (i < 4) { // Don't sleep on the last iteration
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  throw new Error('Transaction confirmation timeout');
}

async function quickBuy(connection, wallet, tokenMint, marketInfo) {
    try {
        console.log(`Quick buy initiated for token ${tokenMint}`);
        
        // Get or create ATA
        const { address: ata } = await getOrCreateATA(connection, wallet, tokenMint);
        console.log(`Using ATA: ${ata.toString()}`);

        // Get fresh blockhash
        const { blockhash } = await getLatestBlockhashWithCache(connection);
        console.log(`Using blockhash: ${blockhash}`);

        // Build transaction
        const transaction = await buildTransaction(marketInfo, ata, blockhash, wallet);
        
        // Send transaction
        console.log('Sending transaction...');
        const { signature } = await sendTransaction(connection, transaction);
        console.log(`Transaction sent: ${signature}`);

        // Wait for confirmation
        await waitForConfirmation(connection, signature);
        
        return {
            success: true,
            signature,
            ata: ata.toString()
        };
    } catch (error) {
        console.error(`Error in quickBuy: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = { quickBuy };
