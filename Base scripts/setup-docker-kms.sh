#!/bin/bash

# Pull the KMS Docker image
echo "Pulling Tatum KMS Docker image..."
docker pull tatumio/tatum-kms

# Create KMS environment file
echo "Creating KMS environment file..."
cat > kms.env << EOL
TATUM_API_KEY=${NEXT_PUBLIC_TATUM_API_KEY}
TATUM_KMS_PASSWORD=your-secure-password-here
EOL

# Create wallet in KMS
echo "Creating Solana wallet in KMS..."
docker run -it --env-file kms.env -v ./:/root/.tatumrc tatumio/tatum-kms generatemanagedwallet SOL

# Start KMS daemon
echo "Starting KMS daemon..."
docker run -d --env-file kms.env -v ./:/root/.tatumrc tatumio/tatum-kms daemon

echo "KMS setup complete. Please save the signatureId from above for use in your .env file"
