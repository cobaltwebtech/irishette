# scroll-area

2026-11-08, transformation engine (wrapper was pristine `new-york-v4`). Migrated to `@base-ui/react/scroll-area`.

## Changed

- `src/components/ui/scroll-area.tsx`:
  - Radix namespace import -> `import { ScrollArea as ScrollAreaPrimitive } from '@base-ui/react/scroll-area'`; `ScrollAreaScrollbar` / `ScrollAreaThumb` -> `Scrollbar` / `Thumb`; props typed `*.Props`.
  - Added `ScrollAreaPrimitive.Content` (`data-slot="scroll-area-content"`) inside the Viewport. Radix wrapped children in a `display: table; min-width: 100%` box; without an equivalent, wide tables shrank to the viewport instead of scrolling (measured on `/admin/property-management` at 700px: Radix 614px content in a 602px viewport; Base UI without Content 602/602; with Content 614/602 and a horizontal scrollbar). The shadcn base registry omits Content; this is a deliberate deviation to keep the layout.
  - Scrollbar: `opacity-0 … data-hovering:opacity-100 data-scrolling:opacity-100` reproduces Radix's default `type="hover"` (bar visible only while hovering or scrolling). Base UI shows the bar whenever there is overflow otherwise.
- No call-site changes: the 6 admin tables pass `className` and `<ScrollBar orientation="horizontal" />` only.
- Leftover scan: `grep -n "radix-ui\|@radix-ui" src/components/ui/scroll-area.tsx` is clean.

## Left alone

- Nothing related.

## Behavior changes

- Radix hid the bar 600ms after the pointer left; Base UI fades it as soon as hovering/scrolling stops.
- Base UI only renders a scrollbar when its axis overflows (Radix rendered it and hid it).

## Verify by hand

- Admin tables (current/past bookings, guests, guest detail, rooms, inbox) at a narrow window: the table scrolls sideways, the bar appears on hover and while scrolling, and drag on the thumb works.
- Wide windows: no scrollbar and no layout change.
