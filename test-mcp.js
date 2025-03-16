#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Get the root directory
const rootDir = path.join(__dirname);

// Check if build exists
const buildPath = path.join(rootDir, 'build', 'index.js');
if (!fs.existsSync(buildPath)) {
  console.error(`Build not found at ${buildPath}`);
  console.error(`Please build the project first:`);
  console.error(`  pnpm run build`);
  process.exit(1);
}

// Start MCP server
console.log(`Starting MCP server...`);
const mcpServer = spawn('node', [buildPath], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: process.env
});

// Handle server output
mcpServer.stdout.on('data', (data) => {
  const output = data.toString().trim();
  console.log(`[stdout] ${output}`);
  
  try {
    const response = JSON.parse(output);
    console.log('Parsed JSON response:', JSON.stringify(response, null, 2));
  } catch (error) {
    // Not JSON, just log the raw output
  }
});

mcpServer.stderr.on('data', (data) => {
  console.log(`[stderr] ${data.toString().trim()}`);
});

// Handle server errors
mcpServer.on('error', (error) => {
  console.error(`Failed to start MCP server: ${error.message}`);
  process.exit(1);
});

// Handle server exit
mcpServer.on('exit', (code) => {
  if (code !== null && code !== 0) {
    console.error(`MCP server exited with code ${code}`);
  }
});

// Send initialize message
setTimeout(() => {
  const initializeMessage = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'test-client',
        version: '1.0.0'
      }
    }
  };
  
  console.log('Sending initialize message...');
  mcpServer.stdin.write(JSON.stringify(initializeMessage) + '\n');
  
  // Send listTools message
  setTimeout(() => {
    const listToolsMessage = {
      jsonrpc: '2.0',
      id: 2,
      method: 'listTools',
      params: {}
    };
    
    console.log('Sending listTools message...');
    mcpServer.stdin.write(JSON.stringify(listToolsMessage) + '\n');
    
    // Exit after 5 seconds
    setTimeout(() => {
      console.log('Test complete, exiting...');
      mcpServer.kill();
      process.exit(0);
    }, 5000);
  }, 1000);
}, 1000);
