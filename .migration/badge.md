# badge

2026-11-08, transformation engine (legacy `new-york` style; own classes kept). `Slot`/`asChild` -> `useRender` + `mergeProps`.

## Changed

- `src/components/ui/badge.tsx`: props typed `useRender.ComponentProps<'span'>` (adds `render`, drops `asChild`); renders through `useRender({ defaultTagName: 'span' })` with `mergeProps` (the `data-slot` literal is cast, per the skill's pitfall note). Variants unchanged, including the local `accent` variant and `rounded-md`.
- No call site used `asChild`, so no consumer changes.
- Leftover scan: `grep -n "radix-ui\|@radix-ui" src/components/ui/badge.tsx` is clean.

## Left alone

- Status badge components outside `ui/` (they only pass `variant`/`className`).

## Behavior changes

None.

## Verify by hand

- Room status badges (admin dashboard "ACTIVE"), booking status badges on account and admin booking lists look unchanged.
