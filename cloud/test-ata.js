const {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  ComputeBudgetProgram
} = require("@solana/web3.js");
const {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID
} = require("@solana/spl-token");

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForConfirmation(connection, signature) {
  console.log('Waiting for confirmation...');
  
  // Wait for transaction to propagate
  await sleep(2000);
  
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
      await sleep(2000);
    }
  }
  
  throw new Error('Transaction confirmation timeout');
}

async function getOrCreateATA(connection, wallet, mint) {
  const startTime = Date.now();
  
  try {
    // Get ATA address
    const ataAddress = await getAssociatedTokenAddress(
      new PublicKey(mint),
      wallet.publicKey
    );
    console.log(`ATA would be at: ${ataAddress.toString()}`);

    // Check if account already exists
    const accountInfo = await connection.getAccountInfo(ataAddress);
    if (accountInfo) {
      console.log('ATA already exists');
      return {
        address: ataAddress,
        created: false,
        time: Date.now() - startTime
      };
    }

    console.log('Creating new ATA...');

    // Create transaction
    const transaction = new Transaction();

    // Add priority fee instruction (0.01 SOL)
    transaction.add(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 10_000_000
      })
    );

    // Add ATA instruction
    transaction.add(
      createAssociatedTokenAccountInstruction(
        wallet.publicKey,    // payer
        ataAddress,          // ata
        wallet.publicKey,    // owner
        new PublicKey(mint)  // mint
      )
    );

    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash('processed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet.publicKey;

    // Sign and send transaction
    console.log('Sending transaction...');
    transaction.sign(wallet);
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'processed',
      maxRetries: 3
    });
    console.log(`Transaction sent: ${signature}`);

    // Wait for confirmation
    await waitForConfirmation(connection, signature);
    console.log('ATA creation confirmed');

    return {
      address: ataAddress,
      created: true,
      time: Date.now() - startTime
    };
  } catch (error) {
    console.error('Failed to create ATA:', error);
    throw error;
  }
}

module.exports = { getOrCreateATA };
