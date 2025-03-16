# 100ms Raydium Sniper MCP

A high-performance tool for token sniping on Raydium DEX with multi-region support and Claude AI integration.

## Overview

The 100ms Raydium Sniper uses Model Context Protocol (MCP) to integrate with Claude AI, allowing natural language interaction for sniping tokens on the Raydium DEX on Solana. Key features include:

- **Multi-region execution**: Deploy cloud functions across US, Asia, and Europe for the fastest possible execution
- **WebSocket monitoring**: Real-time monitoring of new pool creation
- **GraphQL integration**: Fast pool discovery via indexed data
- **Claude AI integration**: Natural language instructions for token sniping
- **Fast execution**: Optimized transaction submission with 100ms target response time
- **Demo mode**: Test and showcase without real blockchain transactions

## Requirements

- Node.js 18+ (20+ recommended)
- pnpm
- Solana wallet with SOL
- Claude Desktop App
- Google Cloud account (for multi-region deployment)
- API keys:
  - Helius API key (https://helius.xyz)
  - Shyft API key (https://shyft.to)

## Quick Start

### Basic Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourname/100ms-sniper-mcp.git
   cd 100ms-sniper-mcp
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Create environment file**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your API keys and wallet private key.

4. **Build the project**
   ```bash
   pnpm run build
   ```

5. **Launch with Claude Desktop**
   ```bash
   pnpm run launch-claude
   ```

### Demo Mode

To try the tool in demo mode without real transactions:

```bash
pnpm run setup-demo
```

This builds the project and launches Claude Desktop with a mock server that simulates responses without requiring API keys or SOL in your wallet.

## Usage with Claude

Once Claude Desktop is launched with the MCP installed, you can use natural language to:

- **Check status**:
  "Show me the status of the Raydium sniper"

- **Snipe a token**:
  "Snipe token DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263 with 1% slippage"

- **Configure parameters**:
  "Configure my sniper with 2% slippage and 0.1 SOL per transaction"

## Cloud Deployment

For multi-region deployment:

1. **Set up cloud configuration**
   ```bash
   cp cloud/.env.cloud.example cloud/.env.cloud
   ```
   Edit `cloud/.env.cloud` with your API keys, project ID and wallet information.

2. **Run cloud setup**
   ```bash
   pnpm run cloud:setup
   ```

3. **Build and deploy cloud functions**
   ```bash
   pnpm run cloud:build
   pnpm run cloud:deploy
   ```

4. **Update your environment with function URLs**
   After deployment, copy the deployed function URLs to your `.env` file.

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

## Architecture

The architecture consists of several components:

- **MCP Server**: Communicates with Claude AI
- **Cloud Functions**: Multi-region execution points that run on Google Cloud Functions
- **Region Manager**: Manages connections to different geographical regions
- **WebSocket Manager**: Handles real-time Solana program subscription
- **AMM Manager**: Interacts with Raydium AMM protocol

## Troubleshooting

- **"No pools found" error**: Ensure the token mint address is correct and has liquidity on Raydium
- **Slow performance**: Check that your API keys are valid and have sufficient rate limits
- **Deployment failures**: See [DEPLOYMENT.md](./DEPLOYMENT.md) for specific deployment troubleshooting steps
- **Claude integration issues**: Ensure Claude Desktop is properly installed and the MCP is correctly configured

## License

MIT License - See [LICENSE](./LICENSE) for details.
