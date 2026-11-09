# tooltip

2026-11-08, transformation engine (structure from the base registry; this project's classes and defaults kept). Migrated to `@base-ui/react/tooltip`.

## Changed

- `src/components/ui/tooltip.tsx`:
  - Radix namespace import -> `import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip'`.
  - `TooltipProvider`: `delayDuration = 0` -> `delay = 0`.
  - `Tooltip` still wraps its own `TooltipProvider` (the project's `new-york-v4` shape), so every tooltip keeps the 0ms delay.
  - `TooltipContent`: `Portal > Content` -> `Portal > Positioner > Popup`. `side`, `sideOffset`, `align`, `alignOffset` are declared, destructured and forwarded to the Positioner (Pick means forward). Kept `sideOffset = 0` (the project's value; the base registry uses 4). Positioner gets `isolate z-50`.
  - Classes: `origin-(--radix-tooltip-content-transform-origin)` -> `origin-(--transform-origin)`; `data-[state=closed]:` -> `data-closed:`; the enter/exit keyframe utilities (tw-animate) are kept, as in the base registry. Arrow gets per-side positioning classes (Base UI positions the arrow element itself; Radix drew an SVG below the content).
- `src/components/ui/sidebar.tsx` (consumer): `<TooltipProvider delayDuration={0}>` -> `delay={0}`; `<TooltipTrigger asChild>{button}</TooltipTrigger>` -> `<TooltipTrigger render={button} />`. `TooltipContent side="right" align="center" hidden={…}` unchanged.
- Checked in the browser: collapsed admin sidebar, hovering "Dashboard" shows the tooltip on the right with its arrow; no console errors.
- Leftover scan: `grep -n "radix-ui\|@radix-ui" src/components/ui/tooltip.tsx` is clean.

## Left alone

- `ChartTooltip` / `ChartTooltipContent` in `ui/chart.tsx` are recharts, not Radix.

## Behavior changes

- Radix `disableHoverableContent` and `skipDelayDuration` have no Base UI equivalent (not used here).
- Base UI's trigger closes the tooltip on click by default (Radix closed it on pointer down); same visible result.

## Verify by hand

- Collapse the admin sidebar (Ctrl/Cmd+B or the header button) and hover each icon: tooltip appears instantly to the right, with the arrow pointing at the icon.
- With the sidebar expanded, no tooltip appears.
- Keyboard: Tab onto a collapsed icon shows its tooltip; Escape hides it.
