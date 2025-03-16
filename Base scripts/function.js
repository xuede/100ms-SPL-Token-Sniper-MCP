const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { PubSub } = require('@google-cloud/pubsub');
const functions = require('@google-cloud/functions-framework');
const bs58 = require('bs58');
const dotenv = require('dotenv');
const { getOrCreateATA } = require('./test-ata.js');
const { startWebSockets, setMatchingPoolCallback, closeAllConnections } = require('./test-ws-raw.js');
const { quickBuy } = require('./quick-buy.js');

dotenv.config();

const pubsub = new PubSub();
const TOPIC_NAME = 'quick-buy-results';

// Initialize Solana connection
const heliusEndpoint = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
const connection = new Connection(heliusEndpoint, {
  commitment: 'processed',
  confirmTransactionInitialTimeout: 10000
});

// Initialize wallet
const wallet = Keypair.fromSecretKey(bs58.decode(process.env.WALLET_PRIVATE_KEY));

// Enhanced logging with region and resource info
function enhancedLog(message, data = {}) {
  const logData = {
    region: process.env.FUNCTION_REGION || 'unknown',
    memory: process.env.FUNCTION_MEMORY_MB || 'unknown',
    cpu: process.env.FUNCTION_CPU || 'unknown',
    concurrency: process.env.FUNCTION_CONCURRENCY || 'unknown',
    timestamp: new Date().toISOString(),
    ...data
  };

  console.log(JSON.stringify({
    message,
    ...logData
  }));
}

// Performance monitoring
const metrics = {
  startTime: null,
  wsConnections: 0,
  decodeAttempts: 0,
  decodeSuccesses: 0,
  memoryUsage: () => process.memoryUsage(),
  cpuUsage: process.cpuUsage()
};

function updateMetrics(update) {
  Object.assign(metrics, update);
  if (process.env.FUNCTION_DEBUG === 'true') {
    enhancedLog('Metrics Update', metrics);
  }
}

// Register HTTP function
functions.http('quickBuyFunction', async (req, res) => {
  metrics.startTime = Date.now();
  updateMetrics({ wsConnections: 0, decodeAttempts: 0, decodeSuccesses: 0 });

  try {
    // Log environment variables (excluding sensitive data)
    enhancedLog('Environment check', {
      hasWallet: !!process.env.WALLET_PRIVATE_KEY,
      hasHeliusKey: !!process.env.HELIUS_API_KEY,
      region: process.env.FUNCTION_REGION,
      memory: process.env.FUNCTION_MEMORY_MB,
      cpu: process.env.FUNCTION_CPU
    });

    // Validate request
    if (!req.body || !req.body.tokenMint) {
      enhancedLog('Missing tokenMint in request body');
      res.status(400).json({
        success: false,
        error: 'Missing tokenMint in request body'
      });
      return;
    }

    const { tokenMint } = req.body;
    const region = process.env.FUNCTION_REGION || 'unknown';

    enhancedLog('Starting quick buy', { tokenMint });

    // Start websocket connections immediately
    let poolFound = false;
    let poolInfo = null;
    let poolSource = null;

    setMatchingPoolCallback((info) => {
      poolFound = true;
      poolInfo = info;
      poolSource = info.endpoint;
      enhancedLog('Pool found', { 
        poolInfo: info.pubkey,
        source: info.endpoint,
        timeTaken: Date.now() - metrics.startTime
      });
    });

    // Start websocket connections
    enhancedLog('Starting websocket connections');
    startWebSockets(tokenMint);

    try {
      // Execute quick buy (which handles parallel ATA creation and pool discovery)
      enhancedLog('Executing quick buy');
      const signature = await quickBuy(tokenMint);
      enhancedLog('Quick buy executed', { signature });

      // Log performance metrics
      const executionTime = Date.now() - metrics.startTime;
      const performanceData = {
        executionTime,
        wsConnections: metrics.wsConnections,
        decodeRate: metrics.decodeSuccesses / (executionTime / 1000),
        memory: metrics.memoryUsage(),
        cpu: metrics.cpuUsage,
        poolSource
      };

      enhancedLog('Quick buy successful', performanceData);

      // Publish result to PubSub
      const messageData = {
        region,
        tokenMint,
        signature,
        timestamp: Date.now(),
        performance: performanceData
      };

      await pubsub.topic(TOPIC_NAME).publish(Buffer.from(JSON.stringify(messageData)));

      res.status(200).json({
        success: true,
        region,
        signature,
        performance: performanceData
      });
    } catch (error) {
      enhancedLog(`Error in ${region}`, {
        error: error.message,
        metrics: {
          executionTime: Date.now() - metrics.startTime,
          wsConnections: metrics.wsConnections,
          decodeAttempts: metrics.decodeAttempts,
          decodeSuccesses: metrics.decodeSuccesses
        }
      });

      res.status(200).json({
        success: false,
        region,
        error: error.message,
        metrics: {
          executionTime: Date.now() - metrics.startTime,
          wsConnections: metrics.wsConnections,
          decodeAttempts: metrics.decodeAttempts,
          decodeSuccesses: metrics.decodeSuccesses
        }
      });
    }
  } catch (error) {
    enhancedLog('Unexpected error', { error: error.message });
    res.status(200).json({
      success: false,
      error: `Unexpected error: ${error.message}`,
      metrics: {
        executionTime: Date.now() - metrics.startTime,
        wsConnections: metrics.wsConnections,
        decodeAttempts: metrics.decodeAttempts,
        decodeSuccesses: metrics.decodeSuccesses
      }
    });
  } finally {
    closeAllConnections();
  }
});

// Export metrics for testing
module.exports = { metrics, updateMetrics };
