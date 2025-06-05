#!/bin/bash
set -e

# Validate environment
if [ -z "$GCP_PROJECT" ]; then
  echo "ERROR: GCP_PROJECT must be set"
  exit 1
fi

# Deploy Cloud Function with security settings
gcloud functions deploy quick-buy-function \
  --project $GCP_PROJECT \
  --region us-central1 \
  --runtime nodejs18 \
  --trigger-http \
  --allow-unauthenticated \
  --set-env-vars "HELIUS_API_KEY=$(gcloud secrets versions access latest --secret=helius-api-key)" \
  --set-env-vars "SHYFT_API_KEY=$(gcloud secrets versions access latest --secret=shyft-api-key)" \
  --set-env-vars "WALLET_PRIVATE_KEY=$(gcloud secrets versions access latest --secret=wallet-pkey)" \
  --max-instances 5 \
  --timeout 300s \
  --source .
