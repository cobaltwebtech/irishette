# sheet

2026-11-08, transformation engine (legacy `new-york` style; own classes and slide animations kept). Migrated to `@base-ui/react/dialog` (a sheet is a dialog).

## Changed

- `src/components/ui/sheet.tsx`:
  - `import * as SheetPrimitive from '@radix-ui/react-dialog'` -> `import { Dialog as SheetPrimitive } from '@base-ui/react/dialog'`; props typed `*.Props`; `'use client'` removed (not used by TanStack Start).
  - `Overlay` -> `Backdrop`, `Content` -> `Popup`. Exported names unchanged.
  - Classes: `data-[state=open|closed]:` -> `data-open:` / `data-closed:`. The full-width `slide-in-from-*` / `slide-out-to-*` keyframe animations are kept (the base registry swaps them for a 2.5rem translate with `data-starting-style`, which would change the look); Base UI waits for CSS keyframe exit animations before unmounting. `outline-none` added to the popup. Dropped the dead `data-[state=open]:bg-secondary` on the close button (Radix never set `data-state` on `Close`).
- Only consumer is the mobile sidebar (`sidebar.tsx`), which hides the close button with `[&>button]:hidden`; Base UI's `Close` is still a direct `<button>` child, so that keeps working. No consumer changes.
- Checked in the browser at 390px: the admin sidebar sheet opens from the left and matches the pre-migration screenshot; clicking outside closes it. No console errors.
- Leftover scan: `grep -n "radix-ui\|@radix-ui" src/components/ui/sheet.tsx` is clean.

## Left alone

- Nothing related.

## Behavior changes

None observed.

## Verify by hand

- Phone width, admin pages: the header sidebar button opens the sheet with a slide from the left, the backdrop darkens the page, a link navigates, Escape and outside click close it with a slide out, focus returns to the button.
