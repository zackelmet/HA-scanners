# Production Deployment Checklist

## ⚠️ Critical Security Items (MUST DO BEFORE PRODUCTION)

### Scanner Security
- [ ] **Isolate scanner execution** - DO NOT run scans directly in Firebase Functions
- [ ] Set up dedicated Cloud Run or Compute Engine instances for scanner execution
- [ ] Implement Docker containerization for Nmap/OpenVAS
- [ ] Add network isolation for scanner containers
- [ ] Implement scan timeout limits (recommend 15 minutes max)
- [ ] Add memory and CPU limits per scan
- [ ] Implement scan queue with concurrency limits

### Input Validation & Authorization
- [ ] Validate all scan targets (IP/domain format)
- [ ] Block scanning of private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8)
- [ ] Implement target verification/authorization system
- [ ] Add CAPTCHA to scan submission
- [ ] Rate limit API endpoints (recommend: 10 scans/hour per user)
- [ ] Implement cooldown period between scans (recommend: 5 minutes)
- [ ] Log all scan activities for audit trail

### Firestore Security
- [ ] Review and test Firestore security rules
- [ ] Ensure users can only access their own scans
- [ ] Restrict scanQueue collection to Cloud Functions only
- [ ] Enable Firestore audit logging
- [ ] Set up Firestore backup schedule

### Authentication & Authorization
- [ ] Enable multi-factor authentication option
- [ ] Implement email verification requirement
- [ ] Add account suspension mechanism for abuse
- [ ] Set password requirements (min length, complexity)
- [ ] Configure session timeout
- [ ] Add account lockout after failed login attempts

## 📝 Configuration

### Environment Variables
- [ ] Set production Firebase credentials
- [ ] Add production Stripe keys (live, not test)
- [ ] Configure production site URL
- [ ] Add production Mixpanel token (if using)
- [ ] Set strong secrets for any API keys
- [ ] Review all environment variables for sensitive data

### Firebase
- [ ] Deploy Firestore security rules
- [ ] Deploy Firebase Functions
- [ ] Configure Firebase App Check
- [ ] Set up Cloud Functions scaling limits
- [ ] Enable Firebase monitoring and alerts
- [ ] Configure Firebase billing alerts

### Stripe
- [ ] Create production products and pricing
- [ ] Set up webhooks for subscription events
- [ ] Configure webhook signing secret
- [ ] Test subscription lifecycle (create, update, cancel)
- [ ] Set up payment failure notifications
- [ ] Configure customer portal settings

## 🚀 Deployment

### Pre-Deployment
- [ ] Run all tests: `npm test`
- [ ] Build production bundle: `npm run build`
- [ ] Test production build locally: `npm start`
- [ ] Review and update dependencies
- [ ] Run security audit: `npm audit`
- [ ] Check for any console.log statements (remove or disable)

### Vercel/Next.js Deployment
- [ ] Connect GitHub repository to Vercel
- [ ] Add all environment variables to Vercel
- [ ] Configure custom domain
- [ ] Set up SSL certificate (auto via Vercel)
- [ ] Test deployment preview
- [ ] Deploy to production

### Post-Deployment
- [ ] Test user registration flow
- [ ] Test login/logout
- [ ] Test subscription purchase
- [ ] Test scan creation (but DON'T run real scans until scanner security is implemented)
- [ ] Verify Firebase Functions are triggered correctly
- [ ] Check all API endpoints are working
- [ ] Test mobile responsiveness

## 📊 Monitoring & Analytics

### Monitoring Setup
- [ ] Set up uptime monitoring (e.g., UptimeRobot, Pingdom)
- [ ] Configure error tracking (e.g., Sentry)
- [ ] Set up Firebase Performance Monitoring
- [ ] Configure Cloud Functions logs and alerts
- [ ] Set up billing alerts for Firebase and GCP
- [ ] Monitor scan queue length and processing time

### Analytics
- [ ] Verify Mixpanel events are tracking
- [ ] Set up Google Analytics (optional)
- [ ] Configure conversion tracking
- [ ] Set up custom dashboard for key metrics

## 📋 Legal & Compliance

### Legal Pages
- [ ] Create Terms of Service (include scanning limitations)
- [ ] Create Privacy Policy (GDPR, CCPA compliant)
- [ ] Create Acceptable Use Policy (explicitly forbid unauthorized scanning)
- [ ] Add disclaimer about legal responsibility
- [ ] Create Refund Policy (mention 7-day guarantee)

### Compliance
- [ ] Ensure GDPR compliance for EU users
- [ ] Add cookie consent banner if using analytics
- [ ] Implement data export functionality for users
- [ ] Implement account deletion functionality
- [ ] Create incident response plan

## 🎨 Final Polish

### Content
- [ ] Review all copy for typos
- [ ] Update meta descriptions and titles
- [ ] Add social media preview images
- [ ] Create favicon and app icons
- [ ] Add robots.txt configuration

### SEO
- [ ] Submit sitemap to Google Search Console
- [ ] Configure structured data markup
- [ ] Optimize page load speed
- [ ] Test mobile-friendliness
- [ ] Add canonical URLs

### Email
- [ ] Set up transactional email service (SendGrid, Postmark, etc.)
- [ ] Create email templates for:
  - [ ] Welcome email
  - [ ] Scan completion notification
  - [ ] Subscription confirmation
  - [ ] Payment failure notice
  - [ ] Password reset

## 🔄 Ongoing Maintenance

### Regular Tasks
- [ ] Monitor scan abuse patterns
- [ ] Review and respond to user feedback
- [ ] Update scanner tools (Nmap, OpenVAS) versions
- [ ] Apply security patches promptly
- [ ] Review Firebase and Stripe usage costs
- [ ] Backup critical data regularly

### Quarterly Reviews
- [ ] Review security posture
- [ ] Audit user accounts for suspicious activity
- [ ] Review and update pricing if needed
- [ ] Analyze user metrics and retention
- [ ] Update dependencies and frameworks

## ⚠️ CRITICAL: Scanner Implementation Warning

**The current scanner implementation is a PROOF OF CONCEPT only!**

Before enabling scan execution in production:

1. **Implement proper scanner infrastructure:**
   - Dedicated isolated compute instances
   - Container-based execution (Docker)
   - Network segmentation
   - Resource limits and quotas

2. **Add comprehensive security controls:**
   - Target authorization system
   - Abuse detection and prevention
   - Rate limiting at multiple levels
   - Comprehensive audit logging

3. **Legal review:**
   - Consult with legal counsel about liability
   - Ensure Terms of Service protect your business
   - Consider requiring user verification before enabling scanning
   - Implement reporting mechanism for abuse

**DO NOT enable scan execution until these security measures are in place!**

---

## Sign-off

- [ ] All critical security items completed
- [ ] All deployment steps completed
- [ ] All monitoring configured
- [ ] Legal pages created and reviewed
- [ ] Team trained on incident response
- [ ] Emergency contact list created

**Production ready date:** _________________

**Reviewed by:** _________________
