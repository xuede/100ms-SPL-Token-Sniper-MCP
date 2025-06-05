# Detailed Setup Guide - 100ms Raydium Sniper

This guide provides detailed, step-by-step instructions for setting up the 100ms Raydium Sniper MCP tool from scratch.

## Initial Setup

### 1. Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: Version 18+ (20+ recommended)
  ```bash
  # Check your Node.js version
  node -v
  ```

- **pnpm**: Preferred package manager
  ```bash
  # Install pnpm if needed
  npm install -g pnpm
  ```

- **Claude Desktop App**: Download from [https://claude.ai/desktop](https://claude.ai/desktop)

- **Google Cloud CLI**: (For cloud deployment only)
  Download from [https://cloud.google.com/sdk/docs/install](https://cloud.google.com/sdk/docs/install)

### 2. API Keys

You'll need to obtain the following API keys:

- **Infura Project ID**:
  1. Go to [https://infura.io/](https://infura.io/)
  2. Sign up for an account
  3. Create a new Solana project and note the Project ID

- **Helius API Key**:
  1. Go to [https://dev.helius.xyz/](https://dev.helius.xyz/)
  2. Sign up for an account
  3. Create a new API key from the dashboard

- **Shyft API Key**:
  1. Go to [https://shyft.to/](https://shyft.to/)
  2. Create an account
  3. Generate an API key from the dashboard

### 3. Solana Wallet Setup

You'll need a Solana wallet with SOL for transactions:

1. **Create a wallet**: You can use Phantom, Solflare, or any other Solana wallet
2. **Fund your wallet**: Add some SOL for transaction fees and sniping
3. **Export private key**: 
   - In most wallets, navigate to Settings > Export Private Key
   - The key will be used in the environment setup

## Local Environment Setup

### 1. Clone the Repository

```bash
git clone https://github.com/yourname/100ms-sniper-mcp.git
cd 100ms-sniper-mcp
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Environment Configuration

1. **Create local environment file**:
   ```bash
   cp .env.example .env
   ```

2. **Edit the `.env` file with your values**:
   ```
    # Primary RPC (Infura)
    RPC_ENDPOINT=https://solana-mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID
    HELIUS_WS_ENDPOINT=wss://rpc.helius.xyz/?api-key=YOUR_HELIUS_API_KEY

   # WebSocket (Shyft)
   SHYFT_WS_ENDPOINT=wss://rpc.shyft.to?api_key=YOUR_SHYFT_API_KEY

    # API Keys
    HELIUS_API_KEY=YOUR_HELIUS_API_KEY
    SHYFT_API_KEY=YOUR_SHYFT_API_KEY

   # Wallet Configuration
   WALLET_PRIVATE_KEY=YOUR_WALLET_PRIVATE_KEY
   ```

### 4. Build the Project

```bash
pnpm run build
```

### 5. Configure Claude Desktop

The simplest way to configure Claude Desktop is to use our automated script:

```bash
pnpm run launch-claude
```

This will:
1. Check for Claude Desktop installation
2. Add the 100ms Sniper MCP to Claude's configuration
3. Launch Claude Desktop with the MCP enabled

### 6. Verify Installation

1. Open a conversation with Claude
2. Ask: "What's the status of the Raydium sniper?"
3. Claude should respond with information about the sniper's status

## Demo Mode Setup

For demonstrations or testing without real transactions:

```bash
# Build and launch the demo mode
pnpm run setup-demo
```

This will:
1. Build the project
2. Configure Claude Desktop with the mock server
3. Launch Claude with simulated responses

## Cloud Function Deployment

For high-performance, multi-region sniping:

### 1. Google Cloud Project Setup

1. Create a new Google Cloud project at [https://console.cloud.google.com/](https://console.cloud.google.com/)
2. Enable billing for the project
3. Note your Project ID for configuration

### 2. Cloud Configuration

1. **Create cloud environment file**:
   ```bash
   cp cloud/.env.cloud.example cloud/.env.cloud
   ```

2. **Edit the `cloud/.env.cloud` file**:
   ```
   # API Keys
   HELIUS_API_KEY: YOUR_HELIUS_API_KEY
   SHYFT_API_KEY: YOUR_SHYFT_API_KEY

   # Wallet Private Key
   WALLET_PRIVATE_KEY: YOUR_WALLET_PRIVATE_KEY

   # Project Configuration
   PROJECT_ID: YOUR_GCP_PROJECT_ID

   # Function Settings
   FUNCTION_DEBUG: 'true'
   FUNCTION_MEMORY_MB: '4096'
   FUNCTION_CPU: '2'
   FUNCTION_TIMEOUT: '540'
   FUNCTION_CONCURRENCY: '100'
   ```

### 3. Cloud Setup

```bash
pnpm run cloud:setup
```

This script:
- Enables required Google Cloud APIs
- Creates service accounts with necessary permissions
- Sets up PubSub topics and subscriptions

### 4. Deploy Cloud Functions

```bash
# Build cloud functions
pnpm run cloud:build

# Deploy to all regions
pnpm run cloud:deploy
```

### 5. Update Environment with Function URLs

After deployment, copy the URLs from the deployment output:

```
US Function URL: https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/quick-buy-us-central1
Asia Function URL: https://asia-east1-YOUR_PROJECT_ID.cloudfunctions.net/quick-buy-asia-east1
Europe Function URL: https://europe-west1-YOUR_PROJECT_ID.cloudfunctions.net/quick-buy-europe-west1
```

Add these to your `.env` file:

```
US_FUNCTION_URL=https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/quick-buy-us-central1
ASIA_FUNCTION_URL=https://asia-east1-YOUR_PROJECT_ID.cloudfunctions.net/quick-buy-asia-east1
EUROPE_FUNCTION_URL=https://europe-west1-YOUR_PROJECT_ID.cloudfunctions.net/quick-buy-europe-west1
```

## Troubleshooting

### Claude Integration Issues

1. **Claude doesn't recognize the MCP**:
   - Ensure Claude Desktop is installed and running
   - Check `~/Library/Application Support/Claude/claude_desktop_config.json` for the MCP configuration
   - Try running `pnpm run launch-claude` again

2. **MCP errors in Claude**:
   - Check your `.env` file for correct API keys
   - Ensure your wallet has SOL for transactions
   - Run `pnpm run build` to make sure the latest code is compiled

### Cloud Function Deployment Issues

1. **Container Healthcheck Failures**:
   - Check the cloud function logs in Google Cloud Console
   - Ensure the function is properly listening on the PORT environment variable
   - Increase the Cloud Run startup time in the Google Cloud Console

2. **Authorization Issues**:
   - Ensure the service account has the correct roles
   - Check that you've authorized the gcloud CLI:
     ```bash
     gcloud auth login
     gcloud config set project YOUR_PROJECT_ID
     ```

### API Connection Issues

1. **Helius or Shyft API errors**:
   - Verify your API keys are still valid
   - Check usage limits on your accounts
   - Try new API keys if needed

## Next Steps

Once your setup is complete, see the [README.md](./README.md) for:

- General usage instructions
- Architecture overview
- Advanced configuration options
