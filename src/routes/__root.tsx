import type { QueryClient } from '@tanstack/react-query';
import {
	createRootRouteWithContext,
	HeadContent,
	Scripts,
} from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import type { TRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { ReactLenis } from 'lenis/react';
import { Toaster } from '@/components/ui/sonner';
import type { TRPCRouter } from '@/integrations/trpc/router';
import Footer from '../components/Footer';
import Header from '../components/Header';
import NotFoundPage from '../components/NotFoundPage';
import TanStackQueryLayout from '../integrations/tanstack-query/layout.tsx';
import appCss from '../styles.css?url';

interface MyRouterContext {
	queryClient: QueryClient;

	trpc: TRPCOptionsProxy<TRPCRouter>;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	head: () => ({
		meta: [
			{
				charSet: 'utf-8',
			},
			{
				name: 'viewport',
				content: 'width=device-width, initial-scale=1',
			},
			{
				title: 'Irishette | Victorian Charm in Dublin, Texas',
			},
		],
		links: [
			{
				rel: 'preload',
				href: '/fonts/SchibstedGrotesk-Regular.woff2',
				as: 'font',
				type: 'font/woff2',
				crossOrigin: 'anonymous',
				name: 'Schibsted Grotesk',
			},
			{
				rel: 'preload',
				href: '/fonts/SchibstedGrotesk-Italic.woff2',
				as: 'font',
				type: 'font/woff2',
				crossOrigin: 'anonymous',
				name: 'Schibsted Grotesk',
			},
			{
				rel: 'stylesheet',
				href: appCss,
			},
		],
	}),

	notFoundComponent: NotFoundPage,
	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				<ReactLenis root>
					<Header />
					{children}
					<Footer />
					<Toaster />
					<TanStackRouterDevtools />
					<TanStackQueryLayout />
				</ReactLenis>
				<Scripts />
			</body>
		</html>
	);
}
