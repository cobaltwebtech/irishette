# Secure Authentication Implementation with TanStack Router

## Overview

This document describes the secure authentication implementation using TanStack Router's `beforeLoad` middleware with Better Auth and TanStack Query integration, with proper SSR support for server-side session validation.

## Critical SSR Fix

### The Problem

When using `authClient.getSession()` directly in `beforeLoad`, the session cookies were not being properly forwarded during server-side rendering (SSR). This caused:

- Authenticated users being redirected to login on page refresh
- `beforeLoad` showing `session: false` on server while browser showed `session: true`
- Race condition between SSR and client hydration

### The Solution

Created a dedicated server function (`getServerSession`) that:

1. Uses the server-side Better Auth instance (not the client)
2. Properly accesses request headers using `getRequestHeaders()` from TanStack Start
3. Works correctly in both SSR and client-side navigation

**File: `/src/lib/auth-server.ts`**

```typescript
import { createServerFn } from '@tanstack/react-start';
import { auth } from './auth';

/**
 * Server function to get the current session
 * This properly handles SSR by accessing the request headers and cookies
 */
export const getServerSession = createServerFn()
	.handler(async () => {
		const authInstance = await auth();
		const session = await authInstance.api.getSession({
			headers: await import('@tanstack/react-start/server').then(m => m.getRequestHeaders()),
		});
		
		return session;
	});
```

## Security Architecture

### Why `beforeLoad` Instead of `useEffect`?

**TanStack Router Documentation Recommendation:**
> "If you are performing authentication checks, you should do this in a `beforeLoad` function and `throw redirect()` to redirect the user to the login page. Don't use `useEffect` to redirect the user as this will cause the route to render before the redirect is triggered."

**Security Benefits:**

1. **Server-Side Execution**: In TanStack Start (SSR), `beforeLoad` runs on the server, preventing unauthorized access before any client code executes
2. **No Content Flash**: Route components never render if authentication fails
3. **No Data Fetching**: React Query and other data fetching hooks never execute for unauthorized users
4. **Atomic Security**: Authentication check and redirect happen before component mounting

**Risks of `useEffect` Approach:**

1. Component renders briefly before redirect
2. Data fetching hooks (useQuery, tRPC) may execute
3. Sensitive content may flash on screen
4. Not suitable for SSR environments

## Implementation Details

### Protected Routes (e.g., `/account`)

```typescript
import { getServerSession } from '@/lib/auth-server';

export const Route = createFileRoute('/account/')({
	beforeLoad: async ({ location }) => {
		// Check session server-side with proper request headers
		const session = await getServerSession();
		
		if (!session) {
			// Redirect to login with return URL
			throw redirect({
				to: '/auth/login',
				search: {
					redirect: location.href,
				},
			});
		}

		// Return session data to be available in component during SSR
		return { session };
	},
	component: AccountPage,
});

function AccountPage() {
	// Get session from route context (passed from beforeLoad)
	// This ensures session is available during SSR
	const routeContext = Route.useRouteContext();
	const serverSession = routeContext.session;
	
	// Also get client-side session for reactive updates
	const { data: clientSession } = useSession();
	
	// Use server session during SSR, client session after hydration
	// biome-ignore lint/style/noNonNullAssertion: Session guaranteed by beforeLoad
	const session = clientSession ?? serverSession!;
	
	// Rest of component...
}
```

**Key Points:**

- `beforeLoad` uses `await getServerSession()` which properly accesses request headers
- Session is returned from `beforeLoad` via `return { session }` for SSR access
- Component gets session from route context (available during SSR)
- Component also uses `useSession()` hook for reactive client-side updates
- Pattern `clientSession ?? serverSession!` ensures session is available in both SSR and client
- Return URL is preserved in redirect for post-login navigation

### Public Auth Routes (e.g., `/auth/login`, `/auth/signup`)

```typescript
import { getServerSession } from '@/lib/auth-server';

export const Route = createFileRoute('/auth/login')({
	validateSearch: (search: Record<string, unknown>) => {
		return {
			redirect: (search.redirect as string) || '/account',
		};
	},
	beforeLoad: async ({ search }) => {
		// Check if user is already logged in (server-side with proper headers)
		const session = await getServerSession();
		
		if (session) {
			// Redirect to account or intended destination
			throw redirect({
				to: search.redirect || '/account',
			});
		}
	},
	component: LoginPage,
});
```

**Key Points:**

- Prevents logged-in users from accessing auth pages
- Uses `getServerSession()` for proper SSR support
- Redirects to intended destination or default `/account`
- Maintains clean UX (no flash of login form for logged-in users)

## Route Security Matrix

| Route | Authentication | Behavior | Redirect Target |
|-------|---------------|----------|----------------|
| `/account` | Required | Blocks unauthenticated users | `/auth/login?redirect=/account` |
| `/auth/login` | Forbidden | Blocks authenticated users | `/account` or search param redirect |
| `/auth/signup` | Forbidden | Blocks authenticated users | `/account` or search param redirect |
| `/` (home) | Optional | Accessible to all | N/A |

## TanStack Query Integration

### Session Caching

Better Auth's `useSession()` hook uses TanStack Query internally:

```typescript
// In auth-client.ts
export const { useSession, signIn, signUp, signOut } = authClient;

// Usage in components
const { data: session, isPending, isRefetching } = useSession();
```

**Benefits:**

1. Automatic caching - session fetched once per mount
2. Background refetching for freshness
3. Optimistic updates on mutations
4. Shared cache across components

### Authentication Flow

