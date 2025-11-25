# Azure Scanner Integration Guide

## Architecture Overview

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Next.js   │────▶│  Firestore   │◀────│    Azure    │
│  Frontend   │     │   Database   │     │   Worker    │
└─────────────┘     └──────────────┘     └─────────────┘
                           │                      │
                           │                      ▼
                           │              ┌──────────────┐
                           │              │   Docker     │
                           │              │  Container   │
                           └──────────────│ Nmap/OpenVAS │
                                          └──────────────┘
```

## RECOMMENDED: Azure Functions + Queue Storage (Event-Driven)

**This is the industry-standard approach and most cost-effective.**

### Why This is Better:
- ✅ Event-driven (no polling waste)
- ✅ Auto-scales based on queue depth
- ✅ Pay only when processing scans
- ✅ Reduced Firestore reads = lower costs
- ✅ Instant trigger (no polling delay)
- ✅ Industry standard pattern

## Step-by-Step Setup

### 1. Azure Resources Setup

```bash
# Create resource group
az group create --name hackeranalytics-rg --location eastus

# Create storage account
az storage account create \
  --name hackeranalyticsstorage \
  --resource-group hackeranalytics-rg \
  --location eastus \
  --sku Standard_LRS

# Get connection string
az storage account show-connection-string \
  --name hackeranalyticsstorage \
  --resource-group hackeranalytics-rg

# Create queue
az storage queue create \
  --name scan-queue \
  --account-name hackeranalyticsstorage
```

### 2. Update Next.js API to Write to Both Firestore AND Azure Queue

Install Azure SDK:
```bash
npm install @azure/storage-queue
```

Update `src/app/api/scans/route.ts`:

### Option 1: Azure Container Instances (Recommended)

**Why**: Simple, scalable, pay-per-use, isolated execution

**Setup**:
1. Create Azure Container Registry (ACR)
2. Build Docker image with Nmap/OpenVAS
3. Deploy worker service to Azure Container Instance
4. Worker polls Firestore for jobs

**Pros**:
- Simple to set up
- Automatic scaling
- Isolated containers per scan
- Pay only when running

**Cons**:
- Slight delay for container startup
- Need to manage polling

### Option 2: Azure Functions + Queue Storage

**Why**: Event-driven, serverless, automatic scaling

**Setup**:
1. Create Azure Storage Queue
2. Deploy Azure Function with queue trigger
3. API writes to both Firestore + Azure Queue
4. Function processes and writes results back

**Pros**:
- Event-driven (no polling)
- Automatic scaling
- Simple deployment

**Cons**:
- 10 minute timeout limit (may need durable functions)
- Two queue systems (Firestore + Azure)

### Option 3: Azure Kubernetes Service (AKS)

**Why**: High performance, advanced control, multiple workers

**Setup**:
1. Deploy Kubernetes cluster
2. Create worker pods that poll Firestore
3. Scale based on queue depth

**Pros**:
- High performance
- Advanced orchestration
- Multiple concurrent scans

**Cons**:
- More complex setup
- Higher cost (always running)
- Overkill for initial launch

## RECOMMENDED: Azure Functions + Queue Storage (Event-Driven)

**This is the industry-standard approach and most cost-effective.**

### Why This is Better:
- ✅ Event-driven (no polling waste)
- ✅ Auto-scales based on queue depth
- ✅ Pay only when processing scans
- ✅ Reduced Firestore reads = lower costs
- ✅ Instant trigger (no polling delay)
- ✅ Industry standard pattern

## Implementation: Azure Functions + Queue Storage

### 1. Azure Setup

```bash
# Create resource group
az group create --name hackeranalytics-rg --location eastus

# Create container registry
az acr create --resource-group hackeranalytics-rg \
  --name hackeranalyticsacr --sku Basic

# Login to ACR
az acr login --name hackeranalyticsacr
```

### 2. Build Scanner Docker Image

Create `azure-worker/Dockerfile`:

```dockerfile
FROM ubuntu:22.04

# Install Nmap
RUN apt-get update && \
    apt-get install -y nmap curl && \
    apt-get clean

# Install Node.js for worker script
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs

WORKDIR /app

# Copy worker code
COPY package*.json ./
RUN npm install

COPY . .

CMD ["node", "worker.js"]
```

### 3. Worker Code

Create `azure-worker/worker.js`:

```javascript
const admin = require('firebase-admin');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Initialize Firebase Admin with service account
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  })
});

const db = admin.firestore();

