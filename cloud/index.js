// Cloud function implementation with pool finding and transaction execution
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const functions = require('@google-cloud/functions-framework');
const WebSocket = require('ws');
const axios = require('axios');
const bs58 = require('bs58');
const { setTimeout } = require('timers/promises');

// Import local modules
const { getOrCreateATA } = require('./test-ata.js');
const { quickBuy } = require('./quick-buy.js');

// Constants
const RAYDIUM_PROGRAM_ID = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
const MIN_AMM_DATA_SIZE = 300;
const STATIC_AMM_AUTHORITY = new PublicKey('5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1');

// Register HTTP function
functions.http('quickBuyFunction', async (req, res) => {
  // Always respond with 200 OK for health checks and GET requests
  if (req.method === 'GET') {
    console.log('Health check received');
    return res.status(200).send('OK');
  }

  console.log(`Function started in region: ${process.env.FUNCTION_REGION || 'unknown'}`);
  const startTime = Date.now();

  try {
    // Validate request - require a token mint
    if (!req.body || !req.body.tokenMint) {
      console.log('Missing tokenMint in request');
      return res.status(400).json({
        success: false,
        region: process.env.FUNCTION_REGION || 'unknown',
        error: 'Missing tokenMint parameter'
      });
    }

    const tokenMint = req.body.tokenMint;
    const slippageBps = req.body.slippageBps || 100;
    const amountSol = req.body.amountSol || 0.05;
    const region = process.env.FUNCTION_REGION || 'unknown';

    console.log(`Searching for token ${tokenMint} in region ${region}`);

    // Initialize Solana connection
    const connection = new Connection(
      `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`, 
      { commitment: 'processed' }
    );
    
    // Initialize wallet if available
    let wallet = null;
    if (process.env.WALLET_PRIVATE_KEY) {
      try {
        wallet = Keypair.fromSecretKey(bs58.decode(process.env.WALLET_PRIVATE_KEY));
        console.log(`Wallet initialized: ${wallet.publicKey.toString()}`);
      } catch (walletError) {
        console.error('Failed to initialize wallet:', walletError.message);
      }
    }

    // Active WebSocket connections to close at the end
    const wsConnections = [];
    
    // Setup timeout and pool finding promises
    const graphQLPromise = findPoolViaGraphQL(tokenMint);
    const wsPromise = findPoolViaWebSocket(tokenMint, wsConnections);
    const tokenAgePromise = checkTokenAge(tokenMint);
    
    // Set timeout for the whole operation
    const timeoutPromise = new Promise(resolve => {
      setTimeout(5000, { value: { timeout: true } }).then(resolve);
    });
    
    // Race between pool finding methods and timeout
    const result = await Promise.race([
      graphQLPromise.then(pool => pool ? { poolInfo: pool, source: 'graphql' } : null),
      wsPromise.then(pool => pool ? { poolInfo: pool, source: 'websocket' } : null),
      timeoutPromise
    ]);
    
    // Close any active WebSocket connections
    wsConnections.forEach(ws => {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      } catch (e) {
        // Ignore close errors
      }
    });
    
    // Wait for token age check to complete
    const tokenAge = await tokenAgePromise;
    console.log(`Token age: ${tokenAge.ageInHours} hours, isNew: ${tokenAge.isNew}`);
    
    // If we found a pool and have a wallet, try to execute a swap
    if (result && result.poolInfo && wallet) {
      console.log(`Found pool for ${tokenMint} via ${result.source}, proceeding with swap execution`);
      
      try {
        // Get market info
        const marketInfo = await getSerumMarketInfo(
          result.poolInfo.market_id || result.poolInfo.marketId, 
          result.poolInfo.market_program_id || result.poolInfo.marketProgramId,
          connection
        );
        
        // Combine pool and market info
        const combinedInfo = combinePoolAndMarketInfo(result.poolInfo, marketInfo);
        
        // Execute quick buy
        const buyResult = await quickBuy(connection, wallet, tokenMint, combinedInfo);
        
        // Return result with full info
        return res.status(200).json({
          success: true,
          region,
          tokenMint,
          poolSource: result.source,
          tokenAge,
          transaction: buyResult.signature ? {
            signature: buyResult.signature,
            ata: buyResult.ata
          } : null,
          message: buyResult.signature 
            ? `Successfully executed swap for token ${tokenMint}` 
            : `Found pool but transaction failed: ${buyResult.error}`,
          executionTime: Date.now() - startTime
        });
      } catch (swapError) {
        console.error('Error executing swap:', swapError);
        
        // Return pool info but with transaction error
        return res.status(200).json({
          success: true, // We still found the pool
          region,
          tokenMint,
          poolSource: result.source,
          poolInfo: {
            pubkey: result.poolInfo.pubkey,
            baseMint: result.poolInfo.base_mint || result.poolInfo.baseMint,
            quoteMint: result.poolInfo.quote_mint || result.poolInfo.quoteMint
          },
          tokenAge,
          transactionError: swapError.message,
          message: `Found pool for token ${tokenMint} via ${result.source} but swap failed`,
          executionTime: Date.now() - startTime
        });
      }
    }
    // If we found a pool but don't have a wallet or swap failed, just return pool info
    else if (result && result.poolInfo) {
      return res.status(200).json({
        success: true,
        region,
        tokenMint,
        poolSource: result.source,
        poolInfo: {
          pubkey: result.poolInfo.pubkey,
          baseMint: result.poolInfo.base_mint || result.poolInfo.baseMint,
          quoteMint: result.poolInfo.quote_mint || result.poolInfo.quoteMint
        },
        tokenAge,
        message: wallet ? `Pool found for token ${tokenMint} via ${result.source}` : 
                        `Pool found but wallet not available for swap`,
        executionTime: Date.now() - startTime
      });
    } 
    // Handle timeout cases
    else if (result && result.timeout) {
      if (tokenAge && tokenAge.isNew) {
        // No pool, but token is new
        return res.status(200).json({
          success: false,
          region,
          tokenMint,
          tokenAge,
          message: `Token is new (${tokenAge.ageInHours.toFixed(2)} hours old), waiting for liquidity pool to be created`,
          executionTime: Date.now() - startTime
        });
      } else {
        // No pool and token is not new - likely not a Raydium pool token
        return res.status(200).json({
          success: false,
          region,
          tokenMint,
          tokenAge,
          message: 'No Raydium pool found for this token. It may not be a Raydium pool token.',
          executionTime: Date.now() - startTime
        });
      }
    } else {
      // Should not reach here, but just in case
      return res.status(200).json({
        success: false,
        region,
        tokenMint,
        message: 'No pool found but search completed',
        executionTime: Date.now() - startTime
      });
    }
    
  } catch (error) {
    console.error('Function error:', error);
    return res.status(200).json({
      success: false,
      region: process.env.FUNCTION_REGION || 'unknown',
      error: error.message || 'Unknown error',
      executionTime: Date.now() - startTime
    });
  }
});

