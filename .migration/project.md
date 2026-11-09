# project

2026-11-08. Radix UI -> Base UI, progressive per component (one commit each), legacy `new-york` (v4) style: the Radix golden from `https://ui.shadcn.com/r/styles/new-york-v4/<c>.json` was used only to classify local customisations; the transformation engine rewired primitives on the project's own files, keeping their classes.

## Dependency swap

- Added `@base-ui/react@1.9.0` (released 2026-10-09).
- Removed (after `fallow dead-code --unused-deps` listed exactly these): `@radix-ui/react-checkbox`, `-collapsible`, `-dialog`, `-dropdown-menu`, `-label`, `-scroll-area`, `-separator`, `-slot`, `-switch`, `-tooltip`. `pnpm-lock.yaml` has no `@radix-ui` entries left; `pnpm install --frozen-lockfile` passes.
- Earlier, separate commit: `shadcn migrate cn` replaced `clsx` + `tailwind-merge` with `cn` (`@/utils/twMerge` re-exports it).

## Migrated wrappers (13)

button, separator, label, badge, checkbox, switch, collapsible, scroll-area, tooltip, dropdown-menu, dialog, sheet, sidebar. See each `.migration/<component>.md`.

Not Radix, no change needed: alert, card, input, password, skeleton, table, textarea.

## Intentionally untouched

- `ui/calendar.tsx` (react-day-picker 10) and `ui/chart.tsx` (recharts): third-party, not Radix. Calendar only uses `buttonVariants`, which kept its API. There is no Base UI calendar to move to.
- `ui/sonner.tsx`: replaced by the Base UI Toast in its own step (plan 5.2), not part of the Radix sweep.

## App-code sweep

- 33 `Button asChild` links -> `buttonVariants` on the `Link`/`a` (keeps link semantics; Base UI Button must not render links).
- Other `asChild` call sites -> `render` (collapsible, dropdown triggers/items, dialog trigger, sidebar buttons). `grep -rn asChild src` is empty.
- `data-[state=open]` consumer classes -> `data-open` / `data-popup-open`; `--radix-*` CSS variables -> Base UI names. `grep -rn "radix" src` is empty.
- `checked="indeterminate"` -> `indeterminate` (admin inbox).
- `DropdownMenuLabel` wrapped in `DropdownMenuGroup` where it stood alone (Base UI throws otherwise).

## Flagged, not changed

- `components.json` still says `"style": "new-york"` and `shadcn info` reports `base: "radix"`. There is no `base-new-york` style, so `shadcn add <component>` will still deliver Radix variants. Choose later: switch the style to a `base-*` style (changes the look of newly added components), or add components by hand from a base style and restyle them. Not changed here (the plan says not to run `shadcn init --force` without asking).
- The shadcn skills refresh (`pnpm dlx skills update`) was blocked by the session's permission rules; the Phase 0 skills were used.

## Final build

`pnpm check` 0 errors (18 pre-existing warnings), `pnpm typecheck` passes, `cf build` passes, `check:bundle` OK. The full gate result is in the Phase 5 report.
