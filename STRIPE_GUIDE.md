# Stripe Integration - How It Works

## Overview

The FireSaaS template has **Stripe fully integrated** for subscription payments. Here's how it works:

## Architecture

```
┌─────────────┐
│   User      │
└──────┬──────┘
       │ 1. Visits pricing page
       ▼
┌─────────────────────┐
│  Next.js Frontend   │
│  Pricing Cards      │
└──────┬──────────────┘
       │ 2. Clicks "Subscribe"
       ▼
┌─────────────────────┐
│  Stripe Checkout    │ ◀─── Hosted by Stripe (secure)
│  Payment Form       │
└──────┬──────────────┘
       │ 3. Enters payment
       ▼
┌─────────────────────┐
│  Stripe Backend     │
└──────┬──────────────┘
       │ 4. Sends webhook event
       ▼
┌─────────────────────┐
│  Next.js API Route  │
│  /api/stripe/*      │
└──────┬──────────────┘
       │ 5. Updates Firestore
       ▼
┌─────────────────────┐
│  Firestore          │
│  customers/         │
│  subscriptions/     │
└─────────────────────┘
```

## Files Involved

### Frontend Components

**1. Subscription Card (`src/components/subscription/SubscriptionCard.tsx`)**
- Displays pricing plans
- "Subscribe" button triggers Stripe checkout

**2. Subscription Container (`src/components/subscription/SubscriptionCardContainer.tsx`)**
- Fetches products from Stripe
- Renders multiple pricing cards

### API Routes

**1. `/api/stripe/addCustomer`**
- Creates Stripe customer when user signs up
- Links Firebase user to Stripe customer

**2. `/api/stripe/portal`**
- Creates link to Stripe Customer Portal
- Allows users to manage subscriptions

**3. `/api/stripe/invoice` (webhook endpoint)**
- Receives events from Stripe
- Updates subscription status in Firestore

**4. `/api/products/route.ts`**
- Fetches available products from Stripe
- Used to display pricing on homepage

### Lib Functions

**1. `src/lib/stripe/fetchStripeProducts.ts`**
- Server-side function to get products
- Caches product data

**2. `src/lib/stripe/initStripe.ts`**
- Initializes Stripe SDK
- Uses secret key from environment

## Data Flow

### 1. User Subscribes

```typescript
// User clicks "Subscribe" button
<SubscriptionCard> 
  onClick → createCheckoutSession()
    ↓
  POST /api/stripe/checkout
    ↓
  Stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    line_items: [{ price: priceId }],
    mode: 'subscription',
    success_url: '/app/dashboard?success=true',
    cancel_url: '/?canceled=true'
  })
    ↓
  Redirect user to Stripe Checkout
    ↓
  User enters payment info
    ↓
  Stripe processes payment
    ↓
  Redirects to success_url
```

### 2. Stripe Webhook Updates Database

```typescript
// Stripe sends webhook to /api/stripe/invoice
webhook event → {
  type: 'customer.subscription.created',
  data: {
    id: 'sub_xxx',
    customer: 'cus_xxx',
    status: 'active',
    items: [...]
  }
}
    ↓
// API route verifies webhook signature
Stripe.webhooks.constructEvent(body, signature, webhookSecret)
    ↓
// Updates Firestore
firestore.collection('subscriptions').add({
  userId: userId,
  stripeSubscriptionId: subscription.id,
  status: 'active',
  priceId: subscription.items[0].price.id,
  currentPeriodEnd: subscription.current_period_end
})
    ↓
// User's subscription is now active
```

### 3. Checking Subscription Status

```typescript
// In your app, check if user has active subscription
const userDoc = await firestore
  .collection('users')
  .doc(userId)
  .get();

const subscriptionsSnapshot = await firestore
  .collection('subscriptions')
  .where('userId', '==', userId)
  .where('status', '==', 'active')
  .get();

if (!subscriptionsSnapshot.empty) {
  // User has active subscription
  // Allow access to premium features
}
```

## Firestore Collections Created

### `customers/{userId}`
```javascript
{
  stripeCustomerId: "cus_xxxxx",
  email: "user@example.com",
  createdAt: Timestamp
}
```

### `subscriptions/{subscriptionId}`
```javascript
{
  userId: "firebase_user_id",
  stripeSubscriptionId: "sub_xxxxx",
  status: "active", // or "canceled", "past_due", etc.
  priceId: "price_xxxxx",
  productId: "prod_xxxxx",
  currentPeriodEnd: Timestamp,
  cancelAtPeriodEnd: false
}
```

## Setup Steps

### 1. Get Stripe Keys

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Get API keys from **Developers > API keys**
3. Add to `.env`:

```bash
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."
STRIPE_SECRET_KEY="sk_test_..."
```

### 2. Create Products in Stripe

