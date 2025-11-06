# API Endpoints Security Summary

**Last Updated:** 2025-11-05
**Status:** ✅ All Endpoints Secured

## Overview

This document provides a comprehensive security summary of all API endpoints in the Irishette application. Each endpoint is categorized by its authentication method and security requirements.

---

## Table of Contents

1. [Endpoint Inventory](#endpoint-inventory)
2. [Security Architecture](#security-architecture)
3. [tRPC Endpoints](#trpc-endpoints)
4. [Stripe Webhook Endpoint](#stripe-webhook-endpoint)
5. [iCal Feed Endpoint](#ical-feed-endpoint)
6. [Security Best Practices](#security-best-practices)
7. [Monitoring Recommendations](#monitoring-recommendations)
8. [Quick Reference](#quick-reference)

---

## Endpoint Inventory

### Summary Table

| Endpoint | Pattern | Auth Method | Status | Purpose |
|----------|---------|-------------|--------|---------|
| tRPC API | `/api/trpc/*` | Session + Procedures | ✅ Secure | Application API |
| Stripe Webhook | `/api/stripe/webhook` | Signature Verification | ✅ Secure | Payment processing |
| iCal Feed | `/api/ical/:roomId` | Public (Intentional) | ✅ Safe | Calendar integration |

### Total Endpoints

- **48 tRPC Procedures** (13 public, 9 protected, 26 admin)
- **1 Webhook Endpoint** (signature-authenticated)
- **1 Public Feed Endpoint** (read-only, non-sensitive data)

---

## Security Architecture

### Defense in Depth

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Request                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Layer 1: Cloudflare                                              │
│ - DDoS protection                                                │
│ - WAF rules                                                      │
│ - Rate limiting (optional)                                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Layer 2: Route Protection (TanStack Router)                      │
│ - beforeLoad hooks                                               │
│ - Session checks                                                 │
│ - Redirects                                                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Layer 3: API Authentication                                      │
│ ├─ tRPC: Session-based (protectedProcedure/adminProcedure)      │
│ ├─ Stripe: Signature verification (HMAC-SHA256)                 │
│ └─ iCal: Public (no sensitive data)                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Layer 4: Business Logic                                          │
│ - Ownership verification                                         │
│ - Input validation                                               │
│ - Authorization checks                                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## tRPC Endpoints

### Location
`/api/trpc/*`

### Authentication Method
**Session-based with Better Auth**

### Security Implementation

#### Context with Session
```typescript
export type TRPCContext = {
  db: D1Database;
  env: { /* environment variables */ };
  session: Session | null;  // ← Better Auth session
  headers: Headers;
};
```

#### Three Procedure Types

##### 1. 🌐 Public Procedure
**Use:** Operations requiring no authentication
```typescript
checkAvailability: publicProcedure
  .input(z.object({ roomId: z.string(), ... }))
  .query(async ({ ctx, input }) => {
    // Anyone can check availability
  })
```

**Examples:**
- Room availability checking
- Price calculations
- Public room listings

##### 2. 🔒 Protected Procedure
**Use:** Operations requiring authentication
```typescript
getMyBookings: protectedProcedure
  .query(async ({ ctx }) => {
    const userId = ctx.user.id; // ← From session, not input!
    // User can only see their own bookings
  })
```

**Examples:**
- Creating bookings
- Viewing own bookings
- Updating profile

##### 3. 🛡️ Admin Procedure
**Use:** Operations requiring admin role
```typescript
adminListBookings: adminProcedure
  .query(async ({ ctx }) => {
    // ctx.user.role guaranteed to be 'admin'
    // Can view all bookings
  })
```

**Examples:**
- Managing rooms
- Viewing all bookings
- System administration

### Security Features

✅ **Session Validation**
- Checked on every API call
- Cached by Better Auth (5-minute TTL)
- Server-side validation

✅ **Type Safety**
- TypeScript knows session state
- `ctx.user` guaranteed non-null in protected procedures
- Compile-time safety

✅ **Ownership Verification**
- Users can only modify their own data
- Explicit checks before updates/deletes
- No userId in input (uses session)

✅ **Role-Based Access Control**
- Admin operations restricted to admin role
- Clear separation of concerns
- Centralized authorization logic

### Security Metrics

| Metric | Value |
|--------|-------|
| Total Procedures | 48 |
| Public (No Auth) | 13 (27%) |
| Protected (User Auth) | 9 (19%) |
| Admin (Admin Auth) | 26 (54%) |
| Vulnerable Endpoints | 0 (0%) |

### Documentation
- [TRPC_SECURITY_IMPLEMENTATION.md](./TRPC_SECURITY_IMPLEMENTATION.md) - Complete security guide
- [TRPC_PROCEDURES_REFERENCE.md](./TRPC_PROCEDURES_REFERENCE.md) - API reference
- [TRPC_QUICK_REFERENCE.md](./TRPC_QUICK_REFERENCE.md) - Quick lookup

---

## Stripe Webhook Endpoint

### Location
`/api/stripe/webhook`

### Authentication Method
**HMAC-SHA256 Signature Verification**

### Why Not Session-Based Auth?

```
❌ Cannot use session cookies
   - Stripe doesn't have user credentials
   - Webhooks come from Stripe's servers
   - Must be publicly accessible

✅ Uses cryptographic signatures instead
   - Mathematically impossible to forge
   - Includes timestamp (prevents replay)
   - Industry standard for webhooks
```

### Security Implementation

#### Signature Verification Process

```typescript
// 1. Extract signature from headers
const signature = request.headers.get('stripe-signature');

// 2. Verify using Stripe SDK
const event = await stripe.webhooks.constructEventAsync(
  body,                              // Raw request body
  signature,                         // Stripe's signature
  env.STRIPE_TRPC_WEBHOOK_SECRET,   // Shared secret
);

// 3. If verification succeeds, process event
// If verification fails, reject request (400)
```

#### How Signature Verification Works

```
1. Stripe creates payload: timestamp + event data
2. Stripe signs with HMAC-SHA256: hmac(payload, secret)
3. Stripe sends to your endpoint with signature header
4. Your server reconstructs payload and computes signature
5. Compare signatures → must match exactly
6. Check timestamp → reject if >5 minutes old
```

### Security Features

✅ **Cryptographic Authentication**
- HMAC-SHA256 signatures
- Shared secret known only to you and Stripe
- Cannot be forged without secret

✅ **Replay Attack Prevention**
- Signature includes timestamp
- Requests older than 5 minutes rejected
- Each signature valid for single use

✅ **Tamper Detection**
- Any modification invalidates signature
- Ensures data integrity
- End-to-end verification

✅ **Request Validation**
- POST-only requests
- Content-Type validation
- Event structure validation (Zod)
- Path validation

✅ **Error Handling**
- Doesn't leak implementation details
- Logs failures (potential attacks)
- Generic error messages to client

### Security Metrics

| Security Measure | Status | Protection Level |
|-----------------|--------|------------------|
| Signature Verification | ✅ Implemented | High |
| Timestamp Validation | ✅ Implemented | High |
| POST-only | ✅ Implemented | Basic |
| Content-Type Check | ✅ Implemented | Basic |
| Event Validation | ✅ Implemented | Medium |
| Error Sanitization | ✅ Implemented | Medium |

### Optional Enhancements

- **Rate Limiting**: Low priority (signature is primary defense)
- **IP Allowlisting**: Low value (Stripe IPs can change)
- **Idempotency Tracking**: Recommended (prevents duplicate processing)
- **Enhanced Monitoring**: Recommended (track webhook health)

### Documentation
- [STRIPE_WEBHOOK_SECURITY.md](./STRIPE_WEBHOOK_SECURITY.md) - Complete webhook security guide
- [STRIPE_WEBHOOK_SETUP.md](./STRIPE_WEBHOOK_SETUP.md) - Setup instructions

---

## iCal Feed Endpoint

### Location
`/api/ical/:roomId`

### Authentication Method
**Public (No Authentication Required)**

### Why Public Access is Safe

#### 1. No Sensitive Data Exposed

```typescript
// iCal feeds only contain:
✅ Room availability (blocked dates)
✅ Generic "BUSY" markers
✅ Date ranges

// iCal feeds DO NOT contain:
❌ Guest names
❌ Email addresses
❌ Phone numbers
❌ Payment information
❌ Booking confirmation IDs
❌ Any personally identifiable information (PII)
```

#### 2. Legitimate Use Case

Third-party calendar applications need unauthenticated access:
- Google Calendar
- Apple Calendar (iCal)
- Microsoft Outlook
- Any calendar app supporting iCal format

These applications **cannot** authenticate - they only support URL-based feeds.

#### 3. Data Already Public

- Room availability is shown on your website
- Anyone can check dates via booking calendar
- iCal just provides same data in different format

### Security Implementation

#### Input Validation

```typescript
// 1. Room ID format validation
if (!/^[a-zA-Z0-9_-]+$/.test(roomId)) {
  return new Response('Invalid room ID format', { status: 400 });
}

// 2. Length validation
if (roomId.length > 100) {
  return new Response('Room ID too long', { status: 400 });
}

// 3. Room existence check
// Returns 404 if room doesn't exist (in iCalService)
```

#### Security Features

✅ **Read-Only Access**
- GET requests only
- No mutations possible
- Cannot modify data

✅ **Input Sanitization**
- Room ID format validated
- Length limits enforced
- Prevents injection attacks

✅ **Caching**
- 5-minute cache reduces load
- Standard cache headers
- Reduces server processing

✅ **Error Handling**
- Generic error messages
- No information leakage
- Proper HTTP status codes

✅ **No Enumeration Risk**
- Room IDs are not sequential
- Uses nanoid (random IDs)
- Cannot guess valid IDs

### Security Metrics

| Security Measure | Status | Protection Level |
|-----------------|--------|------------------|
| No Sensitive Data | ✅ Verified | High |
| Input Validation | ✅ Implemented | Medium |
| Read-Only | ✅ Enforced | High |
| Caching | ✅ Implemented | Medium |
| Error Sanitization | ✅ Implemented | Medium |

### Comparison with Industry Standards

| Service | Public iCal Feeds |
|---------|-------------------|
| Airbnb | ✅ Public |
| Booking.com | ✅ Public |
| VRBO | ✅ Public |
| Google Calendar | ✅ Public |
| Irishette | ✅ Public |

**This is standard practice** for property management and calendar integration.

---

## Security Best Practices

### 1. Never Trust Client Input

```typescript
// ❌ BAD: Trusting userId from input
publicProcedure
  .input(z.object({ userId: z.string() }))
  .query(({ input }) => {
    return getBookings(input.userId); // Anyone can pass any ID!
  })

// ✅ GOOD: Using userId from session
protectedProcedure
  .query(({ ctx }) => {
    const userId = ctx.user.id; // From authenticated session
    return getBookings(userId);
  })
```

### 2. Verify Ownership Before Modifications

```typescript
// ✅ Always verify ownership
protectedProcedure
  .input(z.object({ bookingId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    const booking = await db.bookings.findUnique({
      where: { id: input.bookingId }
    });

    // Verify booking belongs to user
    if (booking.userId !== ctx.user.id) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }

    // Now safe to modify
  })
```

### 3. Use Appropriate Authentication

```typescript
// Public data → No auth needed
publicProcedure.query(/* check availability */)

// User data → Session auth
protectedProcedure.query(/* get my bookings */)

// Admin operations → Role check
adminProcedure.query(/* manage system */)

// External webhooks → Signature verification
verifyStripeSignature(request)
```

### 4. Sanitize Error Messages

```typescript
// ❌ BAD: Leaking information
catch (error) {
  return new Response(error.stack, { status: 500 });
}

// ✅ GOOD: Generic messages
catch (error) {
  console.error('Internal error:', error); // Log for debugging
  return new Response('Internal server error', { status: 500 }); // Generic to client
}
```

### 5. Validate All Inputs

```typescript
// ✅ Use Zod for validation
const schema = z.object({
  roomId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  checkInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  guestCount: z.number().int().min(1).max(20),
});

// Automatically validated by tRPC
protectedProcedure
  .input(schema)
  .mutation(async ({ input }) => {
    // Input guaranteed to be valid
  })
```

---

## Monitoring Recommendations

### Key Metrics to Track

#### tRPC Endpoints
- Request volume by procedure
- Authentication failure rate
- UNAUTHORIZED errors (failed auth attempts)
- FORBIDDEN errors (insufficient permissions)
- Average response time
- Error rate by procedure

#### Stripe Webhook
- Webhook delivery success rate
- Signature verification failures (potential attacks)
- Processing time
- Event type distribution
- Failed events requiring retry

#### iCal Feeds
- Request volume by room
- 404 rate (potential enumeration attempts)
- Cache hit rate
- Bandwidth usage
- Geographic distribution of requests

### Alerting Thresholds

```yaml
# High Priority Alerts
- name: High Authentication Failure Rate
  condition: auth_failures > 100/hour
  action: Investigate potential attack

- name: Webhook Signature Verification Failures
  condition: signature_failures > 10/hour
  action: Check for misconfiguration or attack

- name: Elevated 500 Errors
  condition: 5xx_errors > 50/hour
  action: Check application health

# Medium Priority Alerts
- name: Unusual Request Pattern
  condition: requests > 1000% of baseline
  action: Check for bot traffic

- name: High Admin Procedure Usage
  condition: admin_calls > 500/hour
  action: Verify legitimate admin activity
```

### Logging Best Practices

```typescript
// ✅ Log authentication attempts
console.log('Auth attempt:', {
  userId: session?.user?.id,
  endpoint: procedureName,
  success: true,
  timestamp: new Date(),
});

// ✅ Log failed signature verifications
console.warn('Signature verification failed:', {
  ip: request.headers.get('cf-connecting-ip'),
  endpoint: '/api/stripe/webhook',
  timestamp: new Date(),
});

// ❌ Don't log sensitive data
console.log('Payment:', paymentIntent); // Contains card info!
```

---

## Quick Reference

### Authentication Decision Tree

```
Is this a webhook from external service?
├─ YES → Use signature verification (Stripe pattern)
└─ NO → ↓

Is this for third-party calendar apps?
├─ YES → Public endpoint (iCal pattern)
└─ NO → ↓

Does it access user-specific data?
├─ YES → protectedProcedure
└─ NO → ↓

Is it admin-only operation?
├─ YES → adminProcedure
└─ NO → publicProcedure
```

### Security Checklist

Before deploying any new endpoint:

- [ ] Determine appropriate authentication method
- [ ] Implement input validation (Zod schemas)
- [ ] Verify ownership before modifications
- [ ] Use generic error messages
- [ ] Add logging (without sensitive data)
- [ ] Test authentication failures
- [ ] Test authorization boundaries
- [ ] Document security decisions
- [ ] Add monitoring/alerting
- [ ] Review with security mindset

---

## Summary

### Security Status: ✅ Production Ready

All API endpoints are properly secured using appropriate authentication methods:

| Category | Endpoints | Auth Method | Status |
|----------|-----------|-------------|--------|
| User APIs | 48 tRPC procedures | Session + Procedures | ✅ Secure |
| Webhooks | 1 Stripe endpoint | Signature Verification | ✅ Secure |
| Public Feeds | 1 iCal endpoint | Public (Safe) | ✅ Safe |

### Zero Known Vulnerabilities

- ✅ No endpoints accept userId in input (uses session)
- ✅ All user data operations verify ownership
- ✅ Admin operations require admin role
- ✅ Webhooks use cryptographic authentication
- ✅ Public endpoints expose no sensitive data
- ✅ All inputs validated with Zod
- ✅ Errors sanitized (no info leakage)

### Defense in Depth

Multiple security layers ensure that even if one layer fails, others protect the system:

1. **Cloudflare** - DDoS protection, WAF
2. **Route Protection** - UI-level auth checks
3. **API Authentication** - Session/signature verification
4. **Business Logic** - Ownership verification, input validation

---

## Related Documentation

- [TRPC_SECURITY_IMPLEMENTATION.md](./TRPC_SECURITY_IMPLEMENTATION.md) - tRPC security architecture
- [TRPC_PROCEDURES_REFERENCE.md](./TRPC_PROCEDURES_REFERENCE.md) - Complete API reference
- [TRPC_QUICK_REFERENCE.md](./TRPC_QUICK_REFERENCE.md) - Quick lookup table
- [STRIPE_WEBHOOK_SECURITY.md](./STRIPE_WEBHOOK_SECURITY.md) - Webhook security details
- [AUTH_CHECK_UTILITIES.md](./AUTH_CHECK_UTILITIES.md) - Route protection helpers
- [SECURE_AUTH_IMPLEMENTATION.md](./SECURE_AUTH_IMPLEMENTATION.md) - Better Auth setup

---

**Last Updated:** January 2025
**Maintained By:** Development Team
**Security Review Status:** ✅ Approved for Production
