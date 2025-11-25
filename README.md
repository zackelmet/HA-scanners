# HackerAnalytics - Hosted Security Scanners

A comprehensive SaaS platform for hosted vulnerability scanning using Nmap and OpenVAS.

## 🚀 Features

- **Hosted Nmap Scanner**: Network discovery and port scanning without installation
- **Hosted OpenVAS Scanner**: Comprehensive vulnerability assessment
- **User Dashboard**: Launch and manage security scans
- **Real-time Scan Status**: Track scan progress in real-time
- **Scan History**: Review past scans and results
- **Subscription Management**: Stripe-powered billing
- **User Authentication**: Firebase Authentication

## 🛠️ Tech Stack

- **Frontend**: Next.js 14, React, TypeScript, TailwindCSS, DaisyUI
- **Backend**: Firebase (Firestore, Functions, Auth)
- **Payment**: Stripe
- **Scanners**: Nmap, OpenVAS (coming soon)

## 📋 Prerequisites

- Node.js 18+ and npm
- Firebase account and project
- Stripe account
- (Optional) Mixpanel account for analytics

## 🔧 Setup Instructions

### 1. Clone and Install

```bash
git clone https://github.com/yourusername/hacker-analytics-saas.git
cd hacker-analytics-saas
npm install
```

### 2. Firebase Setup

1. Create a new Firebase project at [Firebase Console](https://console.firebase.google.com/)
2. Enable Firebase Authentication (Email/Password)
3. Enable Firestore Database
4. Create a service account for Firebase Admin:
   - Go to Project Settings > Service Accounts
   - Click "Generate New Private Key"
   - Save the JSON file securely

### 3. Environment Variables

Copy `.env` and fill in your credentials (see `.env` file for all required variables).

### 4. Deploy Firebase Functions

```bash
cd functions
npm install
firebase login
firebase use --add  # Select your Firebase project
firebase deploy --only functions
```

### 5. Run Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

## 🔒 Security Considerations

### Important: Scanner Execution Security

The current implementation includes example code for executing Nmap scans. **Before production deployment**, you MUST:

1. **Isolate Scanner Execution**: Use Docker containers or VMs
2. **Input Validation**: Strictly validate scan targets
3. **Rate Limiting**: Implement per-user scan limits
4. **Target Authorization**: Verify users have permission to scan
5. **Resource Management**: Set maximum scan duration and resource limits

See `SCANNER_ARCHITECTURE.md` for detailed security guidelines.

## 📁 Project Structure

```
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/scans/         # Scanner API endpoints
│   │   ├── app/dashboard/     # Scanner dashboard
│   │   └── page.tsx           # Landing page
│   ├── components/            # React components
│   └── lib/                   # Utilities and types
├── functions/                 # Firebase Functions
│   └── src/
│       └── scanProcessor.ts   # Scan execution logic
└── SCANNER_ARCHITECTURE.md    # Architecture documentation
```

## 📝 Documentation

- `SCANNER_ARCHITECTURE.md` - Detailed scanner service architecture
- Full setup guide at [docs link]

## ⚠️ Legal Notice

This software is intended for authorized security testing only. Users are solely responsible for ensuring they have proper authorization before scanning any network or system. Unauthorized scanning may be illegal.

---

Built with ❤️ using [FireSaaS](https://firesaas.dev) template
