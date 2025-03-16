import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { promises as fs } from 'fs';

dotenv.config();

const TATUM_API_URL = 'https://api.tatum.io/v4';

async function registerPrivateKey() {
    try {
        // Get wallet info from environment variables
        const walletAddress = process.env.WALLET_ADDRESS;
        const walletPrivateKey = process.env.WALLET_PRIVATE_KEY;

        if (!walletAddress || !walletPrivateKey) {
            throw new Error('WALLET_ADDRESS and WALLET_PRIVATE_KEY must be set in .env file');
        }

        console.log('Using wallet info from environment variables');
        
        // Create a KMS entry
        console.log('Creating KMS entry...');
        const signatureId = `sol-${Date.now()}`;

        const controller = new AbortController();
        const timeout = setTimeout(() => {
            controller.abort();
        }, 10000); // 10 second timeout

        try {
            const kmsResponse = await fetch(`${TATUM_API_URL}/private-key`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': process.env.NEXT_PUBLIC_TATUM_API_KEY
                },
                body: JSON.stringify({
                    privateKey: walletPrivateKey,
                    signatureId: signatureId,
                    chain: 'SOL'
                }),
                signal: controller.signal
            });

            clearTimeout(timeout);

            const kmsText = await kmsResponse.text();
            console.log('KMS Response status:', kmsResponse.status);
            console.log('KMS Response:', kmsText);

            if (!kmsResponse.ok) {
                throw new Error(`Failed to create KMS entry: ${kmsText}`);
            }

            // Save signatureId to .env file
            console.log('Saving signatureId to .env file...');
            const envContent = await fs.readFile('.env', 'utf8');
            const newEnvContent = envContent + 
                `\nTATUM_SIGNATURE_ID=${signatureId}\n`;
            await fs.writeFile('.env', newEnvContent);
            
            console.log('Setup completed successfully!');
            console.log(`Signature ID: ${signatureId}`);
            console.log('The signatureId has been saved to your .env file');
        } catch (error) {
            clearTimeout(timeout);
            if (error.name === 'AbortError') {
                throw new Error('Request timed out after 10 seconds');
            }
            throw error;
        }
        
    } catch (error) {
        console.error('Error during setup:');
        console.error(error);
        if (error.cause) {
            console.error('Cause:', error.cause);
        }
    }
}

console.log('Setting up Tatum KMS...');
registerPrivateKey().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
