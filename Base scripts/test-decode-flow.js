const { Connection, PublicKey } = require("@solana/web3.js");
const { decodeAmmMints, decodeAmmAccount } = require("./lib/amm-decoder.js");
const { getMarketAccounts } = require("./lib/market-decoder.js");

// Known values from the example
const EXPECTED_VALUES = {
  ammAccount: '7AAw4BZXCoGo57ji9bJKsU2NDWiZ9UcsCA1ckqWMZLxQ',
  ammAuthority: '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1',
  ammOpenOrders: 'EoHF1iz9fagYGpQGrUpRH4GLKoUcnUHiiJ9AxJxQzHPx',
  ammTargetOrders: 'HVxWLJg5oHik1DCoW1sQLgaNUiybtCvirQH6gEfRmmBd',
  poolCoinTokenAccount: 'CTmj56ie4epgYnPoU7j7g7KpXhX3FEn6JfUivGCTcZuk',
  poolPcTokenAccount: 'CRy5fkX3cuEN98GfhDjxyFKNXitdU3dNAPDkYgUNvzib',
  serumProgramId: 'srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX',
  serumMarket: 'U6nhU5czxNGJgeC4LUZZPRPpecVLTDpwfKCy6yHJDWM',
  serumBids: 'CxF86HCtQrZ7o5eTGptMEhaYf3WskWgYX8S4Uf4jJKpB',
  serumAsks: '2A7Ba2cEXfbhxYCm9EUxQk8Jw8fEHDVt8zcGiQ5e6JHK',
  serumEventQueue: 'HQXpKqZMoXomAUc8RQXJkUBvbmvbhZEtLAd6P2cXRTxr',
  serumCoinVault: 'CGPVFtMFDCCZLRS8PfjtZCkt82s9TcchmrzyX1aJAnxH',
  serumPcVault: '3BWpADjyeDq4nQcjecNqhh6rEnQAtv8TeBrwozVfMmuA',
  serumVaultSigner: 'DAg3AshVGwvhxwCe9NwjXJe9tgh7A8uX8CcVF6qJqPVr'
};

// RPC connection
const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=471d92ec-a326-49b2-a911-9e4c20645554', {
  commitment: 'confirmed'
});

async function fetchAccountData(pubkey) {
  console.log(`\nFetching account data for ${pubkey}...`);
  const accountInfo = await connection.getAccountInfo(new PublicKey(pubkey));
  if (!accountInfo) {
    throw new Error('Account not found');
  }
  return accountInfo.data;
}

function compareAndLogField(fieldName, actual, expected) {
  const matches = actual === expected;
  console.log(`${fieldName}:`);
  console.log(`  Expected: ${expected}`);
  console.log(`  Actual:   ${actual}`);
  console.log(`  Matches:  ${matches ? '✅' : '❌'}`);
  if (!matches) {
    console.log('  Difference detected!');
  }
  return matches;
}

async function testDecodeFlow() {
  try {
    // 1. Fetch AMM account data
    const ammData = await fetchAccountData(EXPECTED_VALUES.ammAccount);
    console.log('\nTesting AMM account decoding...');

    // 2. Test mint decoding
    const mints = decodeAmmMints(ammData);
    console.log('\nMints decoded:', mints);

    // 3. Test full AMM decoding
    const decodedAmm = decodeAmmAccount(ammData);
    console.log('\nTesting AMM field matches:');
    
    // Debug: Print raw data at ALL offsets
    console.log('\nRaw data at ALL offsets:');
    for (let offset = 400; offset < 900; offset += 32) {
      const slice = Buffer.from(ammData.slice(offset, offset + 32));
      const hex = slice.toString('hex');
      try {
        const pubkey = new PublicKey(slice);
        console.log(`offset ${offset}: ${hex} -> ${pubkey.toBase58()}`);
      } catch (error) {
        console.log(`offset ${offset}: ${hex} -> INVALID`);
      }
    }

    // Compare AMM fields
    let allMatch = true;
    allMatch &= compareAndLogField('AMM Open Orders', decodedAmm.openOrders, EXPECTED_VALUES.ammOpenOrders);
    allMatch &= compareAndLogField('AMM Target Orders', decodedAmm.targetOrders, EXPECTED_VALUES.ammTargetOrders);
    allMatch &= compareAndLogField('Pool Coin Token Account', decodedAmm.baseVault, EXPECTED_VALUES.poolCoinTokenAccount);
    allMatch &= compareAndLogField('Pool PC Token Account', decodedAmm.quoteVault, EXPECTED_VALUES.poolPcTokenAccount);

    // Get market accounts using market-decoder
    console.log('\nTesting market field matches:');
    const marketAccounts = await getMarketAccounts(
      connection,
      EXPECTED_VALUES.serumMarket,
      EXPECTED_VALUES.serumProgramId
    );

    allMatch &= compareAndLogField('Serum Bids', marketAccounts.bids, EXPECTED_VALUES.serumBids);
    allMatch &= compareAndLogField('Serum Asks', marketAccounts.asks, EXPECTED_VALUES.serumAsks);
    allMatch &= compareAndLogField('Serum Event Queue', marketAccounts.eventQueue, EXPECTED_VALUES.serumEventQueue);
    allMatch &= compareAndLogField('Serum Coin Vault', marketAccounts.baseVault, EXPECTED_VALUES.serumCoinVault);
    allMatch &= compareAndLogField('Serum PC Vault', marketAccounts.quoteVault, EXPECTED_VALUES.serumPcVault);
    allMatch &= compareAndLogField('Serum Vault Signer', marketAccounts.vaultSigner, EXPECTED_VALUES.serumVaultSigner);

    console.log('\nFinal Result:', allMatch ? '✅ All fields match' : '❌ Some fields do not match');

  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test if called directly
if (require.main === module) {
  testDecodeFlow().catch(console.error);
}

module.exports = { testDecodeFlow };
