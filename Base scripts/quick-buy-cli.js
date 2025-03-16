const { PublicKey } = require('@solana/web3.js');
const dotenv = require('dotenv');
const fetch = require('node-fetch');
const { quickBuy } = require('./quick-buy.js');
const readline = require('readline');

dotenv.config();

const REGIONS = [
  'asia-northeast1',  // Tokyo
  'europe-west3',     // Frankfurt
  'us-east1'         // Virginia
];

// Function to trigger all regional deployments
async function triggerRegionalBuys(tokenMint) {
  console.log(`\n🌎 Triggering quick buy across all regions for ${tokenMint}`);
  
  const promises = REGIONS.map(region => {
    const url = `https://${region}-hip-bonito-451118-h3.cloudfunctions.net/quick-buy-${region}`;
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokenMint })
    })
    .then(res => res.json())
    .then(data => ({
      region,
      ...data
    }))
    .catch(error => ({
      region,
      success: false,
      error: error.message
    }));
  });

  const results = await Promise.all(promises);
  
  // Log results
  console.log('\n📊 Results:');
  results.forEach(({ region, success, signature, error }) => {
    if (success) {
      console.log(`✅ ${region}: ${signature}`);
    } else {
      console.log(`❌ ${region}: ${error}`);
    }
  });
}

// Main CLI interface
async function main() {
  if (!process.env.WALLET_PRIVATE_KEY) {
    console.error('WALLET_PRIVATE_KEY is required in .env file');
    process.exit(1);
  }

  console.log(`\n🚀 Quick Buy CLI`);
  console.log(`💰 Wallet: ${process.env.WALLET_PUBLIC_KEY}`);
  console.log(`💵 Amount: 0.2 SOL per trade`);
  console.log(`🌍 Regions: ${REGIONS.join(', ')}`);
  console.log(`\n📝 Enter token address to buy (Ctrl+C to exit):`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.on('line', async (input) => {
    const tokenAddress = input.trim();
    if (!tokenAddress) return;

    try {
      new PublicKey(tokenAddress);
      await triggerRegionalBuys(tokenAddress);
    } catch (error) {
      console.error('Error:', error.message);
    }
  });

  rl.on('close', () => {
    process.exit(0);
  });
}

// Start CLI
main().catch(console.error);

module.exports = { triggerRegionalBuys };
