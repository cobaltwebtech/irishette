# sidebar

2026-11-08, transformation engine (legacy `new-york` style; own classes, widths, header offset and Iconify icons kept). `Slot`/`asChild` -> `useRender` + `mergeProps`. This was the last Radix wrapper.

## Changed

- `src/components/ui/sidebar.tsx`:
  - `SidebarGroupLabel`, `SidebarGroupAction`, `SidebarMenuButton`, `SidebarMenuAction`, `SidebarMenuSubButton`: `asChild` + `Slot` -> `render` + `useRender({ defaultTagName, render, props: mergeProps(...) })`, props typed `useRender.ComponentProps<tag>`.
  - The `data-slot`, `data-sidebar`, `data-size` and `data-active` attributes are passed as explicit props (literal cast per the skill's mergeProps pitfall), not through `useRender`'s `state` like the base registry. `state` turns `active: false` into a missing attribute and `true` into `data-active=""`, which would break this project's `data-[active=true]:` and `peer-data-[active=true]/menu-button:` selectors.
  - `SidebarMenuButton` open styling `data-[state=open]:hover:` -> `data-popup-open:hover:` (Base UI menu triggers mark the open state with `data-popup-open`); `SidebarMenuAction` `data-[state=open]:opacity-100` -> `data-popup-open:opacity-100`.
  - The tooltip (`TooltipProvider delay`, `TooltipTrigger render={button}`) was updated in the tooltip commit; the mobile `Sheet` in the sheet commit.
- `src/components/admin/AdminNavigation.tsx`: `<SidebarMenuSubButton asChild><Link>` -> `render={<Link to=… />}`.
- `src/components/admin/AdminSidebar.tsx`: `<SidebarMenuButton size="lg" asChild><a href="/admin">` -> `render={<a href="/admin" />}`, with an `oxlint-disable-next-line jsx-a11y/control-has-associated-label` (reason: the link text is the button's children; the rule only sees the empty element in the prop).
- Checked in the browser: header and sub items render as `<a href>` with `data-size` / `data-active` as before; collapsed sidebar tooltips; user menu open/keyboard/Escape/focus return; mobile sheet open and outside-click close. No console errors.
- Leftover scan: `grep -rn "radix-ui\|@radix-ui" src` is clean (only `package.json` entries remain, removed in the cleanup commit).

## Left alone

- `SidebarProvider` state, cookie and keyboard shortcut, `Sidebar`, `SidebarRail`, `SidebarInset` and the layout parts: no Radix code.
- The existing hydration warning on `data-state` / `data-collapsible` (server renders the cookie state, the client renders the default) is pre-existing and unrelated; it also shows in the pre-migration run.
- `react/set-state-in-effect` in `use-mobile.ts` is part of Phase 5.3.

## Behavior changes

- Section triggers that are also collapsible triggers now carry `data-slot="collapsible-trigger"` (the outer `render` part's slot wins), where Radix `Slot` left `sidebar-menu-button`. Nothing selects on that slot; `data-sidebar="menu-button"` is unchanged.

## Verify by hand

- Admin sidebar: section headers collapse/expand; sub links navigate (middle-click opens a tab); the "Irishette Admin Panel" header links to /admin.
- Ctrl/Cmd+B collapses to icons; hovering shows tooltips; expanding again hides them.
- Phone width: the sheet opens from the header button and closes on outside click or Escape.
