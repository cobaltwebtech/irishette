/// <reference types="vite/client" />

import type { QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import {
	createRootRouteWithContext,
	HeadContent,
	Scripts,
	useRouterState,
} from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { ReactLenis } from 'lenis/react';
import type * as React from 'react';
import { DefaultCatchBoundary } from '@/components/default-catch-boundary';
import Footer from '@/components/Footer';
import Header from '@/components/Header';
import { NotFound } from '@/components/not-found';
import { ScrollRestoration } from '@/components/scroll-restoration';
import { Toaster } from '@/components/ui/sonner';
import type { useSession } from '@/lib/auth-client';
import appCss from '@/styles/styles.css?url';
import { seo } from '@/utils/seo';

// Define the router context interface
interface RouterContext {
	queryClient: QueryClient;
	auth: ReturnType<typeof useSession> | undefined;
}

export const Route = createRootRouteWithContext<RouterContext>()({
	head: () => ({
		meta: [
			{
				charSet: 'utf-8',
			},
			{
				name: 'viewport',
				content: 'width=device-width, initial-scale=1',
			},
			...seo({
				title: 'Irishette | Victorian Charm in Dublin, Texas',
				description: `Experience the timeless elegance of Irishette, a charming Victorian bed and breakfast in the heart of Dublin, Texas. Enjoy cozy rooms, modern amenities, and warm hospitality for an unforgettable stay.`,
			}),
		],
		links: [
			{ rel: 'stylesheet', href: appCss },
			{
				rel: 'apple-touch-icon',
				sizes: '180x180',
				href: '/icons/apple-touch-icon.png',
			},
			{
				rel: 'icon',
				type: 'image/png',
				sizes: '32x32',
				href: '/icons/favicon-32x32.png',
			},
			{
				rel: 'icon',
				type: 'image/png',
				sizes: '16x16',
				href: '/icons/favicon-16x16.png',
			},
			{ rel: 'manifest', href: '/site.webmanifest', color: '#fffff' },
			{ rel: 'icon', href: '/icons/favicon.ico' },
		],
	}),
	errorComponent: (props) => {
		return <DefaultCatchBoundary {...props} />;
	},
	notFoundComponent: () => <NotFound />,
	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	const routerState = useRouterState();
	const isAdminRoute = routerState.location.pathname.startsWith('/admin');

	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				<div className="min-h-screen flex flex-col">
					<ReactLenis root>
						<ScrollRestoration />
						<Header />
						{children}
						{!isAdminRoute && <Footer />}
						<Toaster />
					</ReactLenis>
				</div>
				<TanStackRouterDevtools position="bottom-right" />
				<ReactQueryDevtools buttonPosition="bottom-left" />
				<Scripts />
			</body>
		</html>
	);
}