async function pollForScans() {
  console.log('Checking for queued scans...');
  
  // Get oldest queued scan
  const snapshot = await db.collection('scanQueue')
    .orderBy('queuedAt', 'asc')
    .limit(1)
    .get();
  
  if (snapshot.empty) {
    console.log('No scans in queue');
    return;
  }
  
  const queueDoc = snapshot.docs[0];
  const queueData = queueDoc.data();
  const scanId = queueData.scanId;
  
  console.log(`Processing scan: ${scanId}`);
  
  try {
    // Get scan details
    const scanDoc = await db.collection('scans').doc(scanId).get();
    const scanData = scanDoc.data();
    
    // Update status to running
    await scanDoc.ref.update({
      status: 'running',
      startedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Execute scan based on type
    let result;
    if (scanData.type === 'nmap') {
      result = await executeNmapScan(scanData);
    } else if (scanData.type === 'openvas') {
      result = await executeOpenVASScan(scanData);
    }
    
    // Store results
    const resultRef = await db.collection('scanResults').add({
      scanId: scanId,
      userId: scanData.userId,
      rawOutput: result.rawOutput,
      parsedResults: result.parsed,
      vulnerabilities: result.vulnerabilities,
      summary: result.summary,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Update scan status
    await scanDoc.ref.update({
      status: 'completed',
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      resultId: resultRef.id
    });
    
    // Remove from queue
    await queueDoc.ref.delete();
    
    console.log(`Scan ${scanId} completed successfully`);
    
  } catch (error) {
    console.error(`Error processing scan ${scanId}:`, error);
    
    // Update scan status to failed
    await db.collection('scans').doc(scanId).update({
      status: 'failed',
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      error: error.message
    });
    
    // Remove from queue
    await queueDoc.ref.delete();
  }
}

async function executeNmapScan(scanData) {
  const { target, options } = scanData;
  
  // Build nmap command
  let command = 'nmap';
  
  switch (options.scanProfile) {
    case 'quick':
      command += ' -F';
      break;
    case 'standard':
      command += ' -sV';
      break;
    case 'full':
      command += ' -A -T4';
      break;
  }
  
  if (options.ports) {
    command += ` -p ${options.ports}`;
  }
  
  command += ` -oX - ${target}`;
  
  console.log(`Executing: ${command}`);
  
  const { stdout, stderr } = await execAsync(command, {
    timeout: 300000, // 5 minutes
    maxBuffer: 10 * 1024 * 1024
  });
  
  // Parse XML output (simplified)
  return {
    rawOutput: stdout,
    parsed: parseNmapXML(stdout),
    vulnerabilities: [],
    summary: {
      totalHosts: 1,
      hostsUp: 1,
      totalPorts: 0,
      openPorts: 0,
      vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0 },
      scanDuration: 0
    }
  };
}

async function executeOpenVASScan(scanData) {
  // Placeholder for OpenVAS
  return {
    rawOutput: 'OpenVAS scan - Coming soon',
    parsed: {},
    vulnerabilities: [],
    summary: {
      totalHosts: 1,
      hostsUp: 1,
      totalPorts: 0,
      openPorts: 0,
      vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0 },
      scanDuration: 0
    }
  };
}

function parseNmapXML(xml) {
  // Implement XML parsing here
  // Use xml2js or fast-xml-parser
  return { hosts: [] };
}

// Main loop
async function main() {
  console.log('Azure Scanner Worker started');
  
  while (true) {
    try {
      await pollForScans();
    } catch (error) {
      console.error('Error in main loop:', error);
    }
    
    // Wait 5 seconds before next poll
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

main();
```

### 4. Deploy to Azure

```bash
# Build and push image
docker build -t hackeranalyticsacr.azurecr.io/scanner-worker:latest .
docker push hackeranalyticsacr.azurecr.io/scanner-worker:latest

# Create container instance
az container create \
  --resource-group hackeranalytics-rg \
  --name scanner-worker \
  --image hackeranalyticsacr.azurecr.io/scanner-worker:latest \
  --registry-username <username> \
  --registry-password <password> \
  --environment-variables \
    FIREBASE_PROJECT_ID="your-project-id" \
    FIREBASE_CLIENT_EMAIL="your-client-email" \
    FIREBASE_PRIVATE_KEY="your-private-key" \
  --cpu 2 \
  --memory 4
```

### 5. Security Considerations

**Network Isolation**:
- Run container in Azure Virtual Network
- Restrict outbound connections
- Block private IP ranges

**Resource Limits**:
- CPU: 2 cores per container
- Memory: 4GB per container
- Timeout: 15 minutes per scan

**Input Validation**:
- Validate all targets before execution
- Sanitize nmap commands
- Block dangerous flags

## Connection to Next.js App

Your Next.js app **doesn't directly talk to Azure**. The flow is:

```
1. User submits scan in dashboard
2. Next.js API writes to Firestore (scans + scanQueue)
3. Azure worker polls Firestore
4. Azure runs scan in isolated container
5. Azure writes results back to Firestore
6. User dashboard shows results (real-time via Firestore listeners)
```

**No direct connection needed!** Firestore is the message broker.

## Environment Variables for Azure Worker

```bash
FIREBASE_PROJECT_ID="your-project-id"
FIREBASE_CLIENT_EMAIL="firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

## Scaling

**Manual Scaling**:
```bash
# Scale to 3 workers
az container create --name scanner-worker-2 ...
az container create --name scanner-worker-3 ...
```

**Auto-scaling** (Advanced):
- Use Azure Container Apps instead
- Scale based on queue depth
- Set min/max instances

## Cost Estimation

**Azure Container Instances**:
- ~$0.0000012/second per vCPU
- ~$0.0000001/second per GB memory
- Example: 2 vCPU, 4GB, running 24/7 = ~$80/month
- Pay-per-use: Only when scanning

**Recommended for starting**:
- 1 container, scales on-demand
- Estimated: $20-50/month for light usage
