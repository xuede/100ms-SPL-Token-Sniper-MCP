#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// Read the URLs file generated during cloud deployment
async function updateEnvWithFunctionUrls() {
  try {
    // Check if URLs.js exists
    const urlsPath = path.join(rootDir, 'cloud', 'URLs.js');
    if (!fs.existsSync(urlsPath)) {
      console.error('URLs.js not found. Please run cloud deployment first.');
      process.exit(1);
    }

    // Read URLs.js
    const urlsContent = fs.readFileSync(urlsPath, 'utf8');
    
    // Extract URLs using regex
    const usUrlMatch = urlsContent.match(/us-east1[^\n]*function URL: (https:\/\/[^\n]+)/);
    const asiaUrlMatch = urlsContent.match(/asia-northeast1[^\n]*function URL: (https:\/\/[^\n]+)/);
    const europeUrlMatch = urlsContent.match(/europe-west3[^\n]*function URL: (https:\/\/[^\n]+)/);
    
    // Read current .env
    const envPath = path.join(rootDir, '.env');
    let envContent = fs.readFileSync(envPath, 'utf8');
    
    // Update URL values
    if (usUrlMatch && usUrlMatch[1]) {
      envContent = envContent.replace(/US_FUNCTION_URL=.*/g, `US_FUNCTION_URL=${usUrlMatch[1]}`);
    }
    
    if (asiaUrlMatch && asiaUrlMatch[1]) {
      envContent = envContent.replace(/ASIA_FUNCTION_URL=.*/g, `ASIA_FUNCTION_URL=${asiaUrlMatch[1]}`);
    }
    
    if (europeUrlMatch && europeUrlMatch[1]) {
      envContent = envContent.replace(/EUROPE_FUNCTION_URL=.*/g, `EUROPE_FUNCTION_URL=${europeUrlMatch[1]}`);
    }
    
    // Write updated .env
    fs.writeFileSync(envPath, envContent);
    
    console.log('✅ Updated .env with cloud function URLs');
    
    // Output the URLs that were found
    console.log('\nCloud Function URLs:');
    if (usUrlMatch && usUrlMatch[1]) console.log(`US: ${usUrlMatch[1]}`);
    if (asiaUrlMatch && asiaUrlMatch[1]) console.log(`Asia: ${asiaUrlMatch[1]}`);
    if (europeUrlMatch && europeUrlMatch[1]) console.log(`Europe: ${europeUrlMatch[1]}`);
    
  } catch (error) {
    console.error('Error updating .env file:', error);
    process.exit(1);
  }
}

// Run the update
updateEnvWithFunctionUrls();
