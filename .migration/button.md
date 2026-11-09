# button

2026-11-08, transformation engine (legacy `new-york` style: radix golden used only to classify; the project's own classes kept). Migrated to `@base-ui/react/button`.

## Changed

- `src/components/ui/button.tsx`: `Slot` / `asChild` replaced by the Base UI `Button` primitive (`ButtonPrimitive.Props`, which accepts `render`). Local customisations kept verbatim: `font-bold`, the `outline` (`bg-foreground/20`) and `accent` variants, the ghost hover, `lg` = `h-12 px-6 text-lg`, `shadow-xs` on filled variants.
- 33 `<Button asChild><Link|a>…</Link|a></Button>` call sites (Header, default-catch-boundary, not-found, home, rooms, legal pages, reset-password, account pages, confirmation, admin booking + inbox pages, InboxItemDetails) now put the classes on the link itself: `<Link className={cn(buttonVariants({ variant, size }), className)} data-slot="button">`. Base UI's Button enforces `role="button"` and must not render `<a>` (Base UI docs, "Rendering links as buttons"); Radix `Slot` kept them as real links, so this keeps link semantics. Extra props on the old Button (`onClick`) moved to the link.
- `Button` import dropped where it became unused (InboxItemDetails, past-bookings, cancellation-refund-policy, privacy-policy).
- Leftover scan: `grep -n "radix-ui\|@radix-ui" src/components/ui/button.tsx` is clean.

## Left alone

- `src/components/email/*`: their `Button` is `@react-email/components`, not this wrapper.
- `<Link><Button>…</Button></Link>` nesting in some admin/account pages (a button inside a link) is pre-existing and unchanged.

## Behavior changes

- Base UI `Button` renders `type="button"` by default; a native `<button>` defaults to `submit`. Every `Button` in a form either sets `type="submit"` or has its own `onClick`, so no form relied on the old default. New submit buttons must set `type="submit"`.

## Verify by hand

- Home hero and room cards: "View Bookings" / "View & Book …" are links (middle-click opens a new tab), styled as before.
- Header buttons (Admin, Logout, View Bookings) and the account page actions navigate.
- Forms (login, signup, contact, admin dialogs) still submit with Enter and with the submit button.
