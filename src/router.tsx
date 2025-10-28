import { createRouter } from '@tanstack/react-router';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';
import * as TanstackQuery from './integrations/tanstack-query/root-provider';

// Import the generated route tree
import { routeTree } from './routeTree.gen';

// Create a new router instance
export const getRouter = () => {
	const rqContext = TanstackQuery.getContext();

	const router = createRouter({
		routeTree,
		context: {
			...rqContext,
			// auth will initially be undefined
			// We'll pass the actual auth state from the App component
			// biome-ignore lint/style/noNonNullAssertion: Better Auth typed in __root.tsx
			auth: undefined!,
		},
		defaultPreload: 'intent',
		Wrap: (props: { children: React.ReactNode }) => {
			return (
				<TanstackQuery.Provider queryClient={rqContext.queryClient}>
					{props.children}
				</TanstackQuery.Provider>
			);
		},
	});

	setupRouterSsrQueryIntegration({
		router,
		queryClient: rqContext.queryClient,
	});

	return router;
};