1. Go to **Products** in Stripe Dashboard
2. Click **Add Product**
3. Fill in:
   - Name: "Basic Plan"
   - Description: "Up to 10 scans per month"
   - Pricing: $29/month (or your price)
4. Repeat for each tier:
   - Basic: $29/month
   - Pro: $99/month
   - Enterprise: $299/month

### 3. Configure Webhooks

1. Go to **Developers > Webhooks**
2. Click **Add endpoint**
3. Endpoint URL: `https://yourdomain.com/api/stripe/invoice`
4. Select events to listen for:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Copy **Signing secret** (starts with `whsec_`)
6. Add to `.env`:

```bash
STRIPE_WEBHOOK_SECRET="whsec_..."
```

### 4. Test with Test Mode

Stripe has test mode - use test cards:
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- 3D Secure: `4000 0025 0000 3155`

Any future expiry date and any 3-digit CVC.

## How to Customize Pricing

### Option 1: Use Built-in Components

The app automatically fetches products from Stripe:

```tsx
// src/app/page.tsx
const { products } = await fetchStripeProducts();

<SubscriptionCardContainer 
  products={products}
  salesCall="Your sales message here"
/>
```

### Option 2: Use Stripe Pricing Table

Uncomment in `src/app/page.tsx`:

```tsx
<StripePricingTable
  pricingTableId="prctbl_..." // From Stripe dashboard
  publishableKey="pk_test_..."
/>
```

## Integrating with Scanner Limits

You can add scan limits based on subscription tier:

```typescript
// src/app/api/scans/route.ts

// Get user's subscription
const subscriptionSnapshot = await firestore
  .collection('subscriptions')
  .where('userId', '==', userId)
  .where('status', '==', 'active')
  .get();

if (subscriptionSnapshot.empty) {
  return NextResponse.json(
    { error: "Active subscription required" },
    { status: 403 }
  );
}

const subscription = subscriptionSnapshot.docs[0].data();

// Get product details to check limits
const product = await stripe.products.retrieve(subscription.productId);
const monthlyScans = product.metadata.monthly_scans || 10;

// Count user's scans this month
const startOfMonth = new Date();
startOfMonth.setDate(1);
startOfMonth.setHours(0, 0, 0, 0);

const monthlyScansSnapshot = await firestore
  .collection('scans')
  .where('userId', '==', userId)
  .where('createdAt', '>=', startOfMonth)
  .get();

if (monthlyScansSnapshot.size >= monthlyScans) {
  return NextResponse.json(
    { error: "Monthly scan limit reached" },
    { status: 429 }
  );
}

// Allow scan to proceed
```

## Adding Metadata to Products

In Stripe Dashboard, add metadata to products:

```
Product: "Basic Plan"
Metadata:
  monthly_scans: 10
  max_targets: 5
  scan_types: nmap

Product: "Pro Plan"
Metadata:
  monthly_scans: 100
  max_targets: 50
  scan_types: nmap,openvas

Product: "Enterprise Plan"  
Metadata:
  monthly_scans: unlimited
  max_targets: unlimited
  scan_types: nmap,openvas
  priority_support: true
```

## Customer Portal

Users can manage their subscription via Stripe Customer Portal:

```tsx
// Link in dashboard
<a href="/api/stripe/portal">
  Manage Subscription
</a>
```

This redirects to Stripe-hosted page where users can:
- Update payment method
- Cancel subscription
- View invoices
- Download receipts

## Webhook Events to Handle

The template handles these events in `/api/stripe/invoice`:

- `customer.subscription.created` - New subscription
- `customer.subscription.updated` - Plan changed
- `customer.subscription.deleted` - Subscription canceled
- `invoice.payment_succeeded` - Payment successful
- `invoice.payment_failed` - Payment failed

## Testing Webhooks Locally

Use Stripe CLI:

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/api/stripe/invoice

# Trigger test events
stripe trigger customer.subscription.created
```

## Production Checklist

- [ ] Switch from test keys to live keys
- [ ] Update webhook endpoint to production URL
- [ ] Create live products in Stripe
- [ ] Test complete purchase flow
- [ ] Verify webhook events are received
- [ ] Test subscription cancellation
- [ ] Test payment failure handling

## Summary

**What's already done**:
✅ Stripe SDK initialized
✅ Checkout flow implemented
✅ Webhook handler ready
✅ Customer portal integrated
✅ Product fetching working

**What you need to do**:
1. Add Stripe keys to `.env`
2. Create products in Stripe Dashboard
3. Configure webhook endpoint
4. Test with test credit cards
5. (Optional) Add scan limit logic based on subscription tier

**Stripe handles**:
- Payment processing
- PCI compliance
- Subscription billing
- Failed payment retries
- Customer portal
- Invoice generation

**Your app handles**:
- Displaying pricing
- Checking subscription status
- Enforcing limits based on plan
- Custom business logic
