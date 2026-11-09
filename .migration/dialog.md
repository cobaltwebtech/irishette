# dialog

2026-11-08, transformation engine (legacy `new-york` style; own classes and the Iconify close icon kept). Migrated to `@base-ui/react/dialog`.

## Changed

- `src/components/ui/dialog.tsx`:
  - `@radix-ui/react-dialog` -> `import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'`; props typed `*.Props`.
  - `Overlay` -> `Backdrop` (exported name `DialogOverlay` unchanged), `Content` -> `Popup` (centered modal, no Positioner). Exported names unchanged.
  - Classes: `data-[state=open|closed]:` -> `data-open:` / `data-closed:` on the backdrop and popup (tw-animate keyframes kept, as in the base registry); `outline-none` added to the popup, which Base UI focuses when nothing inside is focusable. Dropped `data-[state=open]:bg-accent data-[state=open]:text-muted-foreground` from the close button: Radix never set `data-state` on `Close`, so they never applied.
- `src/components/admin/BookingInternalNotes.tsx`: `<DialogTrigger asChild><Button …>` -> `<DialogTrigger render={<Button … />}>`.
- The other dialog consumers (EditProfileModal, CancelBookingButton, RoomCalendarIntegration, RoomBlockingManagement, RoomPricingRules, inbox pages) use controlled `open` / `onOpenChange` and need no change (one-argument handlers ignore Base UI's `eventDetails`). None used Radix's `onOpenAutoFocus`, `onEscapeKeyDown`, `onPointerDownOutside` or `forceMount`.
- Checked in the browser (admin room page, "Add Rule"): dialog opens with the same look, focus moves to the first input, page scroll is locked, Escape closes it and focus returns to "Add Rule". No console errors.
- Leftover scan: `grep -n "radix-ui\|@radix-ui" src/components/ui/dialog.tsx` is clean.

## Left alone

- `sheet.tsx` also uses the dialog primitive; migrated in its own commit.

## Behavior changes

- Base UI's initial focus follows the same rule (first tabbable element), but when a dialog has no tabbable element Base UI focuses the popup itself.

## Verify by hand

- Account page: Edit profile opens, saves, closes; Escape and outside click close it.
- Booking detail (account): Cancel booking dialog opens and its buttons work.
- Admin room page: Add Rule / Add Blocked Dates / calendar feed dialogs, and their Edit and Delete confirmations from the row menus.
- Admin booking page: internal notes "Add note" dialog.
- Admin inbox: delete confirmation dialog.
