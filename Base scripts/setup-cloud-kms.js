import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { promises as fs } from 'fs';

dotenv.config();

const TATUM_API_URL = 'https://api.tatum.io/v4';

async function setupCloudKMS() {
    try {
        // Get wallet info from environment variables
        const walletAddress = process.env.WALLET_ADDRESS;
        const walletPrivateKey = process.env.WALLET_PRIVATE_KEY;

        if (!walletAddress || !walletPrivateKey) {
            throw new Error('WALLET_ADDRESS and WALLET_PRIVATE_KEY must be set in .env file');
        }

        console.log('Using wallet info from environment variables');
        
        // Register private key with Tatum Cloud KMS
        console.log('Registering private key with Tatum Cloud KMS...');
        const signatureId = `sol-${Date.now()}`;
        const kmsResponse = await fetch(`${TATUM_API_URL}/keystore`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.NEXT_PUBLIC_TATUM_API_KEY
            },
            body: JSON.stringify({
                privateKey: walletPrivateKey,
                signatureId: signatureId,
                chain: 'SOL',
                version: 2
            })
        });

        const kmsText = await kmsResponse.text();
        console.log('KMS Response status:', kmsResponse.status);
        console.log('KMS Response:', kmsText);

        if (!kmsResponse.ok) {
            throw new Error(`Failed to register with KMS: ${kmsText}`);
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
        console.error('Error during setup:');
        console.error(error);
        if (error.cause) {
            console.error('Cause:', error.cause);
        }
    }
}

console.log('Setting up Tatum Cloud KMS...');
setupCloudKMS().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
