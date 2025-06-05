#!/usr/bin/env node

import { execSync, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

// Get the root directory
const rootDir = path.join(__dirname, '..');

// Path to Claude Desktop app
import os from 'os';

const claudeAppPath = os.platform() === 'win32'
  ? path.join(process.env.LOCALAPPDATA || '', 'AnthropicClaude', 'claude.exe')
  : '/Applications/Claude.app';

// Check if Claude Desktop is installed
if (!fs.existsSync(claudeAppPath)) {
  console.error('❌ Claude Desktop not found at', claudeAppPath);
  console.error('Please install Claude Desktop from https://claude.ai/desktop');
  process.exit(1);
}

// Get home directory
const homeDir = process.env.HOME || process.env.USERPROFILE;

// Path to Claude Desktop config file
const claudeConfigPath = os.platform() === 'win32'
  ? path.join(homeDir, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json')
  : path.join(homeDir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');

// Check if MCP settings exist
if (!fs.existsSync(claudeConfigPath)) {
  console.error('❌ Claude Desktop config not found at', claudeConfigPath);
  console.error('Please run the setup script first:');
  console.error('  pnpm run setup');
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

// Check if our MCP server is configured
if (!claudeConfig.mcpServers || !claudeConfig.mcpServers['100ms-sniper']) {
  console.error('❌ 100ms Sniper MCP not found in Claude Desktop config');
  console.error('Please run the setup script first:');
  console.error('  pnpm run setup');
  process.exit(1);
}

// Make sure our MCP server is enabled
if (claudeConfig.mcpServers['100ms-sniper'].disabled) {
  console.log('🔄 Enabling 100ms Sniper MCP in Claude Desktop config...');
  claudeConfig.mcpServers['100ms-sniper'].disabled = false;
  fs.writeFileSync(claudeConfigPath, JSON.stringify(claudeConfig, null, 2));
}

// Update environment variables in the config
console.log('🔄 Updating environment variables in Claude Desktop config...');
claudeConfig.mcpServers['100ms-sniper'].env = {
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
};

// Update the path to the MCP server
claudeConfig.mcpServers['100ms-sniper'].args = [path.join(rootDir, 'mcp-wrapper.js')];

// Write updated config
fs.writeFileSync(claudeConfigPath, JSON.stringify(claudeConfig, null, 2));

// Launch Claude Desktop
console.log('🚀 Launching Claude Desktop...');
try {
// Check if Claude is already running
try {
  if (os.platform() === 'win32') {
    // Windows: use tasklist and taskkill
    execSync('tasklist /FI "IMAGENAME eq claude.exe" /NH');
    console.log('Claude Desktop is already running. Restarting...');
    execSync('taskkill /IM claude.exe /F');
    // Wait a moment for the app to close
    execSync('timeout /T 1 /NOBREAK');
  } else {
    execSync('pgrep -f "Claude.app"');
    console.log('Claude Desktop is already running. Restarting...');
    execSync('pkill -f "Claude.app"');
    // Wait a moment for the app to close
    execSync('sleep 1');
  }
} catch (error) {
  // Claude is not running, which is fine
}

// Launch Claude
if (os.platform() === 'win32') {
  spawn(claudeAppPath, [], { detached: true, stdio: 'ignore' }).unref();
} else {
  spawn('open', [claudeAppPath], { detached: true });
}

console.log('✅ Claude Desktop launched successfully!');
  console.log('\nYou can now use the 100ms Sniper MCP with Claude Desktop.');
  console.log('Try asking Claude to:');
  console.log('  - "Show me the status of my sniper bot"');
  console.log('  - "Configure my sniper bot with 2% slippage and 0.2 SOL minimum profit"');
  console.log('  - "Snipe token XYZ with 1% slippage in the US region"');
} catch (error) {
  console.error('❌ Error launching Claude Desktop:', error.message);
  process.exit(1);
}
