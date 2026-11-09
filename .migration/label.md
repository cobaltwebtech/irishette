# label

2026-11-08, transformation engine. Base UI has no Label primitive: native `<label>`.

## Changed

- `src/components/ui/label.tsx`: `LabelPrimitive.Root` -> native `<label>`, props typed `React.ComponentProps<'label'>`. Classes unchanged. An `oxlint-disable-next-line jsx-a11y/label-has-associated-control` with a reason: it is a generic wrapper and every caller passes `htmlFor` or nests the control.
- No call-site changes (14 importers; all props are native label props).
- Leftover scan: `grep -n "radix-ui\|@radix-ui" src/components/ui/label.tsx` is clean.

## Left alone

- Nothing related.

## Behavior changes

- Radix Label prevented text selection when the label was double-clicked. A native label allows it; `select-none` in the classes still prevents selection in practice.

## Verify by hand

- Clicking a label focuses its input (login, contact, admin room details).
- Checkbox and switch labels toggle their control.
