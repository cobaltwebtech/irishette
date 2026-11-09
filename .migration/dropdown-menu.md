# dropdown-menu

2026-11-08, transformation engine (structure from the base registry `Menu` wrapper; this project's classes, Iconify icons and Radix positioning defaults kept). Migrated to `@base-ui/react/menu`.

## Changed

- `src/components/ui/dropdown-menu.tsx`:
  - `@radix-ui/react-dropdown-menu` -> `import { Menu as MenuPrimitive } from '@base-ui/react/menu'`. Part renames: `Label` -> `GroupLabel`, `ItemIndicator` -> `CheckboxItemIndicator` / `RadioItemIndicator`, `Sub` -> `SubmenuRoot`, `SubTrigger` -> `SubmenuTrigger`, `Content` -> `Portal > Positioner > Popup`, `SubContent` composes `DropdownMenuContent` (`side="right" align="start" alignOffset={-3} sideOffset={0}`).
  - `DropdownMenuContent` declares, destructures and forwards `side`, `sideOffset`, `align`, `alignOffset` to the Positioner. Defaults are Radix's (`side="bottom"`, `align="center"`, `sideOffset=4`), not the base registry's `align="start"`, so every menu opens where it did.
  - Classes: `--radix-dropdown-menu-content-available-height` -> `--available-height`, `--radix-dropdown-menu-content-transform-origin` -> `--transform-origin`, `data-[state=open|closed]:` -> `data-open:` / `data-closed:`, SubTrigger `data-[state=open]:` -> `data-popup-open:`. Item, label, separator and shortcut classes unchanged.
- Consumers:
  - `AdminUser.tsx`: trigger `asChild` -> `render={<SidebarMenuButton … />}`; trigger open styling `data-[state=open]:` -> `data-popup-open:`; content width `w-[--radix-dropdown-menu-trigger-width]` (Tailwind v3 syntax, a no-op in v4) -> `w-(--anchor-width)` (resolves to the same 224px through `min-w-56`); the user-info `DropdownMenuLabel` wrapped in `DropdownMenuGroup`; the two `DropdownMenuItem asChild` links -> `render={<Link to=… />}` with `nativeButton={false}`.
  - `RoomBlockingManagement.tsx`, `RoomPricingRules.tsx`: trigger `asChild` -> `render={<Button … />}`; the "Actions" label and the Edit item wrapped in `DropdownMenuGroup`.
  - `admin/property-management/index.tsx`: trigger `asChild` -> `render={<Button … />}`.
- Checked in the browser: admin user menu opens at the same place and size as before (compared with the pre-migration screenshot), ArrowDown focuses "Go to Homepage", Escape closes and returns focus to the trigger; the room pricing-rule row menu shows "Actions", Edit, Delete. No console errors.
- Leftover scan: `grep -n "radix-ui\|@radix-ui" src/components/ui/dropdown-menu.tsx` is clean.

## Left alone

- `SidebarMenuButton`'s own `data-[state=open]:hover:` classes belong to the sidebar migration.

## Behavior changes

- `Menu.GroupLabel` throws outside a `Menu.Group` (Radix `Label` worked anywhere). Every `DropdownMenuLabel` must sit inside `DropdownMenuGroup`; the wrapper has a doc comment saying so.
- Base UI `CheckboxItem` / `RadioItem` do not close the menu on click by default (`closeOnClick` false). No current call site uses them.
- Item handlers: Base UI has no `onSelect`; items use `onClick` (all call sites already did).

## Verify by hand

- Admin sidebar footer: click the user, the menu opens to the right (bottom on mobile), both links navigate and close the menu; Escape returns focus to the button; typeahead ("A") jumps to "Admin Dashboard".
- Admin room page: "…" on a pricing rule and a blocked period opens Edit / Delete; each opens its dialog.
- All Rooms page: "Change Room Status" menu switches Active / Inactive.
