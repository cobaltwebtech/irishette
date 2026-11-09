# separator

2026-11-08, transformation engine (legacy `new-york` style; own classes kept). Migrated to `@base-ui/react/separator`.

## Changed

- `src/components/ui/separator.tsx`: `SeparatorPrimitive.Root` -> callable `SeparatorPrimitive`, props typed as `SeparatorPrimitive.Props`, `decorative` dropped (no Base UI equivalent). Classes unchanged: Base UI still emits `data-orientation`, so the `data-[orientation=…]` selectors keep working.
- No call site passed `decorative`.
- Leftover scan: `grep -n "radix-ui\|@radix-ui" src/components/ui/separator.tsx` is clean.

## Left alone

- Call sites (sidebar, cards, dropdown menu separators use their own primitives).

## Behavior changes

- Radix defaulted to `decorative` (`role="none"`, hidden from screen readers). Base UI always renders `role="separator"` with `aria-orientation`, so screen readers now announce the separators.

## Verify by hand

- Horizontal separators in the account and admin pages render a 1px line at full width.
- The vertical separator next to the sidebar trigger in the admin header is full height.
