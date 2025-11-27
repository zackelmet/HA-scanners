# Google Cloud Platform Setup Guide for Scan Processing

This guide will walk you through setting up GCP infrastructure for handling security scans.

## Architecture Overview

```
User → Vercel API → Cloud Tasks Queue → Cloud Run Function → Nmap/OpenVAS
                                              ↓
                                        Cloud Storage
                                              ↓
                                        Webhook → Vercel API → Firestore
```

## Prerequisites

1. Google Cloud Account (free tier: $300 credit + always-free tier)
2. gcloud CLI installed: `brew install google-cloud-sdk` or https://cloud.google.com/sdk/docs/install
3. Node.js and npm installed
4. Existing Firebase project (you already have this!)

## Step 1: Login to GCP

```bash
gcloud auth login
gcloud auth application-default login
```

## Step 2: Set Your Firebase Project

```bash
# List your projects
gcloud projects list

# Set your Firebase project (use the PROJECT_ID from Firebase)
PROJECT_ID="hosted-scanners-30b84"  # Your Firebase project ID
gcloud config set project $PROJECT_ID

# Enable required APIs
gcloud services enable \
  cloudtasks.googleapis.com \
  cloudfunctions.googleapis.com \
  storage.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com
```

## Step 3: Create Cloud Storage Bucket for Scan Results

```bash
BUCKET_NAME="${PROJECT_ID}-scan-results"
LOCATION="us-central1"  # Or your preferred region

# Create bucket
gsutil mb -l $LOCATION gs://$BUCKET_NAME

# Make bucket private (default)
gsutil iam ch allUsers:objectViewer gs://$BUCKET_NAME -d
```

## Step 4: Set Lifecycle Policy (30-day auto-delete)

```bash
# Create lifecycle policy
cat > lifecycle.json << 'EOF'
{
  "lifecycle": {
    "rule": [
      {
        "action": {
          "type": "Delete"
        },
        "condition": {
          "age": 30
        }
      }
    ]
  }
}
EOF

# Apply lifecycle policy
gsutil lifecycle set lifecycle.json gs://$BUCKET_NAME

# Verify
gsutil lifecycle get gs://$BUCKET_NAME
```

## Step 5: Create Cloud Tasks Queue

```bash
QUEUE_NAME="scan-jobs"
REGION="us-central1"

# Create queue
gcloud tasks queues create $QUEUE_NAME \
  --location=$REGION \
  --max-dispatches-per-second=10 \
  --max-concurrent-dispatches=100

# Verify
gcloud tasks queues describe $QUEUE_NAME --location=$REGION
```

## Step 6: Create Service Account for Functions

```bash
SERVICE_ACCOUNT_NAME="scanner-function"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# Create service account
gcloud iam service-accounts create $SERVICE_ACCOUNT_NAME \
  --display-name="Scanner Function Service Account"

# Grant permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/storage.objectAdmin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/cloudtasks.enqueuer"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/datastore.user"
```

## Step 7: Get Service Account Key (for Vercel)

```bash
# Create and download key
gcloud iam service-accounts keys create scanner-key.json \
  --iam-account=$SERVICE_ACCOUNT_EMAIL

# Display the key (copy this to Vercel env vars)
cat scanner-key.json | base64
```

**Important:** Save this base64-encoded key. You'll add it to Vercel as `GCP_SERVICE_ACCOUNT_KEY`

## Step 8: Generate Webhook Secret

```bash
# Generate secure webhook secret
WEBHOOK_SECRET=$(openssl rand -hex 32)
echo "Webhook Secret: $WEBHOOK_SECRET"
```

Save this - you'll add it to both Cloud Function and Vercel env vars.

## Step 9: Update Environment Variables

### Local Development (`.env.local`):

```env
# Google Cloud Platform
GCP_PROJECT_ID="hosted-scanners-30b84"
GCP_BUCKET_NAME="hosted-scanners-30b84-scan-results"
GCP_QUEUE_NAME="scan-jobs"
GCP_QUEUE_LOCATION="us-central1"
GCP_SERVICE_ACCOUNT_KEY="<base64 from step 7>"

# Webhook Security
GCP_WEBHOOK_SECRET="<from step 8>"
```

### Vercel Environment Variables:

Go to Vercel Dashboard → Your Project → Settings → Environment Variables

Add all the above environment variables.

## Step 10: Install GCP SDKs in Next.js App

```bash
cd /path/to/your/nextjs/app
npm install @google-cloud/storage @google-cloud/tasks
```

## Step 11: Create Cloud Function for Scan Processing

We'll create this next - it will:
- Be triggered by Cloud Tasks queue
- Run Nmap/OpenVAS in a Docker container
- Store results in Cloud Storage
- Call webhook with metadata

## Step 12: Deploy Cloud Function

```bash
# We'll create the function code first, then deploy with:
gcloud functions deploy scanProcessor \
  --gen2 \
  --runtime=nodejs20 \
  --region=$REGION \
  --source=./cloud-functions/scanner \
  --entry-point=processScan \
  --trigger-http \
  --allow-unauthenticated \
  --service-account=$SERVICE_ACCOUNT_EMAIL \
  --set-env-vars="WEBHOOK_SECRET=$WEBHOOK_SECRET,BUCKET_NAME=$BUCKET_NAME" \
  --timeout=540s \
  --memory=2GB
```

## Costs (Approximate)

### Google Cloud Free Tier (Always Free):
- Cloud Tasks: First 1M operations/month FREE
- Cloud Storage: First 5GB FREE
- Cloud Functions: First 2M invocations FREE
- Firestore: Already included in Firebase

### After Free Tier:
- Cloud Storage: $0.020/GB/month (cheaper than Azure!)
- Cloud Functions: $0.40/million invocations
- Cloud Tasks: $0.40/million operations

**Total for 1000 scans/month: FREE (within free tier)**
**Total for 10,000 scans/month: ~$2-3/month**

## Benefits of GCP over Azure:

1. ✅ **Already using Firebase** - same project, same billing
2. ✅ **Better free tier** - more generous limits
3. ✅ **Simpler auth** - service account works everywhere
4. ✅ **Cloud Run** - better for Docker containers (Nmap/OpenVAS)
5. ✅ **Tighter Firebase integration**

## Next Steps

1. Run the commands above to set up GCP infrastructure
2. Install the GCP SDKs in your Next.js app
3. I'll create the Cloud Function code for scan processing
4. Test locally, then deploy
5. Test end-to-end

Ready to proceed?
