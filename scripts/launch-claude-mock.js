#!/usr/bin/env node

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Get the root directory
const rootDir = path.join(__dirname, '..');

// Path to Claude Desktop app
const claudeAppPath = '/Applications/Claude.app';

// Check if Claude Desktop is installed
if (!fs.existsSync(claudeAppPath)) {
  console.error('❌ Claude Desktop not found at', claudeAppPath);
  console.error('Please install Claude Desktop from https://claude.ai/desktop');
  process.exit(1);
}

// Get home directory
const homeDir = process.env.HOME || process.env.USERPROFILE;

// Path to Claude Desktop config file
const claudeConfigPath = path.join(homeDir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');

// Check if MCP settings exist
if (!fs.existsSync(claudeConfigPath)) {
  console.error('❌ Claude Desktop config not found at', claudeConfigPath);
  console.error('Please make sure Claude Desktop is installed properly');
  process.exit(1);
}

// Read config
let claudeConfig;
try {
  claudeConfig = JSON.parse(fs.readFileSync(claudeConfigPath, 'utf8'));
} catch (error) {
  console.error('❌ Error reading Claude Desktop config:', error.message);
  process.exit(1);
}

// Define the MCP server key
const mcpServerKey = '100ms-sniper-mock';

// Create or update the mock MCP configuration
console.log('🔄 Configuring 100ms Sniper Mock MCP in Claude Desktop...');

// Check if we need to create a new entry
if (!claudeConfig.mcpServers) {
  claudeConfig.mcpServers = {};
}

// Get the path to the built mock file
const mockServerPath = path.join(rootDir, 'build', 'index.mock.js');

// First check if build directory and file exist
if (!fs.existsSync(mockServerPath)) {
  console.error('❌ Mock server not built yet. Please run:');
  console.error('  pnpm run build');
  console.error('And try again.');
  process.exit(1);
}

// Create or update the mock MCP server entry
claudeConfig.mcpServers[mcpServerKey] = {
  command: 'node',
  args: [mockServerPath],
  env: {},
  disabled: false,
  autoApprove: []
};

// Update environment variables in the config (minimal set for mock server)
console.log('🔄 Setting minimal environment variables for mock server...');
claudeConfig.mcpServers[mcpServerKey].env = {
  // No actual private keys or API keys needed for mock
  MOCK_MODE: 'true',
  DEFAULT_SLIPPAGE_BPS: process.env.DEFAULT_SLIPPAGE_BPS || '100',
  DEFAULT_AMOUNT_SOL: process.env.DEFAULT_AMOUNT_SOL || '0.05',
};

// Write updated config
fs.writeFileSync(claudeConfigPath, JSON.stringify(claudeConfig, null, 2));

// Launch Claude Desktop
console.log('🚀 Launching Claude Desktop with MOCK MCP server...');
try {
  // Check if Claude is already running
  try {
    execSync('pgrep -f "Claude.app"');
    console.log('Claude Desktop is already running. Restarting...');
    execSync('pkill -f "Claude.app"');
    // Wait a moment for the app to close
    execSync('sleep 1');
  } catch (error) {
    // Claude is not running, which is fine
  }
  
  // Launch Claude
  spawn('open', [claudeAppPath], { detached: true });
  
  console.log('✅ Claude Desktop launched successfully with MOCK MCP server!');
  console.log('\n🧪 You are running in MOCK DEMO mode - all transactions are simulated');
  console.log('\nYou can now use the 100ms Sniper Mock MCP with Claude Desktop for demos.');
  console.log('Try asking Claude to:');
  console.log('  - "Show me the status of my sniper bot"');
  console.log('  - "Snipe token DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263 with 1% slippage"');
  console.log('  - "Configure my sniper bot with 2% slippage"');
  
  console.log('\n⚠️ IMPORTANT: All results are simulated for demo purposes!');
} catch (error) {
  console.error('❌ Error launching Claude Desktop:', error.message);
  process.exit(1);
}
