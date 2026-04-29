#!/bin/bash
set -e

# 1. Prompt for GCP Project ID
if [ -z "$PROJECT_ID" ]; then
    read -p "Enter your GCP Project ID: " PROJECT_ID
fi

gcloud config set project $PROJECT_ID

# Enable required services
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

# Create Artifact Registry repo (if it doesn't exist)
REPO_NAME="enorm-repo"
gcloud artifacts repositories create $REPO_NAME \
    --repository-format=docker \
    --location=us \
    --description="ENORM Docker repository" || true

# 2. Build and submit single master image
IMAGE_URI="us-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/enorm-node:latest"
echo "Building and pushing image to Artifact Registry..."
# Note: Ensure you have a Dockerfile at the project root
gcloud builds submit --tag $IMAGE_URI

# Initialize JSON config structure
echo '{ "central": {}, "edges": {} }' > cloud_config.json

# 3. Deploy Central Cloud Server to us-central1
echo "Deploying Central Cloud Server..."
CENTRAL_URL=$(gcloud run deploy enorm-central \
    --image $IMAGE_URI \
    --region us-central1 \
    --platform managed \
    --allow-unauthenticated \
    --args="src/app.js" \
    --set-env-vars="ROLE=central" \
    --format 'value(status.url)')

# Update JSON using node
node -e "
const fs = require('fs');
let data = JSON.parse(fs.readFileSync('cloud_config.json'));
data.central.url = '$CENTRAL_URL';
fs.writeFileSync('cloud_config.json', JSON.stringify(data, null, 2));
"

# 4. Iterate through global regions
REGIONS=("us-east4" "europe-west2" "asia-northeast1" "asia-south1" "australia-southeast1")
NODE_ID_COUNTER=1

for REGION in "${REGIONS[@]}"; do
    echo "========================================"
    echo "Deploying to $REGION (Node ID: $NODE_ID_COUNTER)"

    # Deploy Edge App
    APP_NAME="enorm-app-$REGION"
    APP_URL=$(gcloud run deploy $APP_NAME \
        --image $IMAGE_URI \
        --region $REGION \
        --platform managed \
        --allow-unauthenticated \
        --args="src/app.js" \
        --set-env-vars="ROLE=edge-app,NODE_ID=$NODE_ID_COUNTER,REDIS_URL=redis://REPLACE_ME:6379" \
        --format 'value(status.url)')

    echo "App URL: $APP_URL"

    # Deploy Edge Manager, passing the APP_URL
    MANAGER_NAME="enorm-manager-$REGION"
    MANAGER_URL=$(gcloud run deploy $MANAGER_NAME \
        --image $IMAGE_URI \
        --region $REGION \
        --platform managed \
        --allow-unauthenticated \
        --args="src/edge-manager.js" \
        --set-env-vars="ROLE=edge-manager,LOCAL_APP_URL=$APP_URL,NODE_ID=$NODE_ID_COUNTER,REDIS_URL=redis://REPLACE_ME:6379" \
        --format 'value(status.url)')

    echo "Manager URL: $MANAGER_URL"

    # Deploy Load Worker
    WORKER_NAME="enorm-worker-$REGION"
    WORKER_URL=$(gcloud run deploy $WORKER_NAME \
        --image $IMAGE_URI \
        --region $REGION \
        --platform managed \
        --allow-unauthenticated \
        --args="src/load-worker.js" \
        --set-env-vars="ROLE=load-worker,NODE_ID=$NODE_ID_COUNTER" \
        --format 'value(status.url)')

    echo "Worker URL: $WORKER_URL"

    # Append to cloud_config.json
    node -e "
    const fs = require('fs');
    let data = JSON.parse(fs.readFileSync('cloud_config.json'));
    data.edges['edge-' + $NODE_ID_COUNTER] = {
        id: 'edge-' + $NODE_ID_COUNTER,
        region: '$REGION',
        appUrl: '$APP_URL',
        managerUrl: '$MANAGER_URL',
        workerUrl: '$WORKER_URL'
    };
    fs.writeFileSync('cloud_config.json', JSON.stringify(data, null, 2));
    "

    NODE_ID_COUNTER=$((NODE_ID_COUNTER + 1))
done

echo "Deployment complete! Configuration saved to cloud_config.json."
