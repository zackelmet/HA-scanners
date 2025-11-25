# 🚀 Quick Start Guide

Get your HackerAnalytics security scanner platform up and running in minutes!

## Prerequisites

- Node.js 18 or higher
- npm or yarn
- A code editor (VS Code recommended)

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Configure Environment Variables

The `.env` file already exists. You need to fill it with your actual credentials:

### Firebase Setup (Required)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select existing
3. Get your config from Project Settings > General > Your apps > Web app

Fill in these variables in `.env`:
```
NEXT_PUBLIC_FIREBASE_API_KEY="your-key-here"
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="your-project.firebaseapp.com"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="your-project-id"
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="your-project.appspot.com"
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="your-sender-id"
NEXT_PUBLIC_FIREBASE_APP_ID="your-app-id"
```

4. For admin credentials, go to Project Settings > Service Accounts
5. Click "Generate New Private Key"
6. Copy the values:
```
FIREBASE_CLIENT_EMAIL="firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour-Key-Here\n-----END PRIVATE KEY-----\n"
```

### Stripe Setup (Required for payments)

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/)
2. Get your API keys from Developers > API keys

```
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."
STRIPE_SECRET_KEY="sk_test_..."
```

### Optional Services

```
NEXT_PUBLIC_MIXPANEL_TOKEN="your-mixpanel-token"  # For analytics
NEXT_PUBLIC_ENABLE_BLOG=false  # Set to true if using blog
```

## Step 3: Set Up Firebase

### Enable Authentication

1. In Firebase Console, go to Authentication
2. Click "Get Started"
3. Enable "Email/Password" sign-in method

### Create Firestore Database

1. Go to Firestore Database
2. Click "Create Database"
3. Start in **test mode** (we'll add security rules later)
4. Choose a location

### Apply Security Rules

Go to Firestore Database > Rules and paste:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    match /scans/{scanId} {
      allow read: if request.auth != null && resource.data.userId == request.auth.uid;
      allow create: if request.auth != null;
    }
    
    match /scanResults/{resultId} {
      allow read: if request.auth != null && resource.data.userId == request.auth.uid;
    }
  }
}
```

## Step 4: Set Up Stripe Products

1. In Stripe Dashboard, go to Products
2. Create products for your subscription tiers
3. Add pricing (monthly/annual)
4. Note the Price IDs for later use

## Step 5: Run the Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) 🎉

## Step 6: Test the Application

### Test Landing Page
- Visit http://localhost:3000
- Check that all sections load correctly
- Verify the design looks good

### Test Authentication
1. Click "Get Started" or "Login"
2. Sign up with a test email
3. Verify you can log in
4. Check that you're redirected to dashboard

### Test Dashboard
1. After logging in, you should see the scanner dashboard
2. Explore the tabs: Overview, New Scan, Scan History
3. Try the UI (actual scanning won't work until scanners are configured)

## Next Steps

### For Development
- [ ] Customize the landing page copy and images
- [ ] Update branding colors in `tailwind.config.ts`
- [ ] Add your logo to `public/`
- [ ] Test the subscription flow

### Before Production
- [ ] Review `DEPLOYMENT_CHECKLIST.md` thoroughly
- [ ] **DO NOT enable scanner execution** without proper security setup
- [ ] Set up proper scanner infrastructure (see `SCANNER_ARCHITECTURE.md`)
- [ ] Create Terms of Service and Privacy Policy
- [ ] Configure production environment variables

## Troubleshooting

### Build Errors
```bash
# Clear cache and rebuild
rm -rf .next node_modules
npm install
npm run build
```

### Firebase Connection Issues
- Verify all Firebase environment variables are correct
- Check that Firebase project is active
- Ensure billing is enabled (required for some Firebase features)

### Stripe Not Working
- Make sure you're using test keys (pk_test_ and sk_test_)
- Verify webhooks are configured
- Check Stripe Dashboard for errors

## Important Security Notes

⚠️ **The scanner functionality is currently a PROOF OF CONCEPT**

Before enabling actual scanner execution:
1. Read `SCANNER_ARCHITECTURE.md` thoroughly
2. Implement isolated scanner execution environment
3. Add proper input validation and rate limiting
4. Review all security considerations
5. Consult with security professionals

## Need Help?

- Check `README.md` for full documentation
- Review `SCANNER_ARCHITECTURE.md` for scanner details
- See `DEPLOYMENT_CHECKLIST.md` before going live

## Project Structure Quick Reference

```
src/
├── app/
│   ├── page.tsx              # Landing page
│   ├── app/dashboard/        # Scanner dashboard
│   ├── api/scans/           # Scanner API
│   └── login/               # Auth pages
├── components/
│   ├── sections/            # Landing page sections
│   └── shared/              # Reusable components
└── lib/
    ├── types/scanner.ts     # TypeScript types
    └── firebase/            # Firebase config
```

---

**You're all set!** Start customizing and building your security scanner SaaS! 🚀
