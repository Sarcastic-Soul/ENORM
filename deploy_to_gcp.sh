#!/bin/bash
set -e

MODE=$1

if [ -z "$MODE" ]; then
    echo "========================================"
    echo "  ENORM Edge Deployment Manager"
    echo "========================================"
    echo "Usage: ./deploy_to_gcp.sh [mode]"
    echo ""
    echo "Modes:"
    echo "  concurrency  - Deploys Central + 1 Region (us-east4). Best for DDoS/Payload tests. (Uses 4 services)"
    echo "  roaming      - Deploys Central + 2 Regions (us-east4, europe-west2). Best for Migration. (Uses 7 services)"
    echo "  cleanup      - Deletes all deployed services to free up your GCP quota."
    exit 1
fi

# Configuration
PROJECT_ID="enorm-494806" # Hardcoded from your previous logs to save time
REDIS_URL="rediss://default:AZGuAAIgcDE2MmRjYzEzMDM5MmU0ZDIzYmU1MWYzOTNlN2QwNTUxZg@apt-anemone-37294.upstash.io:6379"
REPO_NAME="enorm-repo"
IMAGE_URI="us-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/enorm-node:latest"

gcloud config set project $PROJECT_ID > /dev/null 2>&1

# ========================================
# CLEANUP MODE
# ========================================
if [ "$MODE" == "cleanup" ]; then
    echo "Starting cleanup of all ENORM services..."
    SERVICES=$(gcloud run services list --format="value(name,region)")

    if [ -z "$SERVICES" ]; then
        echo "No active services found."
        exit 0
    fi

    echo "$SERVICES" | while read -r SERVICE_NAME REGION; do
        if [[ "$SERVICE_NAME" == enorm-* ]]; then
            echo "Deleting $SERVICE_NAME in $REGION..."
            gcloud run services delete $SERVICE_NAME --region=$REGION --quiet || true
        fi
    done
    echo "Cleanup complete! Your quota is now fully reset."
    rm -f cloud_config.json
    exit 0
fi

# ========================================
# DEPLOYMENT HELPER FUNCTION
# ========================================
deploy_region() {
    local REGION=$1
    local NODE_ID=$2

    echo "----------------------------------------"
    echo "Deploying Edge Node $NODE_ID to $REGION..."

    # 1. Deploy App
    APP_NAME="enorm-app-$REGION"
    APP_URL=$(gcloud run deploy $APP_NAME --image $IMAGE_URI --region $REGION --platform managed --allow-unauthenticated --args="src/app.js" --set-env-vars="ROLE=edge-app,NODE_ID=$NODE_ID,REDIS_URL=$REDIS_URL" --format 'value(status.url)')
    echo "  App URL: $APP_URL"

    # 2. Deploy Manager
    MANAGER_NAME="enorm-manager-$REGION"
    MANAGER_URL=$(gcloud run deploy $MANAGER_NAME --image $IMAGE_URI --region $REGION --platform managed --allow-unauthenticated --port=5000 --args="src/edge-manager.js" --set-env-vars="ROLE=edge-manager,LOCAL_APP_URL=$APP_URL,NODE_ID=$NODE_ID,REDIS_URL=$REDIS_URL" --format 'value(status.url)')
    echo "  Manager URL: $MANAGER_URL"

    # 3. Deploy Worker
    WORKER_NAME="enorm-worker-$REGION"
    WORKER_URL=$(gcloud run deploy $WORKER_NAME --image $IMAGE_URI --region $REGION --platform managed --allow-unauthenticated --args="src/load-worker.js" --set-env-vars="ROLE=load-worker,NODE_ID=$NODE_ID" --format 'value(status.url)')
    echo "  Worker URL: $WORKER_URL"

    # Update JSON
    node -e "
    const fs = require('fs');
    let data = JSON.parse(fs.readFileSync('cloud_config.json'));
    data.edges['edge-' + $NODE_ID] = { id: 'edge-' + $NODE_ID, region: '$REGION', appUrl: '$APP_URL', managerUrl: '$MANAGER_URL', workerUrl: '$WORKER_URL' };
    fs.writeFileSync('cloud_config.json', JSON.stringify(data, null, 2));
    "
}

# ========================================
# MAIN DEPLOYMENT LOGIC
# ========================================

echo '{ "central": {}, "edges": {} }' > cloud_config.json

echo "Deploying Central Cloud Server (us-central1)..."
CENTRAL_URL=$(gcloud run deploy enorm-central --image $IMAGE_URI --region us-central1 --platform managed --allow-unauthenticated --args="src/app.js" --set-env-vars="ROLE=central,REDIS_URL=$REDIS_URL" --format 'value(status.url)')
node -e "const fs = require('fs'); let data = JSON.parse(fs.readFileSync('cloud_config.json')); data.central.url = '$CENTRAL_URL'; fs.writeFileSync('cloud_config.json', JSON.stringify(data, null, 2));"

if [ "$MODE" == "concurrency" ]; then
    echo "Mode: Concurrency (Central + 1 Edge)"
    deploy_region "us-east4" 1

elif [ "$MODE" == "roaming" ]; then
    echo "Mode: Roaming (Central + 2 Edges)"
    deploy_region "us-east4" 1
    deploy_region "europe-west2" 2
else
    echo "Invalid mode. Use 'concurrency', 'roaming', or 'cleanup'."
    exit 1
fi

echo "========================================"
echo "Deployment complete! URLs saved to cloud_config.json"
