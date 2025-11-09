# Stripe Webhook Events Reference

**Application**: Irishette Booking Platform
**Last Updated**: January 2025
**Status**: Production Ready

---

## Overview

This document provides a comprehensive reference for all Stripe webhook events used in our application. We have **two separate Stripe webhook endpoints**:

1. **Custom Payment Webhook** - Handles booking payments and confirmations
2. **Better Auth Webhook** - Handles user account synchronization with Stripe

---

## Table of Contents

1. [Webhook Endpoints](#webhook-endpoints)
2. [Custom Payment Webhook Events](#custom-payment-webhook-events)
3. [Better Auth Webhook Events](#better-auth-webhook-events)
4. [Event Handling Matrix](#event-handling-matrix)
5. [Configuration Guide](#configuration-guide)
6. [Security](#security)
7. [Testing](#testing)
8. [Troubleshooting](#troubleshooting)

---

## Webhook Endpoints

### 1. Custom Payment Webhook

**Endpoint URL**: `https://<domain>/api/stripe/webhook`
**Purpose**: Handle booking payments, confirmations, and failures
**Handler**: `src/routes/api/stripe/$.ts`
**Secret**: `STRIPE_TRPC_WEBHOOK_SECRET`

### 2. Better Auth Webhook

**Endpoint URL**: `https://<domain>/api/auth/stripe/webhook`
**Purpose**: Sync user data between Stripe and Better Auth
**Handler**: Better Auth Stripe Plugin (built-in)
**Secret**: `STRIPE_BETTER_AUTH_WEBHOOK_SECRET`
**Documentation**: [Better Auth Stripe Plugin](https://www.better-auth.com/docs/plugins/stripe)

---

## Custom Payment Webhook Events

### Events We Handle

| Event | Priority | Purpose | Handler |
|-------|----------|---------|---------|
| `payment_intent.succeeded` | **REQUIRED** | Confirm booking payment | `handlePaymentIntentSucceeded` |
| `payment_intent.payment_failed` | **REQUIRED** | Log payment failures | `handlePaymentIntentFailed` |
| `checkout.session.completed` | Optional (Legacy) | Hosted checkout confirmation | `handleCheckoutCompleted` |
| `checkout.session.expired` | Optional (Legacy) | Cancel expired sessions | `handleCheckoutExpired` |

### Events We Ignore (Informational)

| Event | Reason | Action |
|-------|--------|--------|
| `charge.succeeded` | Child event of `payment_intent.succeeded` | Log & Ignore |
| `charge.updated` | Charge metadata updates | Log & Ignore |
| `charge.failed` | Child event of `payment_intent.payment_failed` | Log & Ignore |
| `mandate.updated` | Saved payment method updates | Log & Ignore |

---

### Event Details

#### 1. `payment_intent.succeeded` ✅ **REQUIRED**

**When Fired**: Payment successfully processed

**Data Contains**:
- Payment Intent ID
- Amount charged
- Customer ID
- Payment method details
- Metadata (bookingId, userId, roomId)

**What We Do**:
1. Retrieve booking by Payment Intent ID
2. Check if already confirmed (avoid duplicates)
3. If not confirmed:
   - Confirm booking in database
   - Update status to "confirmed"
   - Block room dates
   - Send confirmation emails (as backup)
4. If already confirmed:
   - Log and exit (no duplicate processing)

**Response**: `200 OK`

**Example Payload**:
```json
{
  "id": "evt_xxx",
  "type": "payment_intent.succeeded",
  "data": {
    "object": {
      "id": "pi_xxx",
      "amount": 20000,
      "currency": "usd",
      "status": "succeeded",
      "customer": "cus_xxx",
      "metadata": {
        "bookingId": "xxx",
        "userId": "xxx",
        "roomId": "xxx"
      }
    }
  }
}
```

---

#### 2. `payment_intent.payment_failed` ✅ **REQUIRED**

**When Fired**: Payment processing failed

**Data Contains**:
- Payment Intent ID
- Failure reason
- Error code
- Customer ID

**What We Do**:
1. Retrieve booking by Payment Intent ID
2. Log failure details
3. Keep booking in "pending" status (can retry)
4. Future: Could trigger retry logic or notification

**Response**: `200 OK`

**Example Payload**:
```json
{
  "id": "evt_xxx",
  "type": "payment_intent.payment_failed",
  "data": {
    "object": {
      "id": "pi_xxx",
      "status": "requires_payment_method",
      "last_payment_error": {
        "code": "card_declined",
        "message": "Your card was declined."
      }
    }
  }
}
```

---

#### 3. `checkout.session.completed` ⚪ Optional (Legacy)

**When Fired**: Hosted checkout session completed

**Data Contains**:
- Session ID
- Customer ID
- Payment Intent ID
- Line items

**What We Do**:
1. Retrieve booking by session ID
2. Confirm booking payment
3. Block room dates
4. Send confirmation emails
5. Send admin notification

**Response**: `200 OK`

**Note**: Only used if still supporting legacy hosted checkout flow

---

#### 4. `checkout.session.expired` ⚪ Optional (Legacy)

**When Fired**: Hosted checkout session expired (24 hours)

**Data Contains**:
- Session ID
- Expiration time

**What We Do**:
1. Retrieve booking by session ID
2. Update status to "cancelled"
3. Free up blocked dates

**Response**: `200 OK`

---

#### 5. Informational Events (Not Processed)

##### `charge.succeeded`
- **Relation**: Child event of `payment_intent.succeeded`
- **Purpose**: Accounting/reconciliation
- **Action**: Log and acknowledge (200 OK)

##### `charge.updated`
- **Relation**: Fraud checks, receipt generation
- **Purpose**: Updated charge metadata
- **Action**: Log and acknowledge (200 OK)

##### `charge.failed`
- **Relation**: Child event of `payment_intent.payment_failed`
- **Purpose**: Charge-level failure details
- **Action**: Log and acknowledge (200 OK)

##### `mandate.updated`
- **Relation**: Saved payment methods (Link, Apple Pay, Google Pay)
- **Purpose**: Customer saved card for future use
- **Action**: Log and acknowledge (200 OK)
- **Note**: Only relevant for subscriptions or saved payment methods

---

## Better Auth Webhook Events

### Overview

Better Auth's Stripe plugin handles user data synchronization between Stripe and your application. This is a **separate webhook** from our payment webhook.

**Documentation**: https://www.better-auth.com/docs/plugins/stripe

### Events Required by Better Auth

| Event | Purpose | Handled By |
|-------|---------|------------|
| `customer.created` | Create user record when Stripe customer created | Better Auth |
| `customer.updated` | Update user data when Stripe customer updated | Better Auth |
| `customer.deleted` | Handle customer deletion | Better Auth |

### What Better Auth Does

1. **Customer Created**:
   - Creates or links user account
   - Stores `stripeCustomerId` in user table
   - Syncs customer metadata

2. **Customer Updated**:
   - Updates user email if changed in Stripe
   - Syncs customer metadata
   - Updates user profile data

3. **Customer Deleted**:
   - Marks customer as deleted in database
   - Maintains data integrity

### Configuration

Better Auth webhook is configured in `src/lib/auth.ts`:

```typescript
import { stripe } from "better-auth/plugins";

export const auth = async () => {
  const stripeClient = new Stripe(env.STRIPE_SECRET_KEY);

  return betterAuth({
    plugins: [
      stripe({
        stripeClient,
        stripeWebhookSecret: env.STRIPE_BETTER_AUTH_WEBHOOK_SECRET,
        createCustomerOnSignUp: true,
      }),
    ],
  });
};
```

### Environment Variable

```bash
STRIPE_BETTER_AUTH_WEBHOOK_SECRET=whsec_xxx  # Different from payment webhook secret
```

---

## Event Handling Matrix

### Complete Event Overview

| Event | Webhook | Handler | Email Sent | Priority |
|-------|---------|---------|------------|----------|
| `payment_intent.succeeded` | Payment | `handlePaymentIntentSucceeded` | Yes (backup) | **REQUIRED** |
| `payment_intent.payment_failed` | Payment | `handlePaymentIntentFailed` | No | **REQUIRED** |
| `checkout.session.completed` | Payment | `handleCheckoutCompleted` | Yes | Optional |
| `checkout.session.expired` | Payment | `handleCheckoutExpired` | No | Optional |
| `charge.succeeded` | Payment | Log & Ignore | No | Informational |
| `charge.updated` | Payment | Log & Ignore | No | Informational |
| `charge.failed` | Payment | Log & Ignore | No | Informational |
| `mandate.updated` | Payment | Log & Ignore | No | Informational |
| `customer.created` | Better Auth | Better Auth Plugin | No | **REQUIRED** |
| `customer.updated` | Better Auth | Better Auth Plugin | No | **REQUIRED** |
| `customer.deleted` | Better Auth | Better Auth Plugin | No | **REQUIRED** |

---

## Configuration Guide

### Stripe Dashboard Setup

#### 1. Payment Webhook Configuration

1. Go to **Developers → Webhooks**
2. Click **Add endpoint**
3. Enter endpoint URL:
   ```
   https://your-domain.com/api/stripe/webhook
   ```
4. Select events to listen for:
   - ✅ `payment_intent.succeeded`
   - ✅ `payment_intent.payment_failed`
   - ⚪ `checkout.session.completed` (optional)
   - ⚪ `checkout.session.expired` (optional)
5. Click **Add endpoint**
6. Copy the **Signing secret** (starts with `whsec_`)
7. Add to environment: `STRIPE_TRPC_WEBHOOK_SECRET=whsec_xxx`

#### 2. Better Auth Webhook Configuration

1. Go to **Developers → Webhooks**
2. Click **Add endpoint**
3. Enter endpoint URL:
   ```
   https://your-domain.com/api/auth/stripe/webhook
   ```
4. Select events to listen for:
   - ✅ `customer.created`
   - ✅ `customer.updated`
   - ✅ `customer.deleted`
5. Click **Add endpoint**
6. Copy the **Signing secret** (starts with `whsec_`)
7. Add to environment: `STRIPE_BETTER_AUTH_WEBHOOK_SECRET=whsec_xxx`

### Environment Variables Summary

```bash
# Stripe API Keys
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxx

# Webhook Secrets (DIFFERENT FOR EACH WEBHOOK)
STRIPE_TRPC_WEBHOOK_SECRET=whsec_xxx          # Payment webhook
STRIPE_BETTER_AUTH_WEBHOOK_SECRET=whsec_yyy   # Better Auth webhook

# Other
BETTER_AUTH_URL=https://your-domain.com
RESEND_API_KEY=re_xxx
```

---

## Security

### Webhook Signature Verification

Both webhooks verify Stripe signatures to prevent spoofing:

**Payment Webhook**:
```typescript
const event = await stripe.webhooks.constructEventAsync(
  body,
  signature,
  env.STRIPE_TRPC_WEBHOOK_SECRET
);
```

**Better Auth Webhook**:
Handled automatically by Better Auth plugin

### Best Practices

1. ✅ **Use Different Signing Secrets** - Each webhook has its own secret
2. ✅ **Verify All Requests** - Reject requests without valid signature
3. ✅ **Use HTTPS** - Webhooks only work over HTTPS in production
4. ✅ **Log Failures** - Monitor webhook failures in Stripe Dashboard
5. ✅ **Idempotent Processing** - Handle duplicate events gracefully
6. ✅ **Return 200 Quickly** - Stripe retries if response takes >30 seconds

### Security Checks

- ✅ Content-Type validation
- ✅ Signature verification (cryptographic)
- ✅ Event structure validation (Zod schema)
- ✅ Timestamp verification (prevents replay attacks)

---

## Testing

### Local Testing with Stripe CLI

#### Install Stripe CLI
```bash
brew install stripe/stripe-cli/stripe
stripe login
```

#### Test Payment Webhook
```bash
# Forward webhooks to local dev
stripe listen --forward-to http://localhost:3000/api/stripe/webhook

# In another terminal, trigger test events
stripe trigger payment_intent.succeeded
stripe trigger payment_intent.payment_failed
stripe trigger checkout.session.completed
```

#### Test Better Auth Webhook
```bash
# Forward webhooks to local dev
stripe listen --forward-to http://localhost:3000/api/auth/stripe/webhook

# Trigger test events
stripe trigger customer.created
stripe trigger customer.updated
```

### Test Checklist

**Payment Webhook**:
- [ ] `payment_intent.succeeded` - Booking confirmed
- [ ] `payment_intent.payment_failed` - Failure logged
- [ ] No duplicate emails sent
- [ ] Webhook logs show "Already confirmed" for duplicates

**Better Auth Webhook**:
- [ ] `customer.created` - User linked to Stripe
- [ ] `customer.updated` - User email synced
- [ ] `stripeCustomerId` stored in database

---

## Troubleshooting

### Issue: Webhook Signature Verification Failed

**Causes**:
- Wrong webhook secret
- Request not from Stripe (spoofing attempt)
- Replay attack (timestamp too old)

**Solution**:
1. Verify webhook secret matches Stripe Dashboard
2. Check you're using the correct secret for each webhook
3. Regenerate webhook secret if compromised

---

### Issue: Events Not Being Received

**Causes**:
- Webhook URL incorrect
- Endpoint not publicly accessible
- Events not selected in Stripe Dashboard

**Solution**:
1. Verify webhook URL is correct
2. Test with Stripe CLI locally
3. Check Stripe Dashboard webhook logs
4. Ensure endpoint returns 200 OK

---

### Issue: Duplicate Email Sends

**Causes**:
- Frontend and webhook both sending emails
- Webhook not checking if already confirmed

**Solution**:
1. Check logs for "Already confirmed by frontend"
2. Verify webhook checks booking status first
3. Ensure 2-second delay between emails

---

### Issue: Customer Not Created in Database

**Causes**:
- Better Auth webhook not configured
- Wrong webhook secret
- Customer events not selected

**Solution**:
1. Verify Better Auth webhook endpoint exists
2. Check `STRIPE_BETTER_AUTH_WEBHOOK_SECRET` is set
3. Verify customer events selected in Stripe Dashboard
4. Check Better Auth plugin configuration

---

## Webhook Delivery

### Stripe Retry Logic

- Stripe retries failed webhooks automatically
- Retry schedule: 1 hour, 3 hours, 9 hours, 1 day, 3 days
- After all retries, webhook is marked as failed
- You can manually retry in Stripe Dashboard

### Best Practices

1. **Return 200 Quickly** - Acknowledge receipt immediately
2. **Process Asynchronously** - Don't block webhook response
3. **Handle Idempotency** - Same event may be sent multiple times
4. **Log Everything** - Essential for debugging
5. **Monitor Failures** - Set up alerts for failed webhooks

---

## Monitoring

### What to Monitor

**Payment Webhook**:
- Success rate of `payment_intent.succeeded` events
- Number of backup confirmations (webhook after frontend)
- Payment failure rates
- Duplicate processing (should be 0)

**Better Auth Webhook**:
- Customer creation success rate
- Email sync failures
- Customer deletion handling

### Stripe Dashboard

1. Go to **Developers → Webhooks**
2. Click your endpoint
3. View **Recent deliveries** tab
4. Check for failed events (red X)
5. Review response codes and timing

### Logs to Check

**Payment Webhook**:
```
✅ "Handling payment_intent.succeeded event (primary confirmation)"
✅ "Booking already confirmed by frontend - Skipping duplicate email sends"
✅ "Informational event received (no action needed): charge.succeeded"
```

**Better Auth Webhook**:
```
✅ "Customer created successfully"
✅ "Customer email synchronized"
```

---

## Event Flow Diagrams

### In-App Checkout Flow

```
User Completes Payment
        ↓
Frontend: confirmPayment tRPC
├─ Confirm booking
├─ Send guest email
├─ Wait 2 seconds
└─ Send admin email
        ↓
Webhook: payment_intent.succeeded
├─ Check: Already confirmed?
├─ YES: Log & Exit (no duplicates)
└─ NO: Process as backup
```

### Hosted Checkout Flow (Legacy)

```
User Completes Payment on Stripe
        ↓
Webhook: checkout.session.completed
├─ Confirm booking
├─ Send guest email
├─ Wait 2 seconds
└─ Send admin email
        ↓
User Redirected Back
```

### Customer Sync Flow

```
User Signs Up
        ↓
Create Stripe Customer
        ↓
Webhook: customer.created
├─ Link user to Stripe customer
└─ Store stripeCustomerId
        ↓
User Updates Email
        ↓
Update Stripe Customer
        ↓
Webhook: customer.updated
└─ Sync email to user table
```

---

## References

- [Stripe Webhooks Documentation](https://stripe.com/docs/webhooks)
- [Stripe Payment Intents](https://stripe.com/docs/api/payment_intents)
- [Stripe Checkout Sessions](https://stripe.com/docs/api/checkout/sessions)
- [Better Auth Stripe Plugin](https://www.better-auth.com/docs/plugins/stripe)
- [Webhook Best Practices](https://stripe.com/docs/webhooks/best-practices)

---

## Summary

### Two Webhooks, Two Purposes

1. **Payment Webhook** (`/api/stripe/webhook`)
   - Handles booking payments
   - Confirms bookings
   - Sends confirmation emails

2. **Better Auth Webhook** (`/api/auth/stripe/webhook`)
   - Syncs user data
   - Links Stripe customers
   - Maintains data consistency

### Events to Configure

**Payment Webhook** (Required):
- `payment_intent.succeeded`
- `payment_intent.payment_failed`

**Better Auth Webhook** (Required):
- `customer.created`
- `customer.updated`
- `customer.deleted`

### Key Takeaways

- ✅ Use separate webhook secrets for each endpoint
- ✅ Verify signatures on all requests
- ✅ Handle events idempotently
- ✅ Monitor webhook delivery in Stripe Dashboard
- ✅ Test locally with Stripe CLI
- ✅ Keep webhook responses under 30 seconds

---

**Last Updated**: January 2025
**Maintainer**: Development Team
**Status**: Production Ready ✅
