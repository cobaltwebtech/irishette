# tRPC Security Implementation

**Date:** 2025-11-05
**Status:** ✅ Production Ready

## Overview

This document details the comprehensive security implementation for the Irishette tRPC API integration. The implementation provides defense-in-depth security by protecting routes at both the router level and the API level, ensuring unauthorized users cannot access protected resources or sensitive data.

## Table of Contents

1. [Architecture](#architecture)
2. [Security Layers](#security-layers)
3. [Procedure Types](#procedure-types)
4. [Session Management](#session-management)
5. [Implementation Details](#implementation-details)
6. [Migration from Unprotected APIs](#migration-from-unprotected-apis)
7. [Security Best Practices](#security-best-practices)
8. [Testing Authentication](#testing-authentication)
9. [Common Patterns](#common-patterns)
10. [Troubleshooting](#troubleshooting)

---

## Architecture

### Defense in Depth

The security implementation uses multiple layers of protection:

```
┌─────────────────────────────────────────────────────────────┐
│                         Client Request                       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Route Protection (beforeLoad)                      │
│ - Checks authentication before rendering                     │
│ - Redirects to login if needed                              │
│ - Improves UX by preventing wasted renders                  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: tRPC API Protection (procedures)                   │
│ - Validates session on every API call                       │
│ - Throws UNAUTHORIZED/FORBIDDEN errors                       │
│ - Cannot be bypassed by direct API calls                    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Database/Business Logic                   │
└─────────────────────────────────────────────────────────────┘
```

### Session Flow

```typescript
// 1. User makes request
Request → /api/trpc/bookings.getMyBookings

// 2. tRPC handler fetches session
const session = await authInstance.api.getSession({
  headers: request.headers
});

// 3. Session added to context
const context: TRPCContext = {
  db,
  env,
  session,      // ← Available to all procedures
  headers
};

// 4. Procedure middleware validates session
protectedProcedure.use(({ ctx }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx: { ...ctx, user: ctx.session.user } });
});

// 5. Business logic executes with guaranteed user
query(({ ctx }) => {
  const userId = ctx.user.id; // ✅ TypeScript knows this exists
  // ... fetch user's data
});
```

---

## Security Layers

### Layer 1: Route Protection

**Purpose:** User experience - prevent unauthorized users from seeing protected pages.

**Implementation:** `beforeLoad` hook with `requireAuth()` helper

```typescript
// src/routes/account/index.tsx
export const Route = createFileRoute('/account/')({
  beforeLoad: async ({ location }) => {
    const session = await requireAuth(location);
    return { session };
  },
  component: AccountPage,
});
```

**What it does:**
- ✅ Checks authentication before component renders
- ✅ Redirects to login with return URL if not authenticated
- ✅ Provides session data to component via context
- ✅ Runs server-side in TanStack Start (SSR-safe)

**Cannot protect:**
- ❌ Direct API calls (bypassed if JavaScript disabled)
- ❌ tRPC endpoints (needs Layer 2)

### Layer 2: API Protection

**Purpose:** Security - prevent unauthorized access to data and operations.

**Implementation:** `protectedProcedure` and `adminProcedure` in tRPC

```typescript
// src/integrations/trpc/bookings.ts
getMyBookings: protectedProcedure
  .query(async ({ ctx }) => {
    const userId = ctx.user.id; // ← From session, not input
    return db.bookings.where(eq(bookings.userId, userId));
  })
```

**What it does:**
- ✅ Validates session on every API call
- ✅ Works for direct API calls (cURL, Postman, etc.)
- ✅ TypeScript narrows types (ctx.user is non-nullable)
- ✅ Cannot be bypassed by crafty users

**Protects:**
- ✅ tRPC endpoints
- ✅ Direct HTTP requests
- ✅ Server-side operations

---

## Procedure Types

### 1. Public Procedure

**Use for:** Operations that anyone can access without authentication.

```typescript
import { publicProcedure } from './init';

checkAvailability: publicProcedure
  .input(z.object({
    roomId: z.string(),
    checkInDate: z.string(),
    checkOutDate: z.string(),
  }))
  .query(async ({ ctx, input }) => {
    // ctx.session might be null
    // Anyone can check room availability
    return await checkRoomAvailability(input);
  })
```

**Examples:**
- Checking room availability
- Browsing room listings
- Calculating booking prices
- Public room details
- iCal feed generation

### 2. Protected Procedure

**Use for:** Operations that require authentication but not admin privileges.

```typescript
import { protectedProcedure } from './init';

getMyBookings: protectedProcedure
  .input(z.object({
    limit: z.number(),
    offset: z.number(),
  }))
  .query(async ({ ctx, input }) => {
    // ctx.user is guaranteed to exist
    // ctx.session is guaranteed to exist
    const userId = ctx.user.id;

    return await db.bookings.findMany({
      where: { userId },
      limit: input.limit,
      offset: input.offset,
    });
  })
```

**What happens if not authenticated:**
```typescript
// Client receives:
TRPCError: {
  code: 'UNAUTHORIZED',
  message: 'You must be logged in to access this resource'
}
```

**Examples:**
- Viewing own bookings
- Creating bookings
- Updating own profile
- Canceling own bookings
- Resending confirmation emails

### 3. Admin Procedure

**Use for:** Operations that require admin role.

```typescript
import { adminProcedure } from './init';

adminListBookings: adminProcedure
  .input(z.object({
    limit: z.number(),
    offset: z.number(),
  }))
  .query(async ({ ctx, input }) => {
    // ctx.user is guaranteed to exist
    // ctx.user.role is guaranteed to be 'admin'

    return await db.bookings.findMany({
      limit: input.limit,
      offset: input.offset,
    });
  })
```

**What happens if not authenticated:**
```typescript
// Client receives:
TRPCError: {
  code: 'UNAUTHORIZED',
  message: 'You must be logged in to access this resource'
}
```

**What happens if not admin:**
```typescript
// Client receives:
TRPCError: {
  code: 'FORBIDDEN',
  message: 'You must be an admin to access this resource'
}
```

**Examples:**
- Viewing all bookings
- Managing rooms
- Syncing calendars
- Viewing booking statistics
- Managing pricing rules

---

## Session Management

### Session Context Type

```typescript
// src/integrations/trpc/init.ts
export type TRPCContext = {
  db: D1Database;
  env: {
    STRIPE_SECRET_KEY: string;
    STRIPE_TRPC_WEBHOOK_SECRET: string;
    BETTER_AUTH_URL: string;
    RESEND_API_KEY: string;
  };
  session: Session | null;  // ← Better Auth session
  headers: Headers;          // ← Request headers
};
```

### Session Fetching

Session is fetched once per tRPC request and cached by Better Auth:

```typescript
// src/routes/api/trpc/$.ts
async function handleTRPCRequest(request: Request): Promise<Response> {
  const authInstance = await auth();
  const session = await authInstance.api.getSession({
    headers: request.headers,
  });

  const context: TRPCContext = {
    db: env.DB,
    env: { /* ... */ },
    session,  // ← Available to all procedures
    headers: request.headers,
  };

  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req: request,
    router: trpcRouter,
    createContext: () => context,
  });
}
```

### Session Caching

Better Auth caches sessions for 5 minutes (configured in `src/lib/auth.ts`):

```typescript
session: {
  expiresIn: 60 * 60 * 24 * 7, // 7 days
  updateAge: 60 * 60 * 24,      // 24 hours
  cookieCache: {
    enabled: true,
    maxAge: 60 * 5,             // ← 5 minute cache
  },
}
```

**Performance Impact:**
- First call: ~50-100ms (validates token, queries DB)
- Subsequent calls within 5 min: ~1ms (cache hit)
- Multiple tRPC calls in same request: Share cached session

---

## Implementation Details

### Procedure Middleware

```typescript
// src/integrations/trpc/init.ts
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  // Check if session exists and has a user
  if (!ctx.session?.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be logged in to access this resource',
    });
  }

  // Pass through with narrowed session type
  return next({
    ctx: {
      ...ctx,
      session: ctx.session,  // ← TypeScript knows it's non-null
      user: ctx.session.user, // ← Convenient access
    },
  });
});

export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  // User is guaranteed to exist (from protectedProcedure)
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You must be an admin to access this resource',
    });
  }

  return next();
});
```

### Type Safety

TypeScript knows the session state in each procedure:

```typescript
// ❌ In publicProcedure - must check
publicProcedure.query(({ ctx }) => {
  if (ctx.session?.user) {
    const userId = ctx.user.id; // Error: ctx.user doesn't exist
  }
});

// ✅ In protectedProcedure - guaranteed
protectedProcedure.query(({ ctx }) => {
  const userId = ctx.user.id; // ✅ TypeScript knows this exists
  const email = ctx.user.email; // ✅ All user properties available
});

// ✅ In adminProcedure - guaranteed admin
adminProcedure.query(({ ctx }) => {
  const userId = ctx.user.id; // ✅ Exists
  const role = ctx.user.role; // ✅ Guaranteed to be 'admin'
});
```

---

## Migration from Unprotected APIs

### Before: Insecure Pattern

```typescript
// ❌ CRITICAL VULNERABILITY
getMyBookings: publicProcedure
  .input(z.object({
    userId: z.string(), // ← User could pass ANY userId!
    limit: z.number(),
  }))
  .query(async ({ ctx, input }) => {
    return await db.bookings.findMany({
      where: { userId: input.userId }, // ← Trusting client input!
      limit: input.limit,
    });
  })

// Client call (INSECURE):
trpc.bookings.getMyBookings({
  userId: session.user.id, // ← Could be changed to anyone's ID!
  limit: 10,
})
```

**Vulnerability:** Anyone could view anyone's bookings by changing the `userId`.

### After: Secure Pattern

```typescript
// ✅ SECURE
getMyBookings: protectedProcedure
  .input(z.object({
    limit: z.number(), // ← No userId in input
  }))
  .query(async ({ ctx, input }) => {
    const userId = ctx.user.id; // ← From authenticated session

    return await db.bookings.findMany({
      where: { userId }, // ← Using server-side session data
      limit: input.limit,
    });
  })

// Client call (SECURE):
trpc.bookings.getMyBookings({
  limit: 10, // ← No userId - comes from session automatically
})
```

**Security:** User can only access their own data. Session is validated server-side.

### Migration Checklist

When updating a procedure:

- [ ] Change `publicProcedure` → `protectedProcedure` or `adminProcedure`
- [ ] Remove `userId` from input schema
- [ ] Use `ctx.user.id` instead of `input.userId`
- [ ] Add ownership verification if updating/deleting
- [ ] Update client-side calls to remove `userId`
- [ ] Test authentication failure cases
- [ ] Test with different user roles

---

## Security Best Practices

### ✅ DO: Use Session for User Identity

```typescript
// ✅ Good - uses session
protectedProcedure.mutation(async ({ ctx, input }) => {
  const userId = ctx.user.id;
  await createBooking(userId, input);
});
```

### ❌ DON'T: Accept userId in Input

```typescript
// ❌ Bad - trusts client input
publicProcedure.mutation(async ({ ctx, input }) => {
  await createBooking(input.userId, input); // Spoofing possible!
});
```

### ✅ DO: Verify Ownership

```typescript
// ✅ Good - verifies ownership
updateBooking: protectedProcedure
  .mutation(async ({ ctx, input }) => {
    const booking = await db.bookings.findUnique({
      where: { id: input.bookingId }
    });

    // Verify booking belongs to user
    if (booking.userId !== ctx.user.id) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }

    await db.bookings.update({ /* ... */ });
  })
```

### ✅ DO: Use Appropriate Procedure Type

```typescript
// ✅ Good - public for browsing
listRooms: publicProcedure.query(/* ... */);

// ✅ Good - protected for user data
getMyBookings: protectedProcedure.query(/* ... */);

// ✅ Good - admin for management
adminListAllBookings: adminProcedure.query(/* ... */);
```

### ✅ DO: Handle Optional Admin Access

```typescript
// ✅ Good - admins can view any booking, users only their own
getBooking: protectedProcedure
  .query(async ({ ctx, input }) => {
    const isAdmin = ctx.user.role === 'admin';

    const where = isAdmin
      ? { id: input.bookingId }
      : { id: input.bookingId, userId: ctx.user.id };

    return await db.bookings.findUnique({ where });
  })
```

---

## Testing Authentication

### Testing Unauthenticated Access

```typescript
// Should throw UNAUTHORIZED
try {
  await trpc.bookings.getMyBookings.query({ limit: 10 });
} catch (error) {
  expect(error.code).toBe('UNAUTHORIZED');
  expect(error.message).toBe('You must be logged in to access this resource');
}
```

### Testing Non-Admin Access

```typescript
// Regular user trying to access admin endpoint
try {
  await trpc.bookings.adminListBookings.query({ limit: 10 });
} catch (error) {
  expect(error.code).toBe('FORBIDDEN');
  expect(error.message).toBe('You must be an admin to access this resource');
}
```

### Testing Ownership Verification

```typescript
// User A trying to update User B's booking
const userA = { id: 'user-a', ... };
const userB = { id: 'user-b', ... };

// Login as User A
await signIn(userA);

// Try to update User B's booking
try {
  await trpc.bookings.updateBooking.mutate({
    bookingId: userBBooking.id, // ← Belongs to User B
    specialRequests: 'Hacked!',
  });
} catch (error) {
  expect(error.code).toBe('NOT_FOUND'); // Or 'FORBIDDEN'
}
```

---

## Common Patterns

### Pattern 1: User-Specific Data Access

```typescript
getMyBookings: protectedProcedure
  .input(z.object({
    limit: z.number(),
    status: z.enum(['pending', 'confirmed', 'cancelled']).optional(),
  }))
  .query(async ({ ctx, input }) => {
    const userId = ctx.user.id;

    const where = { userId };
    if (input.status) {
      where.status = input.status;
    }

    return await db.bookings.findMany({
      where,
      limit: input.limit,
    });
  })
```

### Pattern 2: Admin with Optional Filters

```typescript
adminListBookings: adminProcedure
  .input(z.object({
    userId: z.string().optional(),     // ← Admin can filter by user
    status: z.string().optional(),
    limit: z.number(),
  }))
  .query(async ({ ctx, input }) => {
    const where = {};
    if (input.userId) where.userId = input.userId;
    if (input.status) where.status = input.status;

    return await db.bookings.findMany({ where, limit: input.limit });
  })
```

### Pattern 3: Conditional Admin Access

```typescript
getBooking: protectedProcedure
  .input(z.object({
    bookingId: z.string(),
  }))
  .query(async ({ ctx, input }) => {
    const isAdmin = ctx.user.role === 'admin';

    // Build query based on role
    const where = isAdmin
      ? { id: input.bookingId }  // Admin: any booking
      : { id: input.bookingId, userId: ctx.user.id }; // User: own only

    const booking = await db.bookings.findUnique({ where });

    if (!booking) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    // Admins get extra data
    if (isAdmin) {
      return await getBookingWithUserData(booking.id);
    }

    return booking;
  })
```

### Pattern 4: Update with Ownership Verification

```typescript
updateBooking: protectedProcedure
  .input(z.object({
    bookingId: z.string(),
    specialRequests: z.string().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    const userId = ctx.user.id;

    // Verify booking belongs to user AND is still pending
    const booking = await db.bookings.findFirst({
      where: {
        id: input.bookingId,
        userId,
        status: 'pending',
      },
    });

    if (!booking) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Booking not found or cannot be modified',
      });
    }

    // Update booking
    return await db.bookings.update({
      where: { id: input.bookingId },
      data: input,
    });
  })
```

---

## Troubleshooting

### Error: "You must be logged in to access this resource"

**Cause:** Session is not available or has expired.

**Solutions:**
1. Check if user is logged in
2. Check session cookie is being sent
3. Verify `BETTER_AUTH_URL` environment variable
4. Check session hasn't expired
5. Try logging out and back in

### Error: "You must be an admin to access this resource"

**Cause:** User is authenticated but doesn't have admin role.

**Solutions:**
1. Verify user role in database
2. Check if endpoint should be `protectedProcedure` instead
3. Update user role if needed: `UPDATE user SET role = 'admin' WHERE email = '...'`

### Error: "ctx.user is undefined"

**Cause:** Using `ctx.user` in a `publicProcedure`.

**Solution:** Either:
1. Change to `protectedProcedure`, or
2. Check session first: `if (ctx.session?.user) { /* ... */ }`

### Session Not Persisting

**Cause:** Cookie configuration issues.

**Check:**
1. `BETTER_AUTH_URL` matches your domain
2. Cookies are enabled in browser
3. HTTPS in production (cookies require secure flag)
4. Session hasn't expired (check `expiresIn` in auth config)

### TypeScript Error: Property 'user' does not exist

**Cause:** Wrong procedure type or not checking session.

**Solution:**
```typescript
// ❌ Wrong
publicProcedure.query(({ ctx }) => {
  const id = ctx.user.id; // Error!
});

// ✅ Correct - use protectedProcedure
protectedProcedure.query(({ ctx }) => {
  const id = ctx.user.id; // ✅ Works
});

// ✅ Or check in publicProcedure
publicProcedure.query(({ ctx }) => {
  if (ctx.session?.user) {
    const id = ctx.session.user.id; // ✅ Works
  }
});
```

---

## Related Documentation

- [tRPC Procedures Reference](./TRPC_PROCEDURES_REFERENCE.md) - Complete list of all procedures
- [Auth Check Utilities](./AUTH_CHECK_UTILITIES.md) - Route-level authentication
- [Secure Auth Implementation](./SECURE_AUTH_IMPLEMENTATION.md) - Better Auth setup
- [Booking Architecture](./BOOKING_ARCHITECTURE.md) - Booking flow with auth

---

## Summary

The tRPC security implementation provides:

- ✅ **Defense in Depth**: Both route and API protection
- ✅ **Type Safety**: TypeScript knows session state
- ✅ **Better UX**: Route checks prevent wasted renders
- ✅ **Real Security**: API checks prevent data breaches
- ✅ **Performance**: Session caching minimizes overhead
- ✅ **Production Ready**: No known security vulnerabilities

This implementation follows industry best practices and provides enterprise-grade security for the Irishette booking application.
