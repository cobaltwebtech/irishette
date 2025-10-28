# Authentication Redirect Flash Fix

## Problem
When refreshing the browser on protected routes (like `/account`), there was a brief redirect flash where the user would be redirected to `/auth/login` and then immediately back to the account page. This happened even though the user was already authenticated.

## Root Cause
The issue was caused by `authClient.getSession()` being an async call that needed to fetch from the server on every page load. During this brief moment when the session wasn't yet available, the `requireAuth` guard would trigger a redirect to the login page, causing the flash.

## Solution
We implemented a session preloading strategy using TanStack Router's `beforeLoad` at the root route level, combined with context sharing to child routes:

### 1. Root Route Session Preload (`__root.tsx`)
Added a `beforeLoad` function to the root route that preloads the session for all child routes:

```typescript
export const Route = createRootRouteWithContext<{
	queryClient: QueryClient;
}>()({
	beforeLoad: async () => {
		// Preload session data in root route to avoid flash on protected routes
		// This will be cached and available to child routes
		const { data: session } = await authClient.getSession();
		return {
			session: session ?? null,
		};
	},
	// ... rest of route config
});
```

**Key Benefits:**
- Session is fetched once at the root level
- Available to all child routes via context
- Better Auth's cookie cache (5 minutes) helps minimize repeated fetches

### 2. Updated Auth Guard (`auth-guard.ts`)
Modified the auth guard functions to accept and use the preloaded session from context:

```typescript
export async function requireAuth(
	location: { pathname: string; search: Record<string, unknown> },
	context?: { session?: Awaited<ReturnType<typeof authClient.getSession>>['data'] | null },
) {
	// First, check if session is available from the parent route context
	let session = context?.session;

	// If not in context, fetch it (fallback - shouldn't normally happen)
	if (session === undefined) {
		const { data, error } = await authClient.getSession();
		session = error ? null : data;
	}

	if (!session) {
		throw redirect({
			to: '/auth/login',
			search: { redirect: location.pathname },
		});
	}

	return session;
}
```

**Key Features:**
- Checks context first (synchronous when available)
- Falls back to fetching if needed
- Same logic applied to `requireAdmin` and `optionalAuth`

### 3. Updated Protected Routes
Modified all protected routes to pass context to auth guards:

```typescript
export const Route = createFileRoute('/account/')({
	beforeLoad: async ({ location, context }) => {
		// Pass context to use preloaded session from __root.tsx
		const session = await requireAuth(location, context);
		return { session };
	},
	component: AccountPage,
});
```

### 4. Redirect Back Functionality (`auth/login.tsx`)
Implemented proper redirect handling as recommended by TanStack Router docs:

```typescript
export const Route = createFileRoute('/auth/login')({
	validateSearch: (search: Record<string, unknown>) => {
		return {
			redirect: (search.redirect as string) || '/account',
		};
	},
	component: LoginPage,
});

function LoginPage() {
	const search = Route.useSearch();
	
	// On successful login, redirect back to original page
	useEffect(() => {
		if (session) {
			router.history.push(search.redirect); // Preserves full URL with search params
		}
	}, [session, router, search.redirect]);
	
	// Update magic link and password login handlers to use search.redirect
	await authClient.signIn.magicLink({
		email,
		callbackURL: search.redirect,
	});
}
```

## Better Auth Session Caching
Better Auth is already configured with session caching in `auth.ts`:

```typescript
session: {
	expiresIn: 60 * 60 * 24 * 7, // 7 days
	updateAge: 60 * 60 * 24, // 24 hours
	cookieCache: {
		enabled: true,
		maxAge: 60 * 5, // Cache session data for 5 minutes
	},
}
```

This means:
- Session data is cached in cookies for 5 minutes
- Reduces unnecessary server calls
- Improves performance and user experience

## Files Modified
1. **`src/routes/__root.tsx`** - Added session preloading
2. **`src/lib/auth-guard.ts`** - Updated to accept and use context
3. **`src/routes/account/index.tsx`** - Pass context to requireAuth
4. **`src/routes/account/booking/$bookingId.tsx`** - Migrated from useEffect to beforeLoad
5. **`src/routes/auth/login.tsx`** - Added redirect parameter handling

## Testing Checklist
- [ ] Refresh page on `/account` - no redirect flash
- [ ] Refresh page on `/account/booking/:id` - no redirect flash
- [ ] Login redirects back to intended page
- [ ] Magic link redirects back to intended page
- [ ] Logout and try to access protected route - redirects to login
- [ ] Admin routes work correctly
- [ ] Non-authenticated users can't access protected routes

## Future Improvements
Consider protecting admin routes with `beforeLoad` using `requireAdmin`:

```typescript
export const Route = createFileRoute('/admin/')({
	beforeLoad: async ({ location, context }) => {
		const session = await requireAdmin(location, context);
		return { session };
	},
	component: AdminDashboard,
});
```

This would provide the same benefits (no flash, better security) for admin routes.

## References
- [TanStack Router - Authenticated Routes](https://tanstack.com/router/latest/docs/framework/react/guide/authenticated-routes)
- [Better Auth Session Configuration](https://www.better-auth.com/docs/concepts/session)
