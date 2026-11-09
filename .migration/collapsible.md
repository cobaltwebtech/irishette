# collapsible

2026-11-08, transformation engine (wrapper was pristine `new-york-v4`; matches the base registry shape). Migrated to `@base-ui/react/collapsible`.

## Changed

- `src/components/ui/collapsible.tsx`: Radix namespace import -> `import { Collapsible as CollapsiblePrimitive } from '@base-ui/react/collapsible'`; `CollapsibleTrigger` -> `Trigger`, `CollapsibleContent` -> `Panel`; props typed `*.Props`. Exported names unchanged.
- `src/components/admin/AdminNavigation.tsx`: `<Collapsible asChild><SidebarMenuItem>` -> `<Collapsible render={<SidebarMenuItem />}>`; `<CollapsibleTrigger asChild><SidebarMenuButton tooltip>` -> `<CollapsibleTrigger render={<SidebarMenuButton tooltip={…} />}>`; chevron `group-data-[state=open]/collapsible:rotate-90` -> `group-data-open/collapsible:rotate-90` (Base UI root emits `data-open`).
- `src/components/default-catch-boundary.tsx`: `<CollapsibleTrigger asChild><Button …>` -> `<CollapsibleTrigger render={<Button variant="link" size="sm" />}>`. `onOpenChange={setShowDetails}` still works (the extra `eventDetails` argument is ignored by the state setter).
- Leftover scan: `grep -n "radix-ui\|@radix-ui" src/components/ui/collapsible.tsx` is clean.

## Left alone

- `SidebarMenuSubButton asChild` inside AdminNavigation belongs to the sidebar migration.

## Behavior changes

None expected. Both versions unmount the closed panel by default.

## Verify by hand

- Admin sidebar: each section (Dashboard, Notifications, Bookings, …) starts open, collapses and expands on click, and its chevron rotates.
- Collapsed (icon) sidebar: section icons still show their tooltip on hover.
- Error page (throw in a route): "Technical Details" toggles the stack trace.
