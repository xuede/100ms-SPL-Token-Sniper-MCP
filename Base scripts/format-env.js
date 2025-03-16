#!/usr/bin/env node
import fs from 'fs';

// Read the .env file
const envContent = fs.readFileSync('.env', 'utf8');

// List of required env vars for cloud functions
const CLOUD_VARS = [
  'WALLET_PRIVATE_KEY',
  'HELIUS_API_KEY',
  'PROJECT_ID'
];

// Parse the .env content
const envVars = {};
const cliVars = {};

envContent.split('\n').forEach(line => {
  if (line && !line.startsWith('#')) {
    const [key, ...valueParts] = line.split('=');
    if (key) {
      const trimmedKey = key.trim();
      const value = valueParts.join('=').trim();
      if (value) {
        if (CLOUD_VARS.includes(trimmedKey)) {
          envVars[trimmedKey] = value;
        } else if (trimmedKey === 'GCLOUD_TOKEN') {
          cliVars[trimmedKey] = value;
        }
      }
    }
  }
});

// Add function-specific variables
envVars['FUNCTION_DEBUG'] = 'true';
envVars['FUNCTION_MEMORY_MB'] = '4096';
envVars['FUNCTION_CPU'] = '2';
envVars['FUNCTION_TIMEOUT'] = '540';
envVars['FUNCTION_CONCURRENCY'] = '100';

// Convert to YAML format for cloud functions
const yamlContent = Object.entries(envVars)
  .map(([key, value]) => `${key}: "${value}"`)
  .join('\n');

// Write to .env.cloud
fs.writeFileSync('.env.cloud', yamlContent);

// Write CLI-specific vars back to .env if they changed
const cliContent = Object.entries(cliVars)
  .map(([key, value]) => `${key}=${value}`)
  .join('\n');

if (cliContent) {
  const currentEnv = envContent.split('\n')
    .filter(line => !line.startsWith('GCLOUD_TOKEN='))
    .join('\n');
  fs.writeFileSync('.env', `${currentEnv}\n${cliContent}`);
}

console.log('Created .env.cloud in YAML format with variables:');
console.log(Object.keys(envVars).join(', '));
console.log('\nCLI variables in .env:');
console.log(Object.keys(cliVars).join(', '));
