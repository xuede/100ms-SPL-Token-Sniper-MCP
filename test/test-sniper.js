#!/usr/bin/env node

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import readline from 'readline';
import { fileURLToPath } from 'url';

// Get the root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// Optional environment variable to run the Snipe Token test without prompts.
// If SNIPER_TEST_TOKEN is set, its value will be used. If it is set but empty,
// DEFAULT_SNIPER_TEST_TOKEN will be used instead.
const DEFAULT_SNIPER_TEST_TOKEN = 'SOL';

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

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  underscore: '\x1b[4m',
  blink: '\x1b[5m',
  reverse: '\x1b[7m',
  hidden: '\x1b[8m',
  
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m'
};

// Test MCP server
async function testMcpServer() {
  console.log(`${colors.bright}${colors.cyan}🧪 Testing 100ms Sniper MCP Server${colors.reset}`);
  
  // Check if build exists
  const buildPath = path.join(rootDir, 'build', 'index.js');
  if (!fs.existsSync(buildPath)) {
    console.error(`${colors.red}❌ Build not found at ${buildPath}${colors.reset}`);
    console.error(`${colors.yellow}Please build the project first:${colors.reset}`);
    console.error(`  pnpm run build`);
    process.exit(1);
  }
  
  // Start MCP server
  console.log(`${colors.yellow}Starting MCP server...${colors.reset}`);
  const mcpServer = spawn('node', [buildPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: process.env
  });
  
  // Handle server output
  mcpServer.stderr.on('data', (data) => {
    const output = data.toString().trim();
    if (output.includes('running on stdio') || output.includes('100ms Sniper MCP server is running')) {
      console.log(`${colors.green}✅ MCP server started successfully${colors.reset}`);
      runTests(mcpServer);
    } else {
      console.log(`${colors.dim}[Server] ${output}${colors.reset}`);
    }
  });
  
  // Handle server errors
  mcpServer.on('error', (error) => {
    console.error(`${colors.red}❌ Failed to start MCP server: ${error.message}${colors.reset}`);
    process.exit(1);
  });
  
  // Handle server exit
  mcpServer.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error(`${colors.red}❌ MCP server exited with code ${code}${colors.reset}`);
    }
  });
}

// Run tests against the MCP server
async function runTests(mcpServer) {
  try {
    // Initialize MCP server
    await initializeMcp(mcpServer);
    
    // First, list available tools to verify connectivity
    const tools = await testListTools(mcpServer);
    console.log(`${colors.green}Found ${tools.length} available tools${colors.reset}`);
    
    // Test 1: Configure tool
    await testConfigureTool(mcpServer);
    
    // Test 2: Status tool
    await testStatusTool(mcpServer);
    
    // Test 3: Snipe token tool (optional)
    let runSnipeTest;
    if (process.env.SNIPER_TEST_TOKEN !== undefined) {
      runSnipeTest = 'y';
    } else {
      runSnipeTest = await prompt(`${colors.yellow}Do you want to test the snipe_token tool? (y/n) ${colors.reset}`);
    }
    if (runSnipeTest.toLowerCase() === 'y') {
      await testSnipeTokenTool(mcpServer);
    }
    
    // All tests passed
    console.log(`${colors.green}${colors.bright}✅ All tests passed!${colors.reset}`);
    
    // Clean up
    mcpServer.kill();
    rl.close();
  } catch (error) {
    console.error(`${colors.red}❌ Test failed: ${error.message}${colors.reset}`);
    mcpServer.kill();
    rl.close();
    process.exit(1);
  }
}

