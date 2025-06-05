#!/usr/bin/env node

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const execAsync = promisify(exec);

// Get regions from environment or use defaults
const REGIONS = process.env.GCLOUD_REGIONS?.split(',') || [
  'us-central1',  // Iowa
  'asia-east1',   // Taiwan
  'europe-west1'  // Belgium
];

// Get project ID from environment
const PROJECT_ID = process.env.PROJECT_ID || 'ethereum-node1';

async function deployToRegion(region) {
  console.log(`Deploying to ${region}...`);
  
  try {
    // Add region to environment variables
    const envContent = fs.readFileSync('.env.cloud', 'utf8');
    const updatedContent = `${envContent}\nFUNCTION_REGION: "${region}"`;
    const tempEnvPath = `.env.${region}`;
    fs.writeFileSync(tempEnvPath, updatedContent);

    // Create cloud directory if it doesn't exist
    if (!fs.existsSync('cloud')) {
      fs.mkdirSync('cloud');
    }

    // Copy necessary files to cloud directory
    const filesToCopy = [
      'src/base-scripts/function.js',
      'src/base-scripts/quick-buy.js',
      'src/base-scripts/shyft-market.js',
      'src/base-scripts/test-ata.js',
      'src/base-scripts/test-ws-raw.js',
      'src/base-scripts/lib/amm-decoder.js',
      'src/base-scripts/lib/market-decoder.js'
    ];

    // Create lib directory in cloud if it doesn't exist
    if (!fs.existsSync('cloud/lib')) {
      fs.mkdirSync('cloud/lib');
    }

    // Copy files
    for (const file of filesToCopy) {
      const destPath = file.replace('src/base-scripts/', 'cloud/');
      const destDir = path.dirname(destPath);
      
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      
      fs.copyFileSync(file, destPath);
      console.log(`Copied ${file} to ${destPath}`);
    }

    // Copy package.json to cloud directory
    const packageJson = JSON.parse(fs.readFileSync('Base scripts/package.json', 'utf8'));
    fs.writeFileSync('cloud/package.json', JSON.stringify(packageJson, null, 2));

    // Deploy to Google Cloud Functions
    const command = `gcloud functions deploy quick-buy-${region} \
      --gen2 \
      --runtime=nodejs20 \
      --region=${region} \
      --source=./cloud \
      --entry-point=quickBuyFunction \
      --trigger-http \
      --allow-unauthenticated \
      --env-vars-file=${tempEnvPath} \
      --memory=4096MB \
      --cpu=2 \
      --timeout=540s \
      --min-instances=1 \
      --max-instances=100 \
      --concurrency=100 \
      --ingress-settings=all \
      --service-account=quick-buy-function@${PROJECT_ID}.iam.gserviceaccount.com`;

    const { stdout, stderr } = await execAsync(command);
    console.log(`Deployed to ${region}:`, stdout);
    if (stderr) console.error(`Warnings for ${region}:`, stderr);
    
    // Clean up temp env file
    fs.unlinkSync(tempEnvPath);
    
    return true;
  } catch (error) {
    console.error(`Failed to deploy to ${region}:`, error.message);
    // Clean up temp env file in case of error
    try {
      fs.unlinkSync(`.env.${region}`);
    } catch (e) {
      // Ignore cleanup errors
    }
    return false;
  }
}

async function deployAll() {
  console.log('Starting deployment to all regions...');
  
  const results = await Promise.all(
    REGIONS.map(region => deployToRegion(region))
  );
  
  const successful = results.filter(Boolean).length;
  console.log(`\nDeployment complete: ${successful}/${REGIONS.length} regions successful`);
  
  if (successful === REGIONS.length) {
    console.log('\nAll deployments successful! Function URLs:');
    REGIONS.forEach(region => {
      console.log(`${region}: https://${region}-${PROJECT_ID}.cloudfunctions.net/quick-buy-${region}`);
    });
  } else {
    console.log('\nSome deployments failed. Check errors above.');
    process.exit(1);
  }
}

// Create PubSub topic if it doesn't exist
async function setupPubSub() {
  try {
    console.log('Setting up PubSub topic...');
    await execAsync(`gcloud pubsub topics create quick-buy-results --project=${PROJECT_ID}`);
    console.log('PubSub topic created successfully');
  } catch (error) {
    if (error.message.includes('already exists')) {
      console.log('PubSub topic already exists');
    } else {
      console.error('Failed to create PubSub topic:', error.message);
      process.exit(1);
    }
  }
}

// Main deployment process
async function main() {
  try {
    await setupPubSub();
    await deployAll();
  } catch (error) {
    console.error('Deployment failed:', error.message);
    process.exit(1);
  }
}

main();
