import { Connection, PublicKey, Keypair, Transaction, ComputeBudgetProgram } from '@solana/web3.js';
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from '@solana/spl-token';

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForConfirmation(connection: Connection, signature: string, maxRetries = 5) {
  console.error('[ATA] Waiting for confirmation...');
  
  // Wait for transaction to propagate
  await sleep(2000);
  
  // Try up to maxRetries times with 2 second intervals
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await connection.getSignatureStatus(signature);
      const status = response?.value;
      console.error(`[ATA] Status check ${i + 1}/${maxRetries}:`, status?.confirmationStatus || 'unknown');
      
      if (status?.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
      }
      
      if (status?.confirmationStatus === 'processed' || 
          status?.confirmationStatus === 'confirmed' || 
          status?.confirmationStatus === 'finalized') {
        console.error('[ATA] Transaction confirmed!');
        return true;
      }
    } catch (error: any) {
      console.error(`[ATA] Error checking status: ${error.message}`);
    }
    
    if (i < maxRetries - 1) { // Don't sleep on the last iteration
      await sleep(2000);
    }
  }
  
  throw new Error('Transaction confirmation timeout');
}

export class ATAManager {
  constructor(private readonly connection: Connection) {}

  async getOrCreateATA(
    wallet: Keypair,
    mint: PublicKey,
    options = { skipBalanceCheck: false }
  ): Promise<{ address: PublicKey; created: boolean }> {
    try {
      // Get ATA address
      const ataAddress = await getAssociatedTokenAddress(
        mint,
        wallet.publicKey
      );
      console.error(`[ATA] Address would be at: ${ataAddress.toString()}`);

      // Check SOL balance first to avoid unnecessary errors
      const solBalance = await this.connection.getBalance(wallet.publicKey);
      console.error(`[ATA] Wallet SOL balance: ${solBalance / 1e9} SOL`);
      
      if (solBalance < 5000000) { // 0.005 SOL minimum
        console.error('[ATA] WARNING: Wallet has insufficient SOL balance for ATA creation');
        return {
          address: ataAddress,
          created: false
        };
      }

      // Check if account already exists
      const accountInfo = await this.connection.getAccountInfo(ataAddress);
      if (accountInfo) {
        console.error('[ATA] ATA already exists');

        // Only check balance if account exists and skipBalanceCheck is false
        if (!options.skipBalanceCheck) {
          try {
            const balance = await this.connection.getTokenAccountBalance(ataAddress);
            console.error(`[ATA] Token balance: ${balance.value.uiAmount}`);
          } catch (error) {
            console.error('[ATA] Failed to get token balance:', error);
          }
        }

        return {
          address: ataAddress,
          created: false
        };
      }

      console.error('[ATA] Creating new ATA...');

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
          mint                 // mint
        )
      );

      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash('processed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = wallet.publicKey;

      // Sign and send transaction
      console.error('[ATA] Sending transaction...');
      transaction.sign(wallet);
      
      try {
        const signature = await this.connection.sendRawTransaction(transaction.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'processed',
          maxRetries: 3
        });
        console.error(`[ATA] Transaction sent: ${signature}`);

        // Wait for confirmation
        await waitForConfirmation(this.connection, signature);
        console.error('[ATA] ATA creation confirmed');

        // Check balance after creation if skipBalanceCheck is false
        if (!options.skipBalanceCheck) {
          try {
            const balance = await this.connection.getTokenAccountBalance(ataAddress);
            console.error(`[ATA] New token balance: ${balance.value.uiAmount}`);
          } catch (error) {
            console.error('[ATA] Failed to get token balance:', error);
          }
        }

        return {
          address: ataAddress,
          created: true
        };
      } catch (error: any) {
        // Check for insufficient funds error
        if (error.message && (
            error.message.includes('Attempt to debit an account but found no record of a prior credit') ||
            error.message.includes('insufficient funds')
        )) {
          console.error('[ATA] Transaction failed due to insufficient funds');
          console.error('[ATA] Make sure the wallet has SOL to pay for transaction fees');
          
          // Still return the ATA address even though creation failed
          return {
            address: ataAddress,
            created: false
          };
        }
        
        // Rethrow other errors
        throw error;
      }
    } catch (error: any) {
      console.error('[ATA] Failed to create ATA:', error);
      throw error;
    }
  }
}
