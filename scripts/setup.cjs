#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

// Get the root directory
const rootDir = path.join(__dirname, '..');

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Prompt for input
function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function setup() {
  console.log('🚀 Setting up 100ms Sniper MCP...');
  
  try {
    // Install dependencies
    console.log('\n📦 Installing dependencies...');
    execSync('pnpm install', { cwd: rootDir, stdio: 'inherit' });
    
    // Check if .env file exists
    const envPath = path.join(rootDir, '.env');
    if (!fs.existsSync(envPath)) {
      console.log('\n🔑 Creating .env file...');
      
      // Get wallet private key
      const walletPrivateKey = await prompt('Enter your Solana wallet private key (base58 encoded): ');
      
      // Get Helius API key
      const heliusApiKey = await prompt('Enter your Helius API key: ');
      
      // Create .env file
      const envContent = `# Solana wallet private key (base58 encoded)
WALLET_PRIVATE_KEY=${walletPrivateKey}

# API Keys
HELIUS_API_KEY=${heliusApiKey}

# Region configuration
REGIONS=US,Asia,Europe

# Region endpoints (WebSocket)
US_ENDPOINT=wss://mainnet.helius-rpc.com/?api-key=${heliusApiKey}
ASIA_ENDPOINT=wss://solana-api.projectserum.com
EUROPE_ENDPOINT=wss://solana-mainnet.core.chainstack.com/YOUR_CHAINSTACK_KEY

# Default parameters
DEFAULT_SLIPPAGE_BPS=100
DEFAULT_MIN_PROFIT_SOL=0.1
DEFAULT_MAX_GAS_SOL=0.005
DEFAULT_TIMEOUT_MS=200

# Transaction settings
PRIORITY_FEE_MICROLAMPORTS=1000000
COMPUTE_UNITS=400000
`;
      
      fs.writeFileSync(envPath, envContent);
      console.log('✅ .env file created successfully!');
    }
    
    // Build the project
    console.log('\n🔨 Building the project...');
    execSync('pnpm run build', { cwd: rootDir, stdio: 'inherit' });
    
    // Get home directory
    const homeDir = process.env.HOME || process.env.USERPROFILE;

    // Determine platform-specific Claude Desktop config directory
    let claudeConfigDir;
    if (process.platform === 'darwin') {
      // macOS
      claudeConfigDir = path.join(homeDir, 'Library', 'Application Support', 'Claude');
    } else if (process.platform === 'win32') {
      // Windows
      claudeConfigDir = path.join(process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'), 'Claude');
    } else {
      // Linux or other
      claudeConfigDir = path.join(homeDir, '.config', 'Claude');
    }

    if (!fs.existsSync(claudeConfigDir)) {
      fs.mkdirSync(claudeConfigDir, { recursive: true });
    }

    // Path to Claude Desktop config file
    const claudeConfigPath = path.join(claudeConfigDir, 'claude_desktop_config.json');

    // Read existing config or create new one
    let claudeConfig = { mcpServers: {} };
    if (fs.existsSync(claudeConfigPath)) {
      try {
        claudeConfig = JSON.parse(fs.readFileSync(claudeConfigPath, 'utf8'));
        if (!claudeConfig.mcpServers) {
          claudeConfig.mcpServers = {};
        }
      } catch (error) {
        console.warn('Warning: Could not parse existing Claude Desktop config. Creating new one.');
      }
    }

    // Add our MCP server to the config
    claudeConfig.mcpServers['100ms-sniper'] = {
      command: 'node',
      args: [path.join(rootDir, 'mcp-wrapper.js')],
      env: {
        WALLET_PRIVATE_KEY: process.env.WALLET_PRIVATE_KEY || '',
        HELIUS_API_KEY: process.env.HELIUS_API_KEY || '',
        REGIONS: process.env.REGIONS || 'US,Asia,Europe',
        US_ENDPOINT: process.env.US_ENDPOINT || '',
        ASIA_ENDPOINT: process.env.ASIA_ENDPOINT || '',
        EUROPE_ENDPOINT: process.env.EUROPE_ENDPOINT || '',
        DEFAULT_SLIPPAGE_BPS: process.env.DEFAULT_SLIPPAGE_BPS || '100',
        DEFAULT_MIN_PROFIT_SOL: process.env.DEFAULT_MIN_PROFIT_SOL || '0.1',
        DEFAULT_MAX_GAS_SOL: process.env.DEFAULT_MAX_GAS_SOL || '0.005',
        DEFAULT_TIMEOUT_MS: process.env.DEFAULT_TIMEOUT_MS || '200',
        PRIORITY_FEE_MICROLAMPORTS: process.env.PRIORITY_FEE_MICROLAMPORTS || '1000000',
        COMPUTE_UNITS: process.env.COMPUTE_UNITS || '400000'
      },
      disabled: false,
      autoApprove: []
    };
    
    // Write config file
    fs.writeFileSync(claudeConfigPath, JSON.stringify(claudeConfig, null, 2));
    
    console.log('✅ Claude Desktop MCP settings created successfully!');
    
    console.log('\n🎉 Setup complete! You can now use the 100ms Sniper MCP with Claude Desktop.');
    console.log('\nTo start the MCP server manually, run:');
    console.log('  pnpm start');
    console.log('\nTo test the MCP server, run:');
    console.log('  pnpm test');
    console.log('\nTo launch Claude Desktop with the MCP server, run:');
    console.log('  pnpm run launch-claude');
  } catch (error) {
    console.error('❌ Error during setup:', error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Run setup
setup();