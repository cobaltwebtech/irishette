import { useRouter } from '@tanstack/react-router';
import { useLenis } from 'lenis/react';
import { useEffect } from 'react';

/**
 * ScrollRestoration component that integrates TanStack Router with Lenis smooth scrolling.
 * Automatically scrolls to top on route navigation while respecting Lenis animations.
 */
export function ScrollRestoration() {
	const router = useRouter();
	const lenis = useLenis();

	useEffect(() => {
		// Subscribe to router navigation events
		const unsubscribe = router.subscribe('onResolved', () => {
			// Only scroll on actual navigation (not initial load)
			if (lenis) {
				// Use Lenis's scrollTo for smooth scroll restoration
				lenis.scrollTo(0, { immediate: false, lock: false });
			}
		});

		return () => {
			unsubscribe();
		};
	}, [router, lenis]);

	return null;
}