// Initialize MCP server
async function initializeMcp(mcpServer) {
  console.log(`\n${colors.cyan}Test: Initialize MCP Server${colors.reset}`);
  
  const request = {
    jsonrpc: '2.0',
    id: 0,
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
  
  const response = await sendRequest(mcpServer, request, 15000);
  
  if (!response.result) {
    throw new Error('Invalid response from initialize');
  }
  
  console.log(`${colors.green}✅ MCP server initialized successfully${colors.reset}`);
  
  return response.result;
}

// Test listing tools
async function testListTools(mcpServer) {
  console.log(`\n${colors.cyan}Test: List Tools${colors.reset}`);
  
  const request = {
    jsonrpc: '2.0',
    id: 1,
    method: 'listTools',
    params: {}
  };
  
  const response = await sendRequest(mcpServer, request, 15000); // Increase timeout to 15 seconds
  
  if (!response.result || !response.result.tools || !Array.isArray(response.result.tools)) {
    throw new Error('Invalid response from listTools');
  }
  
  const tools = response.result.tools;
  console.log(`${colors.green}✅ Found ${tools.length} tools:${colors.reset}`);
  
  for (const tool of tools) {
    console.log(`  - ${colors.bright}${tool.name}${colors.reset}: ${tool.description}`);
  }
  
  return tools;
}

// Test status tool
async function testStatusTool(mcpServer) {
  console.log(`\n${colors.cyan}Test: Status Tool${colors.reset}`);
  
  const request = {
    jsonrpc: '2.0',
    id: 2,
    method: 'callTool',
    params: {
      name: 'status',
      arguments: {}
    }
  };
  
  const response = await sendRequest(mcpServer, request, 15000); // Increase timeout to 15 seconds
  
  if (!response.result || !response.result.content || !Array.isArray(response.result.content)) {
    throw new Error('Invalid response from status tool');
  }
  
  console.log(`${colors.green}✅ Status tool returned:${colors.reset}`);
  console.log(response.result.content[0].text);
  
  return response.result;
}

// Test configure tool
async function testConfigureTool(mcpServer) {
  console.log(`\n${colors.cyan}Test: Configure Tool${colors.reset}`);
  
  const request = {
    jsonrpc: '2.0',
    id: 3,
    method: 'callTool',
    params: {
      name: 'configure',
      arguments: {
        slippage: 1.5,
        minProfit: 0.15,
        maxGas: 0.01,
        timeout: 300
      }
    }
  };
  
  const response = await sendRequest(mcpServer, request);
  
  if (!response.result || !response.result.content || !Array.isArray(response.result.content)) {
    throw new Error('Invalid response from configure tool');
  }
  
  console.log(`${colors.green}✅ Configure tool returned:${colors.reset}`);
  console.log(response.result.content[0].text);
  
  return response.result;
}

// Test snipe token tool
async function testSnipeTokenTool(mcpServer) {
  console.log(`\n${colors.cyan}Test: Snipe Token Tool${colors.reset}`);

  // Get token to snipe. When SNIPER_TEST_TOKEN is defined, skip the prompt and
  // use the variable's value or DEFAULT_SNIPER_TEST_TOKEN if empty.
  let token;
  if (process.env.SNIPER_TEST_TOKEN !== undefined) {
    token = process.env.SNIPER_TEST_TOKEN || DEFAULT_SNIPER_TEST_TOKEN;
    console.log(`${colors.dim}Using token from SNIPER_TEST_TOKEN: ${token}${colors.reset}`);
  } else {
    token = await prompt(`${colors.yellow}Enter token to snipe (address or symbol): ${colors.reset}`);
  }
  
  const request = {
    jsonrpc: '2.0',
    id: 4,
    method: 'callTool',
    params: {
      name: 'snipe_token',
      arguments: {
        token,
        slippage: 1.0
      }
    }
  };
  
  console.log(`${colors.yellow}Sniping token ${token}...${colors.reset}`);
  console.log(`${colors.yellow}This may take a few moments...${colors.reset}`);
  
  const response = await sendRequest(mcpServer, request, 30000); // 30 second timeout
  
  if (!response.result || !response.result.content || !Array.isArray(response.result.content)) {
    throw new Error('Invalid response from snipe_token tool');
  }
  
  console.log(`${colors.green}✅ Snipe token tool returned:${colors.reset}`);
  console.log(response.result.content[0].text);
  
  return response.result;
}

// Send request to MCP server
function sendRequest(mcpServer, request, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const requestStr = JSON.stringify(request) + '\n';
    
    // Set timeout
    const timeoutId = setTimeout(() => {
      reject(new Error(`Request timed out after ${timeout}ms`));
    }, timeout);
    
    // Handle response
    const onData = (data) => {
      try {
        const responseStr = data.toString().trim();
        console.log(`${colors.dim}[Raw Response] ${responseStr}${colors.reset}`);
        const response = JSON.parse(responseStr);
        
        if (response.id === request.id) {
          clearTimeout(timeoutId);
          mcpServer.stdout.removeListener('data', onData);
          
          if (response.error) {
            reject(new Error(`MCP error: ${JSON.stringify(response.error)}`));
          } else {
            resolve(response);
          }
        }
      } catch (error) {
        console.log(`${colors.dim}[Parse Error] ${error.message}${colors.reset}`);
        // Ignore parsing errors, might be partial data
      }
    };
    
    // Listen for response
    mcpServer.stdout.on('data', onData);
    
    // Log request
    console.log(`${colors.dim}[Request] ${requestStr.trim()}${colors.reset}`);
    
    // Send request
    mcpServer.stdin.write(requestStr);
  });
}

// Run the test
testMcpServer().catch((error) => {
  console.error(`${colors.red}❌ Test failed: ${error.message}${colors.reset}`);
  process.exit(1);
});
