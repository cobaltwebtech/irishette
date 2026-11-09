import { useState } from 'react';

import type { IsoDate } from '@/lib/date-range';
import { todayIn } from '@/lib/timezone';

/**
 * The time of the component's first render, stable across re-renders.
 *
 * Reading `new Date()` during render is impure (`react/purity`): each render
 * sees a different value and the React Compiler skips the component. Read the
 * clock once instead. Do not mutate the returned Date (use date-fns helpers
 * such as `startOfDay(now)`, which return new Dates).
 */
export function useNow(): Date {
	const [now] = useState(() => new Date());
	return now;
}

/** Today's date in US Central Time (property time), stable across renders. */
export function useTodayCT(): IsoDate {
	return todayIn(undefined, useNow());
}
