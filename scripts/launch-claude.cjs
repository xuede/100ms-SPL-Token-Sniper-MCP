#!/usr/bin/env node

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Get the root directory
const rootDir = path.join(__dirname, '..');
const windowsConfigPath = "C:\\Users\\mdub\\AppData\\Roaming\\Claude\\claude_desktop_config.json";

// Path to Claude Desktop app
const claudeAppPath = "C:\\Users\\mdub\\AppData\\Local\\AnthropicClaude\\claude.exe";

// Check if Claude Desktop is installed
// if (!fs.existsSync(claudeAppPath)) {
//   console.error('❌ Claude Desktop not found at', claudeAppPath);
//   console.error('Please install Claude Desktop from https://claude.ai/desktop');
//   process.exit(1);
// }

// Get home directory
const homeDir = process.env.HOME || process.env.USERPROFILE;

// Path to Claude Desktop config file
const claudeConfigPath = "C:\\Users\\mdub\\AppData\\Roaming\\Claude\\claude_desktop_config.json";

// Check if MCP settings exist
if (!fs.existsSync(claudeConfigPath)) {
  console.error(' Claude Desktop config not found at', claudeConfigPath);
  console.error('Please run the setup script first:');
  console.error('  pnpm run setup');
  process.exit(1);
}

// Read config
let claudeConfig;
try {
  claudeConfig = JSON.parse(fs.readFileSync(claudeConfigPath, 'utf8'));
} catch (error) {
  console.error(' Error reading Claude Desktop config:', error.message);
  process.exit(1);
}

// Debug log the config
console.log('Loaded Claude Config:', JSON.stringify(claudeConfig, null, 2));

// Check if our MCP server is configured
if (!claudeConfig.mcpServers || !claudeConfig.mcpServers['spl-token-sniper']) {
  console.error(' SPL Token Sniper MCP not found in Claude Desktop config');
  console.error('Found MCP servers:', Object.keys(claudeConfig.mcpServers || {}));
  console.error('Please ensure you:');
  console.error('1. Ran the setup script (pnpm run setup)');
  console.error('2. Restarted Claude Desktop after setup');
  process.exit(1);
}
// Make sure our MCP server is enabled
if (claudeConfig.mcpServers['spl-token-sniper'].disabled) {
  console.log('🔄 Enabling SPL Token Sniper MCP in Claude Desktop config...');
  claudeConfig.mcpServers['spl-token-sniper'].disabled = false;
  fs.writeFileSync(claudeConfigPath, JSON.stringify(claudeConfig, null, 2));
}

// Update environment variables in the config
console.log('🔄 Updating environment variables in Claude Desktop config...');
claudeConfig.mcpServers['spl-token-sniper'].env = {
  WALLET_PRIVATE_KEY: process.env.WALLET_PRIVATE_KEY || '',
  HELIUS_API_KEY: process.env.HELIUS_API_KEY || '',
  REGIONS: process.env.REGIONS || 'US,Asia,Europe',
  US_ENDPOINT: process.env.US_ENDPOINT ? addProtocol(process.env.US_ENDPOINT) : 'https://api.100ms.live/us-sniper',
  ASIA_ENDPOINT: process.env.ASIA_ENDPOINT ? addProtocol(process.env.ASIA_ENDPOINT) : 'https://api.100ms.live/asia-sniper',
  EUROPE_ENDPOINT: process.env.EUROPE_ENDPOINT ? addProtocol(process.env.EUROPE_ENDPOINT) : 'https://api.100ms.live/eu-sniper',
  DEFAULT_SLIPPAGE_BPS: process.env.DEFAULT_SLIPPAGE_BPS || '100',
  DEFAULT_MIN_PROFIT_SOL: process.env.DEFAULT_MIN_PROFIT_SOL || '0.1',
  DEFAULT_MAX_GAS_SOL: process.env.DEFAULT_MAX_GAS_SOL || '0.005',
  DEFAULT_TIMEOUT_MS: process.env.DEFAULT_TIMEOUT_MS || '200',
  PRIORITY_FEE_MICROLAMPORTS: process.env.PRIORITY_FEE_MICROLAMPORTS || '1000000',
  COMPUTE_UNITS: process.env.COMPUTE_UNITS || '400000'
};

// Ensure MCP server configuration exists
if (!claudeConfig.mcpServers['spl-token-sniper']) {
  claudeConfig.mcpServers['spl-token-sniper'] = {};
}

// Initialize args array if missing
if (!Array.isArray(claudeConfig.mcpServers['spl-token-sniper'].args)) {
  claudeConfig.mcpServers['spl-token-sniper'].args = [];
}
// Ensure MCP server configuration exists
if (!claudeConfig.mcpServers['spl-token-sniper']) {
  claudeConfig.mcpServers['spl-token-sniper'] = { args: [] };
}

// Update the path to the MCP server (normalized for Windows)
claudeConfig.mcpServers['spl-token-sniper'].args = [
  path.win32.join(rootDir, 'mcp-wrapper.js')
];

// Write updated config
fs.writeFileSync(claudeConfigPath, JSON.stringify(claudeConfig, null, 2));

// Launch Claude Desktop
console.log('🚀 Launching Claude Desktop...');
try {
  // Check if Claude is already running
  try {
    // PowerShell process check
    execSync('powershell -Command "Get-Process claude -ErrorAction SilentlyContinue"');
    console.log('Claude Desktop is already running. Restarting...');
    execSync('powershell -Command "Stop-Process -Name claude -Force"');
    
    // Wait for process exit
    let attempts = 0;
    while (attempts++ < 5) {
      try {
        execSync('powershell -Command "Get-Process claude -ErrorAction Stop"');
        execSync('timeout 1');
      } catch {
        break;
      }
    }
  } catch (error) {
    // Process not running or other error - expected in normal flow
  }

  // Launch Claude with PowerShell
  const child = spawn('powershell', [
    '-Command',
    `$process = Get-Process claude -ErrorAction SilentlyContinue; ` +
    `if ($process) { Stop-Process -Id $process.Id -Force }; ` +
    `Start-Process -FilePath "${claudeAppPath}" -WorkingDirectory "${path.dirname(claudeAppPath)}"`
  ], {
    detached: true,
    shell: false,
    stdio: 'ignore'
  });

  child.on('error', (err) => {
    console.error('Failed to start Claude Desktop:', err.message);
    if (err.message.includes('ENOENT')) {
      console.error('Claude.exe not found at:', claudeAppPath);
    }
    process.exit(1);
  });

  child.on('exit', (code) => {
    if (code !== 0) {
      console.error(`Claude Desktop exited with code ${code}`);
      process.exit(1);
    }
  });
  child.unref();
  
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

  child.on('error', (err) => {
    console.error('Failed to start Claude Desktop:', err.message);
    if (err.message.includes('ENOENT')) {
      console.error('Claude.exe not found at:', claudeAppPath);
    }
    process.exit(1);
  });

  child.on('exit', (code) => {
    if (code !== 0) {
      console.error(`Claude Desktop exited with code ${code}`);
      process.exit(1);
    }
  });
  child.unref();
  
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
