#!/usr/bin/env node
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env.cloud
dotenv.config({ path: '.env.cloud' });

const execAsync = promisify(exec);

const REGIONS = [
  'asia-northeast1',  // Tokyo
  'europe-west3',     // Frankfurt
  'us-east1'         // Virginia
];

const PROJECT_ID = process.env.PROJECT_ID;
const MEMORY = process.env.FUNCTION_MEMORY_MB || '4096';
const TIMEOUT = process.env.FUNCTION_TIMEOUT || '540';
const CPU = process.env.FUNCTION_CPU || '2';
const CONCURRENCY = process.env.FUNCTION_CONCURRENCY || '100';

async function deploy() {
  try {
    console.log('Using JavaScript function...');

    // Deploy to each region
    for (const region of REGIONS) {
      console.log(`\nDeploying to ${region}...`);
      
      const functionName = `quick-buy-${region}`;
      
      const command = [
        'gcloud functions deploy',
        functionName,
        `--gen2`,
        `--runtime=nodejs20`,
        `--region=${region}`,
        `--source=.`,
        `--entry-point=quickBuyFunction`,
        `--trigger-http`,
        `--allow-unauthenticated`,
        `--memory=${MEMORY}MB`,
        `--timeout=${TIMEOUT}s`,
        `--min-instances=0`,
        `--max-instances=${CONCURRENCY}`,
        `--cpu=${CPU}`,
        `--env-vars-file=.env.cloud`,
        `--project=${PROJECT_ID}`
      ].join(' ');

      try {
        const { stdout, stderr } = await execAsync(command);
        console.log(`Deployed to ${region}:`);
        console.log(stdout);
        if (stderr) console.error(stderr);
        
        // Extract the URL of the deployed function
        const url = stdout.match(/https:\/\/[^\s]+/);
        if (url) {
          console.log(`Function URL: ${url[0]}`);
          
          // Store URL in URLs.js file for reference
          await fs.appendFile('URLs.js', `// ${region} function URL: ${url[0]}\n`);
        }
      } catch (error) {
        console.error(`Failed to deploy to ${region}:`, error);
        console.error('Continuing with next region...');
      }
    }

    console.log('\nDeployment complete!');
    console.log('Function URLs saved to URLs.js');
    
  } catch (error) {
    console.error('Deployment failed:', error);
    process.exit(1);
  }
}

deploy();
