# Deploying 100ms Raydium Sniper Cloud Functions

This guide will walk you through the process of deploying the cloud functions that provide multiple region support for the 100ms Raydium Sniper.

## Prerequisites

1. Google Cloud account with billing enabled
2. Google Cloud CLI installed (`gcloud`)
3. Project configured with required APIs:
   - Cloud Functions
   - Cloud Build
   - Cloud Run
   - Artifact Registry
   - IAM API

## Setup Environment

1. **Clone this repository and navigate to the project directory**

   ```bash
   git clone https://github.com/your-username/100ms-sniper-mcp.git
   cd 100ms-sniper-mcp
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Set up cloud configuration**

   Create a `.env.cloud` file in the `cloud` directory with the following variables:

   ```
   HELIUS_API_KEY: your-helius-api-key
   SHYFT_API_KEY: your-shyft-api-key
   WALLET_PRIVATE_KEY: your-base58-encoded-wallet-private-key
   PROJECT_ID: your-gcp-project-id
   FUNCTION_DEBUG: 'true'
   FUNCTION_MEMORY_MB: '4096'
   FUNCTION_CPU: '2'
   FUNCTION_TIMEOUT: '540'
   FUNCTION_CONCURRENCY: '100'
   ```

   You can use the provided `.env.cloud.example` file as a template.

## Cloud Setup Script

Run the cloud setup script to create the required GCP resources:

```bash
pnpm run cloud:setup
```

This script:
- Enables required GCP APIs
- Creates service accounts with required permissions
- Creates PubSub topics and subscriptions
- Sets up IAM roles

## Deploying the Cloud Functions

Once setup is complete, you can deploy the cloud functions to multiple regions:

```bash
pnpm run cloud:build
pnpm run cloud:deploy
```

This will:
1. Build the TypeScript code
2. Format the environment variables
3. Deploy to the following regions:
   - us-east1 (US East)
   - asia-northeast1 (Tokyo)
   - europe-west3 (Frankfurt)

## Troubleshooting Deployment Issues

### Container Health Check Failures

If deployment fails with the error `Container Healthcheck failed`:

1. Ensure the function properly listens on the PORT environment variable:

   ```javascript
   // Ensure this code is included at the end of cloud/index.js
   const port = parseInt(process.env.PORT) || 8080;
   functions.start({ port });
   ```

2. Check the logs for the failing function:

   ```bash
   gcloud functions logs read quick-buy-REGION --gen2 --project=YOUR_PROJECT_ID
   ```

3. Increase the Cloud Run startup time in the Google Cloud Console:
   - Go to Cloud Run
   - Select the failing service
   - Edit
   - Under "Container" tab, increase the startup time

### Authorization Issues

If you see permissions errors:

1. Ensure the service account has the correct roles:

   ```bash
   gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
     --member="serviceAccount:quick-buy-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
     --role="roles/cloudfunctions.invoker"
   ```

2. Check that you've authorized the gcloud CLI:

   ```bash
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```

## Updating Your Function URLs

After successful deployment, update your main .env file with the function URLs:

```
US_FUNCTION_URL=https://us-east1-YOUR_PROJECT_ID.cloudfunctions.net/quick-buy-us-east1
ASIA_FUNCTION_URL=https://asia-northeast1-YOUR_PROJECT_ID.cloudfunctions.net/quick-buy-asia-northeast1
EUROPE_FUNCTION_URL=https://europe-west3-YOUR_PROJECT_ID.cloudfunctions.net/quick-buy-europe-west3
```

You can find these URLs in the deployment output or by running:

```bash
gcloud functions describe quick-buy-us-east1 --gen2 --region=us-east1 --format="value(serviceConfig.uri)"
```

## Monitoring

Monitor your deployed functions using the Google Cloud Console:

1. Go to Cloud Functions
2. Select your function
3. View the "Logs" tab for real-time logs
4. Check the "Metrics" tab for performance data
