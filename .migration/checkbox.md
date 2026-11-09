# checkbox

2026-11-08, transformation engine (legacy `new-york` style; own classes kept). Migrated to `@base-ui/react/checkbox`.

## Changed

- `src/components/ui/checkbox.tsx`: `import * as CheckboxPrimitive from '@radix-ui/react-checkbox'` -> `import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox'`; props typed `CheckboxPrimitive.Root.Props`. Classes: `data-[state=checked]:` -> `data-checked:`; `disabled:` -> `data-disabled:` (the Base UI root is not a native control, so `:disabled` never matches). Local look kept (`rounded-sm`, `bg-muted`, the Iconify `tabler:check` icon).
- `src/routes/_authed/_admin/admin/inbox/index.tsx`: the select-all header checkbox passed `checked="indeterminate"`; now `checked={allSelected}` plus a separate `indeterminate` boolean (consumer-props table). It renders as before (check icon on the muted box).
- `PaymentStep.tsx` (`id` + `<Label htmlFor>`) needs no change: Base UI puts `id` on its hidden `<input>`, so the label association still works. `onCheckedChange` handlers keep working (Base UI passes `(checked: boolean, eventDetails)`).
- Leftover scan: `grep -n "radix-ui\|@radix-ui" src/components/ui/checkbox.tsx` is clean.

## Left alone

- Nothing related.

## Behavior changes

- `peer-disabled:` styles on a sibling `<Label>` no longer react to a disabled checkbox (the root is no longer a `<button disabled>`). No current call site disables a checkbox.

## Verify by hand

- Booking payment step: clicking the box or the "Policies Acknowledgement" label toggles it; the error state (red ring) shows when unchecked on submit.
- Admin inbox: row checkboxes select rows without opening the row; select-all shows the partial state when some rows are selected, and toggles all.
