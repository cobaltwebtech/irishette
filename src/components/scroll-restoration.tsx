import { useRouter } from '@tanstack/react-router';
import { useLenis } from 'lenis/react';
import { useEffect, useEffectEvent } from 'react';

/**
 * ScrollRestoration component that integrates TanStack Router with Lenis smooth scrolling.
 * Automatically scrolls to top on route navigation while respecting Lenis animations.
 * Uses React 19's useEffectEvent to avoid stale closures and unnecessary re-renders.
 */
export function ScrollRestoration() {
	const router = useRouter();
	const lenis = useLenis();

	// Effect Event allows us to access the latest lenis without making it a dependency
	const scrollToTop = useEffectEvent(() => {
		if (lenis) {
			lenis.scrollTo(0, { immediate: false, lock: false });
		}
	});

	useEffect(() => {
		let lastPathname = router.state.location.pathname;

		const unsubscribe = router.subscribe('onResolved', () => {
			const currentPathname = router.state.location.pathname;

			// Only scroll if the pathname actually changed (real navigation, not prefetch)
			if (lastPathname !== currentPathname) {
				scrollToTop();
				lastPathname = currentPathname;
			}
		});

		return () => {
			unsubscribe();
		};
	}, [router]);

	return null;
}
