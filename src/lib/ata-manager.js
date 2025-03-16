import { Transaction, ComputeBudgetProgram } from '@solana/web3.js';
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function waitForConfirmation(connection, signature, maxRetries = 5) {
    console.error('Waiting for confirmation...');
    // Wait for transaction to propagate
    await sleep(2000);
    // Try up to maxRetries times with 2 second intervals
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await connection.getSignatureStatus(signature);
            const status = response?.value;
            console.error(`Status check ${i + 1}/${maxRetries}:`, status?.confirmationStatus || 'unknown');
            if (status?.err) {
                throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
            }
            if (status?.confirmationStatus === 'processed' ||
                status?.confirmationStatus === 'confirmed' ||
                status?.confirmationStatus === 'finalized') {
                console.error('Transaction confirmed!');
                return true;
            }
        }
        catch (error) {
            console.error(`Error checking status: ${error.message}`);
        }
        if (i < maxRetries - 1) { // Don't sleep on the last iteration
            await sleep(2000);
        }
    }
    throw new Error('Transaction confirmation timeout');
}
export class ATAManager {
    constructor(connection) {
        this.connection = connection;
    }
    async getOrCreateATA(wallet, mint, options = { skipBalanceCheck: false }) {
        try {
            // Get ATA address
            const ataAddress = await getAssociatedTokenAddress(mint, wallet.publicKey);
            console.error(`ATA would be at: ${ataAddress.toString()}`);
            // Check if account already exists
            const accountInfo = await this.connection.getAccountInfo(ataAddress);
            if (accountInfo) {
                console.error('ATA already exists');
                // Only check balance if account exists and skipBalanceCheck is false
                if (!options.skipBalanceCheck) {
                    try {
                        const balance = await this.connection.getTokenAccountBalance(ataAddress);
                        console.error(`ATA balance: ${balance.value.uiAmount}`);
                    }
                    catch (error) {
                        console.error('Failed to get token balance:', error);
                    }
                }
                return {
                    address: ataAddress,
                    created: false
                };
            }
            console.error('Creating new ATA...');
            // Create transaction
            const transaction = new Transaction();
            // Add priority fee instruction (0.01 SOL)
            transaction.add(ComputeBudgetProgram.setComputeUnitPrice({
                microLamports: 10000000
            }));
            // Add ATA instruction
            transaction.add(createAssociatedTokenAccountInstruction(wallet.publicKey, // payer
            ataAddress, // ata
            wallet.publicKey, // owner
            mint // mint
            ));
            // Get recent blockhash
            const { blockhash } = await this.connection.getLatestBlockhash('processed');
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = wallet.publicKey;
            // Sign and send transaction
            console.error('Sending transaction...');
            transaction.sign(wallet);
            const signature = await this.connection.sendRawTransaction(transaction.serialize(), {
                skipPreflight: false,
                preflightCommitment: 'processed',
                maxRetries: 3
            });
            console.error(`Transaction sent: ${signature}`);
            // Wait for confirmation
            await waitForConfirmation(this.connection, signature);
            console.error('ATA creation confirmed');
            // Check balance after creation if skipBalanceCheck is false
            if (!options.skipBalanceCheck) {
                try {
                    const balance = await this.connection.getTokenAccountBalance(ataAddress);
                    console.error(`New ATA balance: ${balance.value.uiAmount}`);
                }
                catch (error) {
                    console.error('Failed to get token balance:', error);
                }
            }
            return {
                address: ataAddress,
                created: true
            };
        }
        catch (error) {
            console.error('Failed to create ATA:', error);
            throw error;
        }
    }
}
