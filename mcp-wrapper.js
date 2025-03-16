#!/usr/bin/env node
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Buffer to store incoming data
let stdinBuffer = '';
let stdoutBuffer = '';
let stderrBuffer = '';

// Spawn the MCP server process
const serverProcess = spawn('node', [join(__dirname, 'build', 'index.js')], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || 'production',
    DEBUG: process.env.DEBUG || 'mcp:*'
  }
});

// Handle stdin buffering
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  stdinBuffer += chunk;
  try {
    // Try to parse as JSON to ensure complete message
    JSON.parse(stdinBuffer);
    // If successful, send to server
    serverProcess.stdin.write(stdinBuffer);
    stdinBuffer = '';
  } catch (e) {
    // Not complete JSON yet, keep buffering
  }
});

// Handle stdout buffering
serverProcess.stdout.setEncoding('utf8');
serverProcess.stdout.on('data', (chunk) => {
  stdoutBuffer += chunk;
  try {
    // Try to parse as JSON to ensure complete message
    JSON.parse(stdoutBuffer);
    // If successful, write to stdout
    process.stdout.write(stdoutBuffer);
    stdoutBuffer = '';
  } catch (e) {
    // Not complete JSON yet, keep buffering
  }
});

// Handle stderr with proper error propagation
serverProcess.stderr.setEncoding('utf8');
serverProcess.stderr.on('data', (data) => {
  stderrBuffer += data;
  
  // Check for complete lines
  const lines = stderrBuffer.split('\n');
  if (lines.length > 1) {
    // Process all complete lines
    lines.slice(0, -1).forEach(line => {
      try {
        // Try to parse as JSON for structured logging
        const parsed = JSON.parse(line);
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          level: parsed.level || 'error',
          message: parsed.message || parsed,
          ...parsed
        }));
      } catch (e) {
        // Not JSON, log as plain text
        console.error(`[${new Date().toISOString()}] ${line}`);
      }
    });
    // Keep any incomplete line in buffer
    stderrBuffer = lines[lines.length - 1];
  }
});

// Handle server process errors
serverProcess.on('error', (error) => {
  console.error('Server process error:', error);
  process.exit(1);
});

// Handle server process exit
serverProcess.on('exit', (code, signal) => {
  if (signal) {
    console.error(`Server process terminated by signal: ${signal}`);
    process.exit(1);
  } else if (code !== 0) {
    console.error(`Server process exited with code: ${code}`);
    process.exit(code);
  } else {
    console.error('Server process exited normally');
    process.exit(0);
  }
});

// Handle parent process signals
process.on('SIGINT', () => {
  console.error('Received SIGINT, shutting down...');
  serverProcess.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.error('Received SIGTERM, shutting down...');
  serverProcess.kill('SIGTERM');
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  serverProcess.kill('SIGTERM');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  serverProcess.kill('SIGTERM');
  process.exit(1);
});