```
1. User navigates to /account (page refresh or direct URL)
   ↓
2. beforeLoad executes (server-side in SSR)
   ↓
3. getServerSession() called
   ├─ Creates server-side auth instance
   ├─ Gets request headers with cookies
   └─ Validates session with Better Auth
   ↓
4. If authenticated: Component renders
   ├─ useSession() returns cached/fresh session (client-side)
   └─ TanStack Query manages cache
   ↓
5. If not authenticated: redirect() throws
   ├─ No component render
   └─ Navigate to /auth/login
```

## Troubleshooting SSR Issues

### Symptom: Redirect on Page Refresh but Not on Navigation

**Problem:** Cookies not forwarded to auth check during SSR

**Solution:** Use `getServerSession()` instead of `authClient.getSession()` in `beforeLoad`

### Symptom: Server logs show `session: false` but browser shows `session: true`

**Problem:** Client-side and server-side using different auth instances

**Solution:** 
- Server-side: Use `getServerSession()` (from `auth-server.ts`)
- Client-side: Use `useSession()` hook (from `auth-client.ts`)

### Symptom: Race condition between SSR and client hydration

**Problem:** `beforeLoad` runs on server without proper headers

**Solution:** TanStack Start's `getRequestHeaders()` ensures cookies are available in server functions

## Code Organization

### Modified Files

1. **`/src/lib/auth-server.ts`** (NEW)
   - Created server function for SSR-compatible session checks
   - Uses Better Auth server instance with request headers
   - Exports `getServerSession()` for use in `beforeLoad`

2. **`/src/routes/account/index.tsx`**
   - Uses `getServerSession()` in `beforeLoad` instead of `authClient.getSession()`
   - Client-side uses `useSession()` for reactive session access
   - Added non-null assertion with biome ignore comment

3. **`/src/routes/auth/login.tsx`**
   - Uses `getServerSession()` in `beforeLoad` for proper SSR check
   - Prevents logged-in users from accessing login page

4. **`/src/routes/auth/signup.tsx`**
   - Uses `getServerSession()` in `beforeLoad` for proper SSR check
   - Prevents logged-in users from accessing signup page

### Clean Up from Previous Approach

**Removed from `__root.tsx`:**
- Session preloading in beforeLoad
- RouterContext session property
- Server-side session fetch

**Removed from `router.tsx`:**
- `auth: undefined!` placeholder in context

## Testing

### Test Scenarios

1. **Protected Route Access (Unauthenticated)**
   ```
   Visit: /account
   Expected: Redirect to /auth/login?redirect=/account
   Verify: No flash of account page content
   ```

2. **Protected Route Access (Authenticated)**
   ```
   Visit: /account (while logged in)
   Expected: Account page renders immediately
   Verify: Session data displays correctly
   ```

3. **Login Page (Already Authenticated)**
   ```
   Visit: /auth/login (while logged in)
   Expected: Redirect to /account
   Verify: No flash of login form
   ```

4. **Signup Page (Already Authenticated)**
   ```
   Visit: /auth/signup (while logged in)
   Expected: Redirect to /account
   Verify: No flash of signup form
   ```

5. **Return URL Preservation**
   ```
   Visit: /account (while logged out)
   Expected: Redirect to /auth/login?redirect=/account
   After login: Redirect back to /account
   ```

## TypeScript Patterns

### Non-Null Assertions

When `beforeLoad` guarantees a value exists, use non-null assertion with linter ignore:

```typescript
// biome-ignore lint/style/noNonNullAssertion: Session guaranteed by beforeLoad
const session = sessionData!;
```

**When to use:**
- Value is guaranteed by beforeLoad check
- TypeScript can't infer the guarantee
- Alternative (optional chaining) would cause hook ordering issues

### Search Param Typing

```typescript
validateSearch: (search: Record<string, unknown>) => {
	return {
		redirect: (search.redirect as string) || '/account',
	};
},
```

## Performance Considerations

1. **Server-Side Checks**: `authClient.getSession()` in `beforeLoad` runs on server (SSR)
2. **Client Caching**: `useSession()` leverages TanStack Query cache
3. **Minimal Fetches**: Session checked once per navigation, cached for component tree
4. **Background Updates**: TanStack Query refetches stale data automatically

## Best Practices

### DO ✅

- Use `beforeLoad` for authentication checks
- Use `throw redirect()` for navigation
- Access session via `useSession()` in components
- Preserve return URLs for post-login navigation
- Document non-null assertions with comments

### DON'T ❌

- Don't use `useEffect` for authentication redirects
- Don't fetch session in both `beforeLoad` and component
- Don't render sensitive content before auth check
- Don't ignore TypeScript errors without understanding guarantees

## Migration from useEffect Pattern

If migrating from `useEffect` redirects:

1. Remove `useEffect` redirect logic from component
2. Add `beforeLoad` to route definition
3. Use `await authClient.getSession()` for server-side check
4. Use `throw redirect()` for navigation
5. Keep `useSession()` in component for reactive data
6. Add non-null assertions where guaranteed by `beforeLoad`

## References

- [TanStack Router Authentication Guide](https://tanstack.com/router/latest/docs/framework/react/guide/authenticated-routes)
- [Better Auth Documentation](https://www.better-auth.com/)
- [TanStack Query Integration](https://tanstack.com/query/latest)

## Summary

This implementation provides:

- ✅ Secure server-side authentication checks
- ✅ No content flash or unauthorized rendering
- ✅ Proper integration with TanStack Query caching
- ✅ Clean user experience with preserved navigation
- ✅ Type-safe patterns with documented assertions
- ✅ Follows TanStack Router best practices
