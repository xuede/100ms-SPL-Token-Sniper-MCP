// Mock implementation of status tool for demo purposes

// Define local interface to match expected MCP response structure
interface McpToolResponse {
  content: Array<{
    type: string;
    text: string;
  }>;
  isError?: boolean;
}

export async function mockStatus(): Promise<McpToolResponse> {
  // Simulate some connection information
  const connectionStatus = {
    websocket: 'Connected',
    graphql: 'Connected',
    regions: {
      us: 'Online',
      asia: 'Online',
      europe: 'Online'
    },
    latency: {
      us: `${Math.floor(Math.random() * 40) + 100}ms`,
      asia: `${Math.floor(Math.random() * 60) + 140}ms`,
      europe: `${Math.floor(Math.random() * 50) + 120}ms`
    },
    wallet: 'Connected'
  };

  // Mock wallet balance in SOL
  const walletBalance = (Math.random() * 2 + 0.5).toFixed(4);

  // Mock transaction count and performance
  const transactionCount = Math.floor(Math.random() * 5) + 2;
  const successfulTransactions = Math.floor(Math.random() * transactionCount) + 1;
  const fastestExecution = Math.floor(Math.random() * 200) + 300;

  // Mock some recent pools - using real-looking Solana addresses
  const recentPools = [
    {
      mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
      symbol: 'DEZX',
      timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString()
    },
    {
      mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      symbol: 'USDC',
      timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString()
    },
    {
      mint: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
      symbol: '7VFC',
      timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString()
    }
  ];

  // Construct a formatted status message with markdown for good formatting
  const statusText = `## 100ms Raydium Sniper Status

### Connection Status
- **WebSocket API**: ${connectionStatus.websocket} 
- **GraphQL API**: ${connectionStatus.graphql}
- **Wallet**: ${connectionStatus.wallet} (Balance: ${walletBalance} SOL)

### Region Status
| Region | Status | Latency |
|--------|--------|---------|
| US     | ${connectionStatus.regions.us} | ${connectionStatus.latency.us} |
| Asia   | ${connectionStatus.regions.asia} | ${connectionStatus.latency.asia} |
| Europe | ${connectionStatus.regions.europe} | ${connectionStatus.latency.europe} |

### Performance Metrics
- **Transactions Processed**: ${transactionCount}
- **Successful Transactions**: ${successfulTransactions}
- **Fastest Execution**: ${fastestExecution}ms

### Recent Pools Detected
${recentPools.map(pool => `- **${pool.symbol}** (${pool.mint.substring(0, 6)}...${pool.mint.substring(pool.mint.length - 4)}) - ${new Date(pool.timestamp).toLocaleTimeString()}`).join('\n')}

### Current Parameters
- **Default Slippage**: 1.0%
- **Default SOL Amount**: 0.05 SOL
- **Gas Priority**: High

The sniper is active and monitoring for new pools across all regions. To snipe a token, use the snipe_token tool with a valid token mint address.
`;

  // Log something to the console for demo purposes
  console.log('[MOCK] Status request processed');

  return {
    content: [
      {
        type: 'text',
        text: statusText
      }
    ]
  };
}