// GraphQL pool search - make initial call with 2 retries
async function findPoolViaGraphQL(tokenMint) {
  console.log('Starting GraphQL pool search');
  
  const maxRetries = 2; // Initial call + 2 retries = 3 total attempts
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Shyft API GraphQL endpoint
      const endpoint = 'https://api.shyft.to/sol/v1/graphql';
      
      // GraphQL query to find Raydium pools
      const query = `
        query GetRaydiumPool {
          raydium_amm_pool(
            where: {
              _or: [
                {base_mint: {_eq: "${tokenMint}"}},
                {quote_mint: {_eq: "${tokenMint}"}}
              ]
            }
          ) {
            pubkey
            open_orders
            target_orders
            base_vault
            quote_vault
            market_id
            market_program_id
            base_mint
            quote_mint
          }
        }
      `;
      
      console.log(`GraphQL attempt ${attempt + 1}/${maxRetries + 1}`);
      
      const response = await axios.post(endpoint, { query }, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.SHYFT_API_KEY || ''
        },
        timeout: 2000 // 2 second timeout
      });
      
      const pools = response.data?.data?.raydium_amm_pool;
      
      if (pools && pools.length > 0) {
        console.log(`Found pool via GraphQL on attempt ${attempt + 1}:`, pools[0].pubkey);
        return pools[0];
      }
      
      // If no pool found and we have retries left, wait before trying again
      if (attempt < maxRetries) {
        await setTimeout(500); // 500ms delay between attempts
      }
    } catch (error) {
      console.error(`GraphQL error on attempt ${attempt + 1}:`, error.message);
      
      // If not the last retry, continue to next attempt
      if (attempt < maxRetries) {
        await setTimeout(500);
      }
    }
  }
  
  console.log('No pools found via GraphQL after retries');
  return null;
}

