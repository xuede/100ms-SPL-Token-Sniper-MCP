#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Starting Google Cloud Setup for 100ms Sniper MCP...${NC}\n"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}Google Cloud SDK is not installed.${NC}"
    echo "Please install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Login to Google Cloud
echo -e "\n${YELLOW}1. Logging into Google Cloud...${NC}"
gcloud auth login

# Get project ID
echo -e "\n${YELLOW}2. Setting up project...${NC}"
PROJECT_ID=$(gcloud config get-value project)
if [ -z "$PROJECT_ID" ]; then
    read -p "Enter your Google Cloud project ID: " PROJECT_ID
    gcloud config set project $PROJECT_ID
else
    echo "Using current project: $PROJECT_ID"
    read -p "Continue with this project? (y/n): " CONTINUE
    if [ "$CONTINUE" != "y" ]; then
        read -p "Enter your Google Cloud project ID: " PROJECT_ID
        gcloud config set project $PROJECT_ID
    fi
fi

# Get project number
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
echo "Project Number: $PROJECT_NUMBER"

# Enable required APIs
echo -e "\n${YELLOW}3. Enabling required APIs...${NC}"
gcloud services enable cloudfunctions.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable pubsub.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable cloudresourcemanager.googleapis.com
gcloud services enable iam.googleapis.com

# Wait for APIs to be fully enabled
echo "Waiting for APIs to be ready..."
sleep 15

# Create PubSub topic
echo -e "\n${YELLOW}4. Creating PubSub topic...${NC}"
gcloud pubsub topics create quick-buy-results || true

# Create service account for cloud functions
echo -e "\n${YELLOW}5. Setting up service account...${NC}"
SERVICE_ACCOUNT="quick-buy-function@$PROJECT_ID.iam.gserviceaccount.com"

# Create service account if it doesn't exist
if ! gcloud iam service-accounts describe $SERVICE_ACCOUNT &>/dev/null; then
    echo "Creating new service account..."
    gcloud iam service-accounts create quick-buy-function \
        --display-name="Quick Buy Function Service Account"
    
    echo "Waiting for service account to be ready..."
    sleep 10  # Wait for service account to propagate
fi

# Grant required permissions
echo "Granting permissions..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT" \
    --role="roles/pubsub.publisher" \
    --condition=None

# Grant Cloud Run roles
echo "Granting Cloud Run roles..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT" \
    --role="roles/run.invoker" \
    --condition=None

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT" \
    --role="roles/run.developer" \
    --condition=None

# Get current user
CURRENT_USER=$(gcloud auth list --filter=status:ACTIVE --format="value(account)")
echo "Current user: $CURRENT_USER"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="user:$CURRENT_USER" \
    --role="roles/run.admin" \
    --condition=None

# Wait for permissions to propagate
echo "Waiting for permissions to propagate..."
sleep 20

# Enable compute service account
echo "Enabling compute service account..."
COMPUTE_SA="$PROJECT_NUMBER-compute@developer.gserviceaccount.com"
gcloud iam service-accounts enable $COMPUTE_SA || true

# Grant necessary roles to compute service account
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$COMPUTE_SA" \
    --role="roles/editor" \
    --condition=None

# Verify service account
echo "Verifying service account..."
if gcloud iam service-accounts describe $SERVICE_ACCOUNT &>/dev/null; then
    echo -e "${GREEN}Service account setup successful${NC}"
else
    echo -e "${RED}Service account setup failed. Please run setup again.${NC}"
    exit 1
fi

# Update .env file with project ID
echo -e "\n${YELLOW}6. Updating environment variables...${NC}"
if [ -f .env ]; then
    # Check if PROJECT_ID is already in .env
    if grep -q "PROJECT_ID=" .env; then
        # Update existing PROJECT_ID
        sed -i '' "s/PROJECT_ID=.*/PROJECT_ID=$PROJECT_ID/" .env
    else
        # Add PROJECT_ID to .env
        echo "PROJECT_ID=$PROJECT_ID" >> .env
    fi
    echo -e "${GREEN}Updated .env with PROJECT_ID${NC}"
else
    echo -e "${RED}.env file not found. Please create it first.${NC}"
    exit 1
fi

# Get authentication token
echo -e "\n${YELLOW}7. Getting authentication token...${NC}"
GCLOUD_TOKEN=$(gcloud auth print-access-token)

# Update .env file with token
if grep -q "GCLOUD_TOKEN=" .env; then
    # Update existing GCLOUD_TOKEN
    sed -i '' "s/GCLOUD_TOKEN=.*/GCLOUD_TOKEN=$GCLOUD_TOKEN/" .env
else
    # Add GCLOUD_TOKEN to .env
    echo "GCLOUD_TOKEN=$GCLOUD_TOKEN" >> .env
fi
echo -e "${GREEN}Updated .env with GCLOUD_TOKEN${NC}"

# Make deploy.js executable
chmod +x scripts/deploy.js

echo -e "\n${GREEN}Setup complete! You can now deploy the functions:${NC}"
echo -e "Run: ${YELLOW}node scripts/deploy.js${NC}"
