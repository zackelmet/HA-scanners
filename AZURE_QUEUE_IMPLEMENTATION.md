# Azure Queue + Functions Implementation Guide

## Architecture Overview

```
┌─────────────────┐
│   Next.js App   │
└────────┬────────┘
         │ POST /api/scans
         ▼
    ┌────────┴────────┐
    │                 │
    ▼                 ▼
┌─────────┐    ┌──────────────┐
│Firestore│    │ Azure Queue  │ (job queue)
│(tracking)│    └──────┬───────┘
└────┬────┘           │ automatic trigger
     │                ▼
     │         ┌──────────────┐
     │         │Azure Function│ (serverless)
     │         └──────┬───────┘
     │                │
     │                ▼
     │         ┌──────────────┐
     │         │   Container  │ (Nmap/OpenVAS)
     │         └──────┬───────┘
     │                │
     └────────────────┘
         (writes results)
```

## Why This is the Best Approach

### Cost Comparison (per 1000 scans/month):

**Option 1 (Polling)**:
- Container running 24/7: ~$80/month
- Firestore reads (17,280/day): ~$5/month
- Total: ~$85/month base cost + usage

**Option 2 (Event-Driven)**:
- Azure Functions: ~$0.20/month (200k executions free tier)
- Queue operations: ~$0.01/month
- Compute only when scanning: ~$2/month
- Total: ~$2.20/month + only scan time costs

**Savings: 97% reduction in idle costs**

## Complete Implementation

### 1. Azure Setup

```bash
# Login to Azure
az login

# Set subscription
az account set --subscription "Your-Subscription-Name"

# Create resource group
az group create \
  --name hackeranalytics-rg \
  --location eastus

# Create storage account (required for Functions + Queue)
az storage account create \
  --name hackeranalyticsstor \
  --resource-group hackeranalytics-rg \
  --location eastus \
  --sku Standard_LRS

# Get storage connection string (save this!)
STORAGE_CONNECTION=$(az storage account show-connection-string \
  --name hackeranalyticsstor \
  --resource-group hackeranalytics-rg \
  --query connectionString -o tsv)

echo $STORAGE_CONNECTION

# Create queue
az storage queue create \
  --name scan-queue \
  --connection-string $STORAGE_CONNECTION

# Create Function App
az functionapp create \
  --resource-group hackeranalytics-rg \
  --consumption-plan-location eastus \
  --runtime node \
  --runtime-version 20 \
  --functions-version 4 \
  --name hackeranalytics-scanner \
  --storage-account hackeranalyticsstor
```

### 2. Add Azure Queue to Next.js API

Install dependencies:
```bash
npm install @azure/storage-queue
```

Create Azure client helper `src/lib/azure/queueClient.ts`:

```typescript
import { QueueClient } from "@azure/storage-queue";

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING!;
const queueName = "scan-queue";

let queueClient: QueueClient;

export function getQueueClient() {
  if (!queueClient) {
    queueClient = new QueueClient(connectionString, queueName);
  }
  return queueClient;
}

export async function addScanToQueue(scanData: {
  scanId: string;
  userId: string;
  type: string;
  target: string;
  options: any;
}) {
  const client = getQueueClient();
  
  // Convert to base64 (Azure Queue requirement)
  const message = Buffer.from(JSON.stringify(scanData)).toString("base64");
  
  await client.sendMessage(message);
}
```

Update `src/app/api/scans/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { initializeAdmin } from "@/lib/firebase/firebaseAdmin";
import { CreateScanRequest } from "@/lib/types/scanner";
import { addScanToQueue } from "@/lib/azure/queueClient";

export async function POST(request: NextRequest) {
  try {
    const admin = initializeAdmin();
    const auth = admin.auth();
    const firestore = admin.firestore();
    
    // ... existing auth code ...
    
    const userId = decodedToken.uid;
    const body: CreateScanRequest = await request.json();
    const { type, target, options } = body;
    
    // ... existing validation code ...
    
    // Create scan document in Firestore
    const scanData = {
      userId,
      type,
      target,
      options,
      status: "queued",
      createdAt: new Date(),
    };

    const scanRef = await firestore.collection("scans").add(scanData);

    // Add to Azure Queue (this triggers the Azure Function)
    await addScanToQueue({
      scanId: scanRef.id,
      userId,
      type,
      target,
      options,
    });

    return NextResponse.json(
      {
        success: true,
        scanId: scanRef.id,
        message: "Scan queued successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating scan:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

Add to `.env`:
```bash
AZURE_STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=https;AccountName=..."
```

### 3. Create Azure Function

Initialize Function project:
```bash
# Install Azure Functions Core Tools
npm install -g azure-functions-core-tools@4

