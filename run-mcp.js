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

// Create a pipe for stdin/stdout
const stdinPipe = fs.createReadStream(null, { fd: 0 });
const stdoutPipe = fs.createWriteStream(null, { fd: 1 });

// Create a child process for the MCP server
const mcpServer = spawn('node', [buildPath], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: process.env
});

// Pipe stdin/stdout
stdinPipe.pipe(mcpServer.stdin);

// Filter stdout to only allow JSON
mcpServer.stdout.on('data', (data) => {
  const lines = data.toString().split('\n');
  for (const line of lines) {
    if (!line) continue;
    
    try {
      // Try to parse as JSON
      JSON.parse(line);
      // If it's valid JSON, write to stdout
      stdoutPipe.write(line + '\n');
    } catch (error) {
      // If it's not valid JSON, write to stderr
      console.error(line);
    }
  }
});

// Pipe stderr
mcpServer.stderr.on('data', (data) => {
  console.error(data.toString());
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
  process.exit(code || 0);
});

// Handle process signals
process.on('SIGINT', () => {
  mcpServer.kill('SIGINT');
});

process.on('SIGTERM', () => {
  mcpServer.kill('SIGTERM');
});
