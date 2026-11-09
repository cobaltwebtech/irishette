# switch

2026-11-08, transformation engine (legacy `new-york` style; own classes kept). Migrated to `@base-ui/react/switch`.

## Changed

- `src/components/ui/switch.tsx`: Radix namespace import -> `import { Switch as SwitchPrimitive } from '@base-ui/react/switch'`; props typed `SwitchPrimitive.Root.Props`. Classes: `data-[state=checked|unchecked]:` -> `data-checked:` / `data-unchecked:` on the root and thumb; `disabled:` -> `data-disabled:`. Sizes and colours unchanged (this project's switch has no `size` prop).
- Call sites (`RoomDetails.tsx`, `RoomCalendarIntegration.tsx`) pass `checked` + `onCheckedChange` with a one-argument handler; Base UI's extra `eventDetails` argument is ignored. No changes.
- Leftover scan: `grep -n "radix-ui\|@radix-ui" src/components/ui/switch.tsx` is clean.

## Left alone

- Nothing related.

## Behavior changes

None.

## Verify by hand

- Admin room page: the room active switch toggles and saves; the thumb slides.
- Admin room calendar feeds: each feed's active switch toggles.
