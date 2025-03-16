import { Connection, PublicKey } from '@solana/web3.js';
import WebSocket from 'ws';
import dotenv from 'dotenv';
import { decodeAmmMints, decodeAmmAccount } from '../src/lib/decoders/amm-decoder.js';

dotenv.config();

const TEST_TOKEN = 'Ddm4DTxNZxABUYm2A87TFLY6GDG2ktM2eJhGZS3EbzHM';
const RAYDIUM_PROGRAM_ID = process.env.RAYDIUM_PROGRAM_ID!;

async function testRpcPoolFinding() {
  console.log('\nTesting RPC Pool Finding...');
  
  const connection = new Connection(process.env.RPC_ENDPOINT!, {
    commitment: 'processed'
  });

  try {
    // Get all program accounts
    console.log('Fetching Raydium program accounts...');
    const accounts = await connection.getProgramAccounts(new PublicKey(RAYDIUM_PROGRAM_ID), {
      commitment: 'processed',
      filters: [
        {
          dataSize: 300 // Min size for AMM accounts
        }
      ]
    });

    console.log(`Found ${accounts.length} total program accounts`);

    // Decode and filter accounts
    let poolsFound = 0;
    for (const account of accounts) {
      try {
        const mints = decodeAmmMints(account.account.data);
        if (!mints) continue;

        if (mints.baseMint === TEST_TOKEN || mints.quoteMint === TEST_TOKEN) {
          poolsFound++;
          const decoded = decodeAmmAccount(account.account.data);
          console.log('\nFound matching pool:', {
            address: account.pubkey.toString(),
            ...decoded
          });
        }
      } catch (error) {
        // Skip invalid accounts
        continue;
      }
    }

    console.log(`\nFound ${poolsFound} pools for token ${TEST_TOKEN}`);

  } catch (error) {
    console.error('RPC test failed:', error);
  }
}

async function testWebSocketPoolFinding() {
  console.log('\nTesting WebSocket Pool Finding...');
  
  return new Promise<void>((resolve) => {
    const ws = new WebSocket(process.env.WS_ENDPOINT!);
    let poolsFound = 0;

    ws.on('open', () => {
      console.log('WebSocket connected');
      
      // Subscribe to program
      const subscribeMsg = {
        jsonrpc: '2.0',
        id: 1,
        method: 'programSubscribe',
        params: [
          RAYDIUM_PROGRAM_ID,
          {
            encoding: 'base64',
            commitment: 'processed'
          }
        ]
      };
      
      ws.send(JSON.stringify(subscribeMsg));
    });

    ws.on('message', async (data: WebSocket.Data) => {
      try {
        const parsed = JSON.parse(data.toString());
        
        if (parsed.id === 1) {
          console.log('Successfully subscribed to Raydium program');
          return;
        }

        if (!parsed.params?.result?.value?.account?.data?.[0]) return;

        const accountData = parsed.params.result.value.account.data[0];
        const mints = decodeAmmMints(accountData);
        
        if (!mints) return;

        if (mints.baseMint === TEST_TOKEN || mints.quoteMint === TEST_TOKEN) {
          poolsFound++;
          const decoded = decodeAmmAccount(accountData);
          console.log('\nFound matching pool via WebSocket:', {
            address: parsed.params.result.value.pubkey,
            ...decoded
          });
        }

      } catch (error) {
        // Skip invalid messages
      }
    });

    // Run for 30 seconds
    setTimeout(() => {
      console.log(`\nFound ${poolsFound} pools via WebSocket in 30 seconds`);
      ws.close();
      resolve();
    }, 30000);

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    ws.on('close', () => {
      console.log('WebSocket closed');
    });
  });
}

async function main() {
  console.log('Starting pool finding tests...');
  console.log('Test token:', TEST_TOKEN);
  
  // Run tests
  await testRpcPoolFinding();
  await testWebSocketPoolFinding();
}

main().catch(console.error);
