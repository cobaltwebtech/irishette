# Stripe Webhook Security

**Last Updated:** 2025-11-05
**Status:** ✅ Production Ready

## Overview

This document details the security implementation for Stripe webhooks in the Irishette application. Stripe webhooks are HTTP callbacks that notify our application about events (e.g., successful payments, failed transactions) that occur in Stripe.

**Critical Security Requirement:** Webhooks must be authenticated because they're publicly accessible endpoints that handle sensitive payment data.

---

## Table of Contents

1. [Why Webhooks Need Special Security](#why-webhooks-need-special-security)
2. [Current Security Implementation](#current-security-implementation)
3. [How Stripe Signature Verification Works](#how-stripe-signature-verification-works)
4. [Security Measures in Place](#security-measures-in-place)
5. [Optional Enhancements](#optional-enhancements)
6. [Testing Webhooks Securely](#testing-webhooks-securely)
7. [Monitoring and Logging](#monitoring-and-logging)
8. [Troubleshooting](#troubleshooting)
9. [Best Practices](#best-practices)

---

## Why Webhooks Need Special Security

### The Challenge

Unlike user-facing endpoints, webhooks:
- **Cannot use user authentication** - Stripe doesn't have user credentials
- **Must be publicly accessible** - Stripe needs to reach them from their servers
- **Handle sensitive data** - Payment confirmations, customer information
- **Process irreversible actions** - Confirming bookings, sending emails

### The Risk

Without proper security, an attacker could:
```
❌ Forge webhook requests
❌ Trigger free bookings without payment
❌ Access customer data
❌ Cause duplicate bookings
❌ Spam confirmation emails
```

### The Solution

Stripe uses **cryptographic signature verification** - a mathematical proof that the request came from Stripe and hasn't been tampered with.

---

## Current Security Implementation

### Location
`src/routes/api/stripe/$.ts`

### Security Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Stripe Servers                            │
│  1. Create webhook event                                     │
│  2. Sign with secret key (HMAC-SHA256)                      │
│  3. Add signature to header                                  │
└─────────────────────────────────────────────────────────────┘
                            ↓ HTTPS
┌─────────────────────────────────────────────────────────────┐
│                  Your Webhook Endpoint                       │
│  1. Receive request with signature                           │
│  2. Verify signature using shared secret                     │
│  3. Reject if signature invalid                              │
│  4. Process if signature valid                               │
└─────────────────────────────────────────────────────────────┘
```

### Code Implementation

```typescript
// 1. Extract signature from headers
const signature = request.headers.get('stripe-signature');
if (!signature) {
  return new Response('Missing signature', { status: 400 });
}

// 2. Verify signature using Stripe SDK
const stripe = new Stripe(env.STRIPE_SECRET_KEY);
let event: Stripe.Event;

try {
  event = await stripe.webhooks.constructEventAsync(
    body,                              // Raw request body
    signature,                         // Stripe-Signature header
    env.STRIPE_TRPC_WEBHOOK_SECRET,   // Your webhook secret
  );
} catch (err) {
  // Signature verification failed - possible attack
  return new Response('Verification failed', { status: 400 });
}

// 3. Process verified event
// At this point, we KNOW this request is from Stripe
```

---

## How Stripe Signature Verification Works

### Step-by-Step Process

#### 1. Stripe Creates Signature

When Stripe sends a webhook:

```typescript
// Stripe's server (simplified):
const timestamp = Date.now() / 1000;
const payload = `${timestamp}.${JSON.stringify(event)}`;
const signature = hmac_sha256(payload, WEBHOOK_SECRET);

// Send to your endpoint:
headers: {
  'stripe-signature': `t=${timestamp},v1=${signature}`
}
```

#### 2. Your Server Verifies Signature

```typescript
// Your server:
1. Extract timestamp and signature from header
2. Reconstruct payload: `${timestamp}.${body}`
3. Compute expected signature: hmac_sha256(payload, YOUR_WEBHOOK_SECRET)
4. Compare expected vs received signature
5. Check timestamp (reject if >5 minutes old)
```

#### 3. Result

```typescript
if (signatures_match && timestamp_valid) {
  // ✅ Request is authentic and recent
  // Process the webhook
} else {
  // ❌ Possible attack or replay attempt
  // Reject the request
}
```

### Why This Is Secure

1. **Shared Secret**: Only you and Stripe know the webhook secret
2. **Cryptographic Hash**: Cannot be forged without the secret
3. **Timestamp**: Prevents replay attacks (old signatures are invalid)
4. **Tamper-Proof**: Any modification to the payload invalidates the signature

---

## Security Measures in Place

### ✅ Primary Security: Signature Verification

**Status:** Implemented
**Protection Level:** High

```typescript
// Cryptographically verifies request is from Stripe
event = await stripe.webhooks.constructEventAsync(
  body,
  signature,
  env.STRIPE_TRPC_WEBHOOK_SECRET,
);
```

**Protects Against:**
- Spoofed requests
- Tampered payloads
- Replay attacks
- Man-in-the-middle attacks

---

### ✅ POST-Only Requests

**Status:** Implemented
**Protection Level:** Basic

```typescript
handlers: {
  POST: async ({ request }) => {
    // Only accepts POST requests
    // GET/PUT/DELETE automatically rejected
  },
}
```

**Protects Against:**
- Accidental browser access
- Simple attack attempts
- CSRF (though signature is primary defense)

---

### ✅ Path Validation

**Status:** Implemented
**Protection Level:** Basic

```typescript
if (pathname.endsWith('/webhook')) {
  return handleStripeWebhook(request);
}
return new Response('Not Found', { status: 404 });
```

**Protects Against:**
- Requests to wrong paths
- API discovery attempts

---

### ✅ Content-Type Validation

**Status:** Implemented
**Protection Level:** Basic

```typescript
const contentType = request.headers.get('content-type');
if (!contentType?.includes('application/json')) {
  return new Response('Invalid content type', { status: 400 });
}
```

**Protects Against:**
- Malformed requests
- Non-JSON payloads

---

### ✅ Event Structure Validation

**Status:** Implemented
**Protection Level:** Medium

```typescript
const validatedEvent = stripeWebhookSchema.safeParse(event);
if (!validatedEvent.success) {
  return new Response('Invalid event structure', { status: 400 });
}
```

**Protects Against:**
- Unexpected event formats
- Missing required fields
- Type mismatches

---

### ✅ Error Handling

**Status:** Implemented
**Protection Level:** Medium

```typescript
} catch (error) {
  console.error('Webhook processing error:', error);
  return new Response('Webhook processing error', { status: 500 });
}
```

**Protects Against:**
- Information leakage
- Stack trace exposure
- Debug info in production

---

## Optional Enhancements

### 1. Rate Limiting

**Status:** Not Implemented (Optional)
**Complexity:** Medium
**Value:** Low (signature verification is primary defense)

```typescript
// Example using Cloudflare KV
const rateLimitKey = `webhook_rate:${clientIP}`;
const count = await env.KV.get(rateLimitKey);

if (count > 100) { // 100 requests per minute
  return new Response('Rate limit exceeded', { status: 429 });
}

await env.KV.put(rateLimitKey, (parseInt(count || '0') + 1).toString(), {
  expirationTtl: 60,
});
```

**Pros:**
- Prevents webhook spam
- Protects against DoS attempts

**Cons:**
- Adds latency
- Requires KV storage
- Legitimate burst traffic might be blocked

**Recommendation:** Not needed if signature verification is working correctly.

---

### 2. IP Allowlisting

**Status:** Not Implemented (Optional)
**Complexity:** Low
**Value:** Low (IPs can change)

```typescript
// Stripe's webhook IP ranges (as of 2025)
const stripeIPRanges = [
  '3.18.12.0/24',
  '3.130.192.0/24',
  '13.235.14.0/24',
  '13.235.122.0/24',
  '18.211.135.0/24',
  '35.154.171.0/24',
  '52.15.183.0/24',
  '54.88.130.0/24',
  '54.187.174.0/24',
  '54.187.205.0/24',
  '54.187.216.0/24',
  '54.241.31.0/24',
];

const clientIP = request.headers.get('cf-connecting-ip');
if (!isIPInRanges(clientIP, stripeIPRanges)) {
  return new Response('Forbidden', { status: 403 });
}
```

**Pros:**
- Additional layer of defense
- Blocks non-Stripe IPs immediately

**Cons:**
- Stripe IPs can change (requires updates)
- Signature verification is more reliable
- Maintenance overhead

**Recommendation:** Signature verification is sufficient.

---

### 3. Idempotency Tracking

**Status:** Recommended (Not Yet Implemented)
**Complexity:** Medium
**Value:** High

```typescript
// Store processed event IDs to prevent duplicate processing
const eventId = event.id;
const alreadyProcessed = await db
  .select()
  .from(processedWebhooks)
  .where(eq(processedWebhooks.eventId, eventId));

if (alreadyProcessed.length > 0) {
  console.log('Event already processed:', eventId);
  return new Response('Event already processed', { status: 200 });
}

// Process event
await handleCheckoutCompleted(event, paymentService);

// Mark as processed
await db.insert(processedWebhooks).values({
  eventId,
  eventType: event.type,
  processedAt: new Date(),
});
```

**Pros:**
- Prevents duplicate bookings
- Handles retry scenarios gracefully
- Industry best practice

**Cons:**
- Requires database schema changes
- Adds slight latency

**Recommendation:** Implement this for production systems.

---

### 4. Webhook Endpoint Monitoring

**Status:** Recommended (Partially Implemented)
**Complexity:** Low
**Value:** High

```typescript
// Log all webhook attempts
console.log('Webhook received:', {
  eventId: event.id,
  eventType: event.type,
  timestamp: new Date().toISOString(),
  success: true,
});

// Optional: Send to monitoring service
await sendToMonitoring({
  service: 'stripe-webhook',
  status: 'success',
  eventType: event.type,
  processingTime: Date.now() - startTime,
});
```

**Recommended Metrics:**
- Total webhook attempts
- Success vs failure rate
- Processing time
- Event type distribution
- Failed signature verifications (possible attacks)

---

## Testing Webhooks Securely

### Local Development

#### 1. Use Stripe CLI

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

#### 2. Update Environment Variables

```bash
# Use the webhook signing secret from Stripe CLI output
STRIPE_TRPC_WEBHOOK_SECRET=whsec_xxxxx_local
```

#### 3. Trigger Test Events

```bash
# Test successful payment
stripe trigger checkout.session.completed

# Test failed payment
stripe trigger payment_intent.payment_failed
```

### Testing Signature Verification

```typescript
// Test invalid signature (should fail)
const response = await fetch('http://localhost:3000/api/stripe/webhook', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'stripe-signature': 'invalid_signature',
  },
  body: JSON.stringify({ /* valid payload */ }),
});

expect(response.status).toBe(400);
expect(await response.text()).toContain('verification failed');
```

### Production Testing

**⚠️ Never test with production webhook secret in local environment**

1. Use Stripe's test mode
2. Use separate webhook endpoints for test/production
3. Monitor Stripe Dashboard for webhook delivery status

---

## Monitoring and Logging

### What to Log

```typescript
// ✅ Log successful webhooks
console.log('Webhook processe
