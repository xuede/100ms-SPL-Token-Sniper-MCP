#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Get the root directory
const rootDir = path.join(__dirname, '..');

console.log('🔍 Installing MCP Inspector...');

try {
  // Check if git is installed
  try {
    execSync('git --version', { stdio: 'ignore' });
  } catch (error) {
    console.error('❌ Git is not installed. Please install Git and try again.');
    process.exit(1);
  }

  // Create inspector directory if it doesn't exist
  const inspectorDir = path.join(rootDir, 'inspector');
  if (!fs.existsSync(inspectorDir)) {
    fs.mkdirSync(inspectorDir, { recursive: true });
  }

  // Clone the inspector repository
  console.log('Cloning MCP Inspector repository...');
  execSync('git clone https://github.com/modelcontextprotocol/inspector.git inspector-temp', {
    cwd: rootDir,
    stdio: 'inherit'
  });

  // Move files from the cloned repository to the inspector directory
  const tempDir = path.join(rootDir, 'inspector-temp');
  const files = fs.readdirSync(tempDir);
  for (const file of files) {
    if (file !== '.git') {
      const srcPath = path.join(tempDir, file);
      const destPath = path.join(inspectorDir, file);
      
      if (fs.statSync(srcPath).isDirectory()) {
        if (!fs.existsSync(destPath)) {
          fs.mkdirSync(destPath, { recursive: true });
        }
        
        // Copy directory contents
        execSync(`cp -R "${srcPath}"/* "${destPath}"`, { stdio: 'ignore' });
      } else {
        // Copy file
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  // Remove the temporary directory
  fs.rmSync(tempDir, { recursive: true, force: true });

  // Install dependencies
  console.log('Installing Inspector dependencies...');
  execSync('pnpm install', {
    cwd: inspectorDir,
    stdio: 'inherit'
  });

  // Make the inspector executable
  const inspectorScript = path.join(inspectorDir, 'bin', 'mcp-inspector.js');
  if (fs.existsSync(inspectorScript)) {
    fs.chmodSync(inspectorScript, '755');
  }

  // Create a symlink to the inspector in the root directory
  const symlinkPath = path.join(rootDir, 'mcp-inspector');
  if (fs.existsSync(symlinkPath)) {
    fs.unlinkSync(symlinkPath);
  }
  fs.symlinkSync(inspectorScript, symlinkPath);

  // Add the inspector script to package.json
  const packageJsonPath = path.join(rootDir, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  if (!packageJson.scripts.inspector) {
    packageJson.scripts.inspector = './mcp-inspector';
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  }

  console.log('✅ MCP Inspector installed successfully!');
  console.log('\nYou can now run the inspector with:');
  console.log('  pnpm run inspector');
  console.log('\nTo test the MCP server with the inspector, run:');
  console.log('  pnpm start');
  console.log('  # In another terminal:');
  console.log('  pnpm run inspector');
} catch (error) {
  console.error('❌ Error installing MCP Inspector:', error.message);
  process.exit(1);
}
