const { Connection, PublicKey } = require('@solana/web3.js');
const WebSocket = require('ws');
const { decodeAmmMints, decodeAmmAccount, isAmmAccountData } = require('./lib/amm-decoder.js');

// Constants
const RAYDIUM_PROGRAM_ID = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
const RECONNECT_INTERVAL = 1000; // 1 second between reconnection attempts
const WS_ENDPOINTS = [
  'wss://mainnet.helius-rpc.com/?api-key=471d92ec-a326-49b2-a911-9e4c20645554',
  'wss://api.mainnet-beta.solana.com',
  'wss://solana-mainnet.core.chainstack.com/210d61ea75f259b1847f014f9a7de887',
  'wss://rpc.shyft.to?api_key=Eqt2maxKuv3JSQ8l',
  'wss://solana.api.onfinality.io/rpc?apikey=504d5f27-7b97-4355-a49c-6671cb0f1c6d',
  'wss://lb.drpc.org/ogws?network=solana&dkey=ApsEzmAy3kevjBJbNBXLaP-B4ozy7IcR77v20mSYF3e0'
];

// Minimum size for AMM account data
const MIN_AMM_DATA_SIZE = 300;

// Active websocket connections
let activeConnections = new Map();

// Callback type for when a matching pool is found
let onMatchingPoolFound = null;

// Stats tracking (non-blocking)
let stats = {
  lastSummaryTime: Date.now(),
  successfulDecodes: 0,
  failedDecodes: 0,
  SUMMARY_INTERVAL: 30000, // 30 seconds
  pendingLogs: []
};

// Non-blocking log processing
const logInterval = setInterval(() => {
  if (stats.pendingLogs.length > 0) {
    const logs = stats.pendingLogs;
    stats.pendingLogs = [];
    process.nextTick(() => {
      logs.forEach(log => console.log(log));
    });
  }

  // Check if it's time for a summary
  const now = Date.now();
  if (now - stats.lastSummaryTime >= stats.SUMMARY_INTERVAL) {
    const totalDecodes = stats.successfulDecodes + stats.failedDecodes;
    const decodesPerSecond = (totalDecodes / 30).toFixed(1); // per second over 30s
    
    console.log('\n📊 30s Summary:');
    console.log(`✅ Successful: ${stats.successfulDecodes}`);
    console.log(`❌ Failed: ${stats.failedDecodes}`);
    console.log(`⚡ Rate: ${decodesPerSecond}/s`);
    
    // Reset stats
    stats.lastSummaryTime = now;
    stats.successfulDecodes = 0;
    stats.failedDecodes = 0;
  }
}, 1000);

// Function to set the callback
function setMatchingPoolCallback(callback) {
  onMatchingPoolFound = callback;
}

// Track if we've found a match
let matchFound = false;

// Function to start WebSocket connections
function startWebSockets(targetTokenAddress) {
  console.log('\n🔍 Searching for pools with token:', targetTokenAddress);
  
  // Reset match state
  matchFound = false;
  
  // Close any existing connections
  closeAllConnections();
  
  // Start connections to all endpoints
  WS_ENDPOINTS.forEach(endpoint => {
    const ws = createWebSocket(endpoint, targetTokenAddress);
    activeConnections.set(endpoint, ws);
  });
}

// Function to create a single websocket connection
function createWebSocket(wsUrl, targetTokenAddress) {
  let ws;
  let isConnected = false;

  function connect() {
    ws = new WebSocket(wsUrl);

    ws.on('open', function open() {
      isConnected = true;
      const subscribeMessage = {
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
      ws.send(JSON.stringify(subscribeMessage));
      console.log(`🔌 WebSocket connected to ${wsUrl}`);
    });

    ws.on('message', function incoming(data) {
      try {
        const parsedData = JSON.parse(data);
        
        // Skip subscription confirmation
        if (parsedData.id === 1) {
          stats.pendingLogs.push(`✅ WebSocket subscribed successfully to ${wsUrl}`);
          return;
        }

        // Process program notifications immediately
        if (parsedData.method === 'programNotification') {
          // Use setImmediate to process in next iteration of event loop
          setImmediate(() => {
            handleAccountNotification(parsedData.params, targetTokenAddress, wsUrl);
          });
        }
      } catch (error) {
        stats.pendingLogs.push(`❌ WebSocket message error on ${wsUrl}: ${error.message}`);
      }
    });

    ws.on('error', function error(err) {
      if (isConnected) {
        isConnected = false;
        console.error(`❌ WebSocket error on ${wsUrl}:`, err.message);
        setTimeout(connect, RECONNECT_INTERVAL);
      }
    });

    ws.on('close', function close() {
      if (isConnected) {
        isConnected = false;
        console.log(`🔄 WebSocket closed for ${wsUrl}, reconnecting...`);
        setTimeout(connect, RECONNECT_INTERVAL);
      }
    });
  }

  connect();
  return ws;
}

function handleAccountNotification(params, targetTokenAddress, wsUrl) {
  if (!params?.result?.value?.account?.data?.[0] || !targetTokenAddress || !onMatchingPoolFound) return;

  const { pubkey, account } = params.result.value;
  const accountData = account.data[0];
  
  if (accountData.length < MIN_AMM_DATA_SIZE) return;

  try {
    // Pre-compute target for comparison
    const targetLower = targetTokenAddress.toLowerCase();
    
    // First decode just the mints
    const mints = decodeAmmMints(accountData);
    if (!mints) {
      stats.failedDecodes++;
      return;
    }

    stats.successfulDecodes++;

    // Quick match check
    const baseMintLower = mints.baseMint.toLowerCase();
    const quoteMintLower = mints.quoteMint.toLowerCase();
    
    if (!matchFound && (baseMintLower === targetLower || quoteMintLower === targetLower)) {
      // Set match found flag
      matchFound = true;
      
      // Found a match - decode full account
      const decodedAccount = decodeAmmAccount(accountData);
      if (!decodedAccount) {
        matchFound = false;
        return;
      }

      const foundTime = Date.now();
      
      // Trigger callback immediately
      onMatchingPoolFound({
        pubkey,
        ...decodedAccount,
        timestamp: foundTime,
        source: params.result.context.slot,
        endpoint: wsUrl
      });

      // Log match asynchronously
      process.nextTick(() => {
        stats.pendingLogs.push(`\n🎯 Match found from ${wsUrl}! ${JSON.stringify({
          tokenMint: targetTokenAddress,
          baseMint: mints.baseMint,
          quoteMint: mints.quoteMint,
          ammAccount: pubkey
        }, null, 2)}`);
      });
    }
  } catch (error) {
    stats.failedDecodes++;
  }
}

// Export cleanup function
function closeAllConnections() {
  clearInterval(logInterval);
  for (const [endpoint, ws] of activeConnections) {
    try {
      ws.terminate();
    } catch (error) {
      // Ignore termination errors
    }
  }
  activeConnections.clear();
  matchFound = false;
}

module.exports = {
  startWebSockets,
  setMatchingPoolCallback,
  closeAllConnections
};
