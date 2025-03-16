#!/bin/bash

# Load environment variables
source .env.cloud

# Check if PROJECT_ID is set
if [ -z "$PROJECT_ID" ]; then
  echo "Error: PROJECT_ID not set in .env.cloud"
  exit 1
fi

# Enable required APIs
echo "Enabling required APIs..."
gcloud services enable \
  cloudfunctions.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  run.googleapis.com \
  pubsub.googleapis.com \
  cloudkms.googleapis.com \
  --project=$PROJECT_ID

# Create service account
echo "Creating service account..."
gcloud iam service-accounts create quick-buy-sa \
  --display-name="Quick Buy Service Account" \
  --project=$PROJECT_ID

# Grant required roles
echo "Granting required roles..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:quick-buy-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/cloudfunctions.invoker"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:quick-buy-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/pubsub.publisher"

# Create PubSub topic
echo "Creating PubSub topic..."
gcloud pubsub topics create quick-buy-results \
  --project=$PROJECT_ID

# Create subscription
echo "Creating PubSub subscription..."
gcloud pubsub subscriptions create quick-buy-results-sub \
  --topic=quick-buy-results \
  --ack-deadline=60 \
  --message-retention-duration=1h \
  --project=$PROJECT_ID

echo "Cloud setup complete!"
