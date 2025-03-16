#!/usr/bin/env node
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
const execAsync = promisify(exec);

const REGIONS = [
  'asia-northeast1',  // Tokyo
  'europe-west3',     // Frankfurt
  'us-east1'         // Virginia
];

async function deployToRegion(region) {
  console.log(`Deploying to ${region}...`);
  
  try {
    // Add region to environment variables
    const envContent = fs.readFileSync('.env.cloud', 'utf8');
    const updatedContent = `${envContent}\nFUNCTION_REGION: "${region}"`;
    const tempEnvPath = `.env.cloud.${region}`;
    fs.writeFileSync(tempEnvPath, updatedContent);

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
      --service-account=quick-buy-function@${process.env.PROJECT_ID}.iam.gserviceaccount.com`;

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
      fs.unlinkSync(`.env.cloud.${region}`);
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
      console.log(`${region}: https://${region}-hip-bonito-451118-h3.cloudfunctions.net/quick-buy-${region}`);
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
    await execAsync('gcloud pubsub topics create quick-buy-results --project=hip-bonito-451118-h3');
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