# Create new Function project
mkdir azure-scanner-function
cd azure-scanner-function
func init --typescript

# Create queue-triggered function
func new --name ScanProcessor --template "Azure Queue Storage trigger"
```

This creates: `azure-scanner-function/src/functions/ScanProcessor.ts`

Replace contents with:

```typescript
import { app, InvocationContext } from "@azure/functions";
import * as admin from "firebase-admin";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

export async function scanProcessor(
  queueItem: string,
  context: InvocationContext
): Promise<void> {
  context.log("Queue trigger function processed:", queueItem);

  try {
    // Decode message from base64
    const scanData = JSON.parse(
      Buffer.from(queueItem, "base64").toString("utf-8")
    );

    const { scanId, userId, type, target, options } = scanData;

    context.log(`Processing scan ${scanId} for user ${userId}`);

    // Update scan status to running
    await db.collection("scans").doc(scanId).update({
      status: "running",
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Execute scan based on type
    let result;
    if (type === "nmap") {
      result = await executeNmapScan(target, options, context);
    } else if (type === "openvas") {
      result = await executeOpenVASScan(target, options, context);
    } else {
      throw new Error(`Unknown scan type: ${type}`);
    }

    // Store results
    const resultRef = await db.collection("scanResults").add({
      scanId,
      userId,
      rawOutput: result.rawOutput,
      parsedResults: result.parsed,
      vulnerabilities: result.vulnerabilities || [],
      summary: result.summary,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Update scan status to completed
    await db.collection("scans").doc(scanId).update({
      status: "completed",
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      resultId: resultRef.id,
    });

    context.log(`Scan ${scanId} completed successfully`);
  } catch (error) {
    context.error(`Error processing scan:`, error);

    // Try to update scan status to failed
    try {
      const scanData = JSON.parse(
        Buffer.from(queueItem, "base64").toString("utf-8")
      );
      await db.collection("scans").doc(scanData.scanId).update({
        status: "failed",
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } catch (updateError) {
      context.error("Failed to update scan status:", updateError);
    }

    throw error; // Re-throw to trigger retry logic
  }
}

async function executeNmapScan(
  target: string,
  options: any,
  context: InvocationContext
): Promise<any> {
  // Build nmap command
  let command = "nmap";

  switch (options.scanProfile) {
    case "quick":
      command += " -F";
      break;
    case "standard":
      command += " -sV";
      break;
    case "full":
      command += " -A -T4";
      break;
  }

  if (options.ports) {
    command += ` -p ${options.ports}`;
  }

  command += ` -oX - ${target}`;

  context.log(`Executing: ${command}`);

  const { stdout, stderr } = await execAsync(command, {
    timeout: 300000, // 5 minutes
    maxBuffer: 10 * 1024 * 1024,
  });

  if (stderr) {
    context.warn(`Nmap stderr: ${stderr}`);
  }

  return {
    rawOutput: stdout,
    parsed: parseNmapOutput(stdout),
    vulnerabilities: [],
    summary: {
      totalHosts: 1,
      hostsUp: 1,
      totalPorts: 0,
      openPorts: 0,
      vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0 },
      scanDuration: 0,
    },
  };
}

async function executeOpenVASScan(
  target: string,
  options: any,
  context: InvocationContext
): Promise<any> {
  context.log("OpenVAS scan - placeholder");
  return {
    rawOutput: "OpenVAS coming soon",
    parsed: {},
    vulnerabilities: [],
    summary: {
      totalHosts: 1,
      hostsUp: 1,
      totalPorts: 0,
      openPorts: 0,
      vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0 },
      scanDuration: 0,
    },
  };
}

function parseNmapOutput(xml: string): any {
  // TODO: Implement XML parsing
  return { hosts: [] };
}

// Register function
app.storageQueue("ScanProcessor", {
  queueName: "scan-queue",
  connection: "AzureWebJobsStorage",
  handler: scanProcessor,
});
```

Update `local.settings.json`:
```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "your-storage-connection-string",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "FIREBASE_PROJECT_ID": "your-project-id",
    "FIREBASE_CLIENT_EMAIL": "your-client-email",
    "FIREBASE_PRIVATE_KEY": "your-private-key"
  }
}
```

### 4. Add Nmap to Azure Function

Create `Dockerfile` in azure-scanner-function:

```dockerfile
FROM mcr.microsoft.com/azure-functions/node:4-node20

# Install Nmap
RUN apt-get update && \
    apt-get install -y nmap && \
    apt-get clean

# Copy function app
COPY . /home/site/wwwroot

WORKDIR /home/site/wwwroot

RUN npm install
RUN npm run build

ENV AzureWebJobsScriptRoot=/home/site/wwwroot \
    AzureFunctionsJobHost__Logging__Console__IsEnabled=true
```

### 5. Deploy to Azure

```bash
# Build and deploy
cd azure-scanner-function
npm install
npm run build

# Deploy
func azure functionapp publish hackeranalytics-scanner

# Or deploy with Docker for Nmap support
az functionapp deployment container config \
  --resource-group hackeranalytics-rg \
  --name hackeranalytics-scanner \
  --enable-app-service-storage false \
  --docker-custom-image-name your-registry.azurecr.io/scanner:latest
```

### 6. Configure Function Settings

```bash
# Set environment variables
az functionapp config appsettings set \
  --name hackeranalytics-scanner \
  --resource-group hackeranalytics-rg \
  --settings \
    FIREBASE_PROJECT_ID="your-project" \
    FIREBASE_CLIENT_EMAIL="your-email" \
    FIREBASE_PRIVATE_KEY="your-key"
```

## How It Works

1. **User creates scan** → Next.js API writes to:
   - Firestore (for user to track status)
   - Azure Queue (to trigger processing)

2. **Azure Queue receives message** → Automatically triggers Function

3. **Function executes** →
   - Updates Firestore: status = "running"
   - Runs Nmap/OpenVAS in container
   - Writes results to Firestore
   - Updates status = "completed"

4. **Dashboard shows results** → Real-time via Firestore listeners

## Advantages Over Polling

✅ **No polling overhead** - Function only runs when needed
✅ **Instant triggering** - Sub-second response time
✅ **Auto-scaling** - Azure scales functions automatically
✅ **Cost-effective** - Pay only for actual scan time
✅ **Reliable** - Built-in retry logic if scan fails
✅ **Monitoring** - Azure Application Insights included

## Monitoring

View logs:
```bash
func azure functionapp logstream hackeranalytics-scanner
```

Or use Azure Portal → Function App → Monitor

## Cost Estimate

**Free tier includes**:
- 1 million executions/month
- 400,000 GB-seconds compute

**Expected costs for 1000 scans/month**:
- Queue operations: $0.01
- Function executions: $0 (within free tier)
- Compute time (5 min avg): ~$2
- **Total: ~$2/month**

Compare to polling: $85/month

## Testing Locally

```bash
# Start Azurite (local storage emulator)
npm install -g azurite
azurite --silent

# Run function locally
cd azure-scanner-function
func start

# In another terminal, add message to queue
az storage message put \
  --queue-name scan-queue \
  --content "$(echo '{"scanId":"test123","type":"nmap","target":"scanme.nmap.org"}' | base64)" \
  --connection-string "UseDevelopmentStorage=true"
```

## Production Checklist

- [ ] Deploy Function to Azure
- [ ] Configure Function environment variables
- [ ] Test with real scan from Next.js app
- [ ] Set up monitoring/alerts
- [ ] Configure function timeout (default 5 min, max 10 min)
- [ ] Enable Application Insights
- [ ] Set up dead letter queue for failed scans
- [ ] Add retry policy (default is 5 retries with exponential backoff)

## Summary

This event-driven architecture is:
- **Industry standard** (same pattern as AWS Lambda + SQS)
- **Cost-effective** (97% cheaper than polling)
- **Scalable** (automatic scaling)
- **Reliable** (built-in retries)
- **Fast** (instant triggering)

**This is the recommended production architecture!**