// WebSocket pool search implementation
async function findPoolViaWebSocket(tokenMint, wsConnections) {
  return new Promise(resolve => {
    console.log('Starting WebSocket pool search');
    
    // We need lowercase for comparison
    const targetTokenLower = tokenMint.toLowerCase();
    
    // Create WebSocket connection
    const wsEndpoint = `wss://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
    const ws = new WebSocket(wsEndpoint);
    wsConnections.push(ws);
    
    // Keep track if we found a match
    let poolFound = false;
    
    // Set timeout to ensure WebSocket doesn't hang indefinitely
    const wsTimeout = setTimeout(() => {
      if (!poolFound) {
        console.log('WebSocket search timeout after 5s');
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
        resolve(null);
      }
    }, 5000);
    
    ws.on('open', () => {
      console.log('WebSocket connected');
      
      // Subscribe to Raydium program
      const subscriptionId = Math.floor(Math.random() * 1000000);
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        id: subscriptionId,
        method: 'programSubscribe',
        params: [
          RAYDIUM_PROGRAM_ID,
          { encoding: 'base64', commitment: 'processed' }
        ]
      }));
      
      console.log('Subscribed to Raydium program');
    });
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        
        // Skip subscription confirmation
        if (message.result) return;
        
        // Process program notifications
        if (message.method === 'programNotification') {
          handleProgramNotification(message.params, targetTokenLower, (poolInfo) => {
            if (!poolFound) {
              poolFound = true;
              clearTimeout(wsTimeout);
              console.log('Found pool via WebSocket:', poolInfo.pubkey);
              
              if (ws.readyState === WebSocket.OPEN) {
                ws.close();
              }
              
              resolve(poolInfo);
            }
          });
        }
      } catch (error) {
        console.error('WebSocket message parse error:', error.message);
      }
    });
    
    ws.on('error', (error) => {
      console.error('WebSocket error:', error.message);
      if (!poolFound) {
        resolve(null);
      }
    });
    
    ws.on('close', () => {
      console.log('WebSocket closed');
      clearTimeout(wsTimeout);
      if (!poolFound) {
        resolve(null);
      }
    });
  });
}

// Process program notification from WebSocket
function handleProgramNotification(params, targetTokenLower, callback) {
  if (!params?.result?.value?.account?.data?.[0]) return;
  
  try {
    const { pubkey, account } = params.result.value;
    const accountData = account.data[0];
    
    // Skip accounts that are too small to be AMM accounts
    if (accountData.length < MIN_AMM_DATA_SIZE) return;
    
    // Decode account data
    // In a real implementation, we would decode the account data properly
    // using the library functions, but for the cloud function we'll use
    // this simplified approach
    
    // Decode base64 data
    const buffer = Buffer.from(accountData, 'base64');
    
    // Skip if not enough data
    if (buffer.length < 300) return;
    
    // Extract potential mint addresses (this is simplified - real implementation would use proper decoder)
    // In real implementation, we would use the decodeAmmMints function
    
    // This is just a placeholder - real implementation would properly extract mints
    const potentialMints = [];
    for (let i = 0; i < buffer.length - 32; i++) {
      const slice = buffer.slice(i, i + 32);
      try {
        const pubkey = new PublicKey(slice);
        potentialMints.push(pubkey.toString().toLowerCase());
      } catch (e) {
        // Not a valid pubkey, continue
      }
    }
    
    // Check if any of the mints match our target
    const matchingMint = potentialMints.find(mint => mint === targetTokenLower);
    
    if (matchingMint) {
      // In a real implementation, we would decode the full account data
      // and return proper pool info. For the cloud function, we return
      // simplified data.
      callback({
        pubkey,
        baseMint: matchingMint,
        quoteMint: potentialMints[0] !== matchingMint ? potentialMints[0] : potentialMints[1],
        source: 'websocket'
      });
    }
  } catch (error) {
    console.error('Error processing account data:', error.message);
  }
}

// Get market accounts from a Serum market
async function getSerumMarketInfo(marketId, marketProgramId, connection) {
  try {
    console.log(`Getting market info for ${marketId} using program ${marketProgramId}`);
    
    // Get the market account data
    const marketAccount = await connection.getAccountInfo(new PublicKey(marketId));
    if (!marketAccount) {
      throw new Error('Market account not found');
    }
    
    // This is a simplified implementation compared to the actual decoder
    // In a real implementation, we would properly decode the market account data
    const data = marketAccount.data;
    
    // Derive vault signer
    const seeds = [new PublicKey(marketId).toBuffer()];
    let vaultSigner;
    
    try {
      [vaultSigner] = PublicKey.findProgramAddressSync(
        seeds,
        new PublicKey(marketProgramId)
      );
    } catch (error) {
      throw new Error(`Failed to derive vault signer: ${error.message}`);
    }
    
    // Extract accounts from specific buffer positions
    // This is a simplified version - the real implementation would properly decode these
    return {
      serumProgramId: new PublicKey(marketProgramId),
      serumMarket: new PublicKey(marketId),
      serumBids: new PublicKey(data.slice(40, 72)),
      serumAsks: new PublicKey(data.slice(72, 104)),
      serumEventQueue: new PublicKey(data.slice(104, 136)),
      serumCoinVault: new PublicKey(data.slice(136, 168)),
      serumPcVault: new PublicKey(data.slice(168, 200)),
      serumVaultSigner: vaultSigner
    };
  } catch (error) {
    throw new Error(`Failed to get Serum market info: ${error.message}`);
  }
}

// Combine pool and market info
function combinePoolAndMarketInfo(pool, serumInfo) {
  return {
    ammMarket: new PublicKey(pool.pubkey),
    ammAuthority: STATIC_AMM_AUTHORITY,
    ammOpenOrders: new PublicKey(pool.open_orders || pool.openOrders),
    ammTargetOrders: new PublicKey(pool.target_orders || pool.targetOrders),
    poolCoinTokenAccount: new PublicKey(pool.base_vault || pool.baseVault),
    poolPcTokenAccount: new PublicKey(pool.quote_vault || pool.quoteVault),
    ...serumInfo
  };
}

// Check token age
async function checkTokenAge(tokenMint) {
  try {
    // Get token metadata
    const metadataUrl = `https://api.shyft.to/sol/v1/token/get_metadata?network=mainnet-beta&token_address=${tokenMint}`;
    const response = await axios.get(metadataUrl, {
      headers: { 'x-api-key': process.env.SHYFT_API_KEY || '' },
      timeout: 2000 // 2 second timeout
    });
    
    // Get token creation transaction
    const createTx = response.data?.result?.first_mint_transaction;
    if (createTx) {
      // Get transaction details
      const txUrl = `https://api.shyft.to/sol/v1/transaction/parsed_transaction?network=mainnet-beta&tx_hash=${createTx}`;
      const txResponse = await axios.get(txUrl, {
        headers: { 'x-api-key': process.env.SHYFT_API_KEY || '' },
        timeout: 2000 // 2 second timeout
      });
      
      const timestamp = txResponse.data?.result?.timestamp;
      if (timestamp) {
        const createTime = new Date(timestamp * 1000);
        const now = new Date();
        const ageInHours = (now - createTime) / (1000 * 60 * 60);
        
        return {
          createTime: createTime.toISOString(),
          ageInHours,
          isNew: ageInHours < 24
        };
      }
    }
    
    return { isNew: false, ageInHours: 999999 };
  } catch (error) {
    console.error('Error checking token age:', error.message);
    return { isNew: false, ageInHours: 999999 };
  }
}

// For Google Cloud Function healthcheck - explicitly listen on the PORT env var
// Parse port as an integer to ensure proper binding
const port = parseInt(process.env.PORT) || 8080;
console.log(`Listening on port ${port} for health checks`);
functions.start({
  port
});
