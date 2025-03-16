#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Paths
const rootDir = path.resolve(__dirname, '..');
const baseScriptsDir = path.join(rootDir, 'Base scripts');
const cloudDir = path.join(rootDir, 'cloud');
const cloudLibDir = path.join(cloudDir, 'lib');

// Create cloud directory if it doesn't exist
if (!fs.existsSync(cloudDir)) {
  fs.mkdirSync(cloudDir);
  console.log('Created cloud directory');
}

// Create lib directory in cloud if it doesn't exist
if (!fs.existsSync(cloudLibDir)) {
  fs.mkdirSync(cloudLibDir);
  console.log('Created cloud/lib directory');
}

// Files to copy from Base scripts to cloud
const filesToCopy = [
  { src: 'function.js', dest: 'function.js' },
  { src: 'quick-buy.js', dest: 'quick-buy.js' },
  { src: 'shyft-market.js', dest: 'shyft-market.js' },
  { src: 'test-ata.js', dest: 'test-ata.js' },
  { src: 'test-ws-raw.js', dest: 'test-ws-raw.js' },
  { src: 'lib/amm-decoder.js', dest: 'lib/amm-decoder.js' },
  { src: 'lib/market-decoder.js', dest: 'lib/market-decoder.js' }
];

// Copy files
filesToCopy.forEach(({ src, dest }) => {
  const srcPath = path.join(baseScriptsDir, src);
  const destPath = path.join(cloudDir, dest);
  
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`Copied ${src} to ${dest}`);
  } else {
    console.error(`Source file not found: ${srcPath}`);
  }
});

// Copy package.json to cloud directory
const packageJson = JSON.parse(fs.readFileSync(path.join(baseScriptsDir, 'package.json'), 'utf8'));
fs.writeFileSync(path.join(cloudDir, 'package.json'), JSON.stringify(packageJson, null, 2));
console.log('Created cloud/package.json');

// Copy .env.cloud to cloud directory if it exists
const envCloudPath = path.join(rootDir, '.env.cloud');
if (fs.existsSync(envCloudPath)) {
  fs.copyFileSync(envCloudPath, path.join(cloudDir, '.env.cloud'));
  console.log('Copied .env.cloud to cloud directory');
} else {
  console.warn('.env.cloud not found. Run pnpm run format-env first.');
}

// Install dependencies in cloud directory
console.log('Installing dependencies in cloud directory...');
try {
  execSync('cd cloud && pnpm install', { stdio: 'inherit' });
  console.log('Dependencies installed successfully');
} catch (error) {
  console.error('Failed to install dependencies:', error.message);
}

console.log('Cloud directory prepared for deployment');
