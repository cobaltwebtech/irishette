# SSR Session Check Fix

## Problem

When refreshing the `/account` page, authenticated users were being redirected to `/auth/login` even though they were logged in. This was because:

1. `authClient.getSession()` in `beforeLoad` wasn't receiving cookies during SSR
2. Server-side check showed `session: false`
3. Browser/client-side showed `session: true`
4. Race condition between server and client hydration

## Root Cause

The client-side auth client (`authClient` from `auth-client.ts`) doesn't have access to request headers/cookies during server-side rendering in TanStack Start. Additionally, the `useSession()` hook returns `null` during SSR because it's a client-side TanStack Query hook that hasn't hydrated yet.

This caused two issues:
1. `beforeLoad` couldn't validate sessions (no cookies)
2. Components crashed accessing `session.user` during SSR (session was null)

## Solution

Created a dedicated server function that:

1. Uses the **server-side** Better Auth instance (from `auth.ts`)
2. Accesses request headers using TanStack Start's `getRequestHeaders()`
3. Properly forwards cookies to Better Auth for session validation
4. **Returns session data from `beforeLoad`** to make it available during SSR
5. Components use server session during SSR, then switch to client session after hydration

### New File: `/src/lib/auth-server.ts`

```typescript
import { createServerFn } from '@tanstack/react-start';
import { auth } from './auth';

export const getServerSession = createServerFn()
	.handler(async () => {
		const authInstance = await auth();
		const session = await authInstance.api.getSession({
			headers: await import('@tanstack/react-start/server').then(m => m.getRequestHeaders()),
		});
		
		return session;
	});
```

### Usage in Routes

**Before (Broken on SSR):**
```typescript
beforeLoad: async ({ location }) => {
	const { data: session } = await authClient.getSession(); // ❌ No cookies in SSR
	if (!session) throw redirect({ to: '/auth/login' });
}

function AccountPage() {
	const { data: session } = useSession(); // ❌ null during SSR
	return <div>{session.user.name}</div>; // TypeError!
}
```

**After (Works with SSR):**
```typescript
import { getServerSession } from '@/lib/auth-server';

beforeLoad: async ({ location }) => {
	const session = await getServerSession(); // ✅ Has cookies in SSR
	if (!session) throw redirect({ to: '/auth/login' });
	return { session }; // ✅ Pass to component
}

function AccountPage() {
	const routeContext = Route.useRouteContext();
	const serverSession = routeContext.session; // ✅ Available during SSR
	const { data: clientSession } = useSession(); // For reactive updates
	
	// Use server session during SSR, client after hydration
	const session = clientSession ?? serverSession!;
	return <div>{session.user.name}</div>; // ✅ Works in SSR!
}
```

## Architecture

### Server-Side (SSR/beforeLoad)

- **Use:** `getServerSession()` from `@/lib/auth-server`
- **Why:** Has access to request headers and cookies
- **When:** In `beforeLoad` functions for authentication checks
- **Return:** Pass session data via `return { session }` for SSR access

### Client-Side (Components)

- **Use:** Combination of route context + `useSession()` hook
- **Pattern:** `const session = clientSession ?? serverSession!`
- **Why:** Server session works during SSR, client session provides reactive updates
- **When:** In React components for displaying user data

## Files Modified

1. ✅ `/src/lib/auth-server.ts` - Created
2. ✅ `/src/routes/account/index.tsx` - Updated `beforeLoad`
3. ✅ `/src/routes/auth/login.tsx` - Updated `beforeLoad`
4. ✅ `/src/routes/auth/signup.tsx` - Updated `beforeLoad`

## Testing

### Test Case 1: Page Refresh While Logged In
```
1. Login to account
2. Navigate to /account
3. Refresh browser (F5 or Cmd+R)
Expected: Stay on /account page
Previous: Redirected to /auth/login ❌
Current: Stays on /account ✅
```

### Test Case 2: Direct URL While Logged In
```
1. Login to account
2. Type /account in address bar
3. Press Enter
Expected: Load /account page
Previous: Redirected to /auth/login ❌
Current: Loads /account ✅
```

### Test Case 3: In-App Navigation While Logged In
```
1. Login to account
2. Navigate away (e.g., to home page)
3. Click link to /account
Expected: Navigate to /account
Previous: Works ✅
Current: Still works ✅
```

### Test Case 4: Server Logs
```
Before: [/account beforeLoad] Session check: false
After:  [/account beforeLoad] Session check: true
```

## Key Differences

| Aspect | Client Auth (`authClient`) | Server Auth (`getServerSession`) |
|--------|---------------------------|----------------------------------|
| Import | `@/lib/auth-client` | `@/lib/auth-server` |
| Type | Better Auth Client | TanStack Start Server Function |
| Cookies | ❌ Not available in SSR | ✅ Available via `getRequestHeaders()` |
| Use Case | Client-side components | Server-side `beforeLoad` |
| Return | `{ data: session }` | `session` (direct) |

## Why This Matters

1. **Security**: Proper server-side validation prevents unauthorized access
2. **UX**: No more unexpected logouts on page refresh
3. **SSR**: Correctly handles both server and client rendering
4. **Better Auth**: Uses the framework as intended with separate server/client instances

## References

- [TanStack Start Server Functions](https://tanstack.com/start/latest/docs/framework/react/server-functions)
- [Better Auth with React Start](https://www.better-auth.com/docs/integrations/react-start)
- [Better Auth `reactStartCookies()` plugin](https://www.better-auth.com/docs/integrations/react-start#cookies)
