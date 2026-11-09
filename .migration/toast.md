# toast

2026-11-08. Plan 02 decision: replace `sonner` with shadcn's Base UI Toast (`@base-ui/react/toast`), restyled to match the sonner toasts. Not a Radix migration (sonner is not Radix), so this is outside the skill's golden-pair flow: the wrapper follows the shadcn base registry `toast.tsx` structure (global `createToastManager`, `Toaster` = Provider + Portal + Viewport + list) with this project's look.

## Changed

- New `src/components/ui/toast.tsx`:
  - Exports `toast` (the global manager: `toast.add({ type, title, description, timeout })`), `Toaster` and the parts (`Toast`, `ToastContent`, `ToastTitle`, `ToastDescription`, `ToastAction`, `ToastClose`, `ToastPortal`, `ToastProvider`, `ToastViewport`).
  - Look copied from the sonner toaster (measured on the admin room page before and after): bottom-right, 24px offset, 356px wide (full width with 16px offset on small screens), `bg-secondary`, 1px `border-popover-foreground`, 8px radius, `0 4px 12px rgba(0,0,0,0.1)` shadow, 13px text, 16px padding, 6px gap, title 500 / line-height 1.5, description 400 / 1.4 / `#3f3f3f`, the same Iconify icons per type (`circle-check-filled`, `circle-x-filled`, `loader-2`, `alert-triangle-filled`, `alert-circle-filled`), no close button. The measured box matched exactly (x 900, y 822, 356x54, same colours, shadow and font).
  - 4s lifetime and 3 visible toasts (sonner defaults), stacked with peek and expand-on-hover (the base registry's stacking, tuned to sonner's 14px gap), swipe right/down to dismiss.
  - Viewport `z-100` so toasts stay above dialog backdrops (sonner's toaster sat above modals; at `z-50` they were dimmed under the dialog overlay).
- `src/routes/__root.tsx`: `Toaster` now comes from `@/components/ui/toast`.
- 57 call sites in 14 files: `toast.success|error|info(title, { description, duration })` -> `toast.add({ type, title, description, timeout })` (codemod; `duration` mapped to `timeout`, nothing dropped), and `import { toast } from 'sonner'` -> `@/components/ui/toast`.
- Removed `src/components/ui/sonner.tsx` and the `sonner` package.

## Left alone

- Comments mentioning "toast" in the room pages.

## Behavior changes

- Sonner's `toast.promise` / `toast.dismiss` / `toast.custom` are not used. The manager has `toast.promise`, `toast.close(id)` and `toast.update(id, …)` if needed later.
- Toasts pause their timer while the stack is hovered or focused (both libraries do this).
- **Merge note:** code written against `sonner` on other branches (for example Phase 3 work in progress) must switch to `toast.add({ type: 'success', title, description })` and the `@/components/ui/toast` import; typecheck flags every leftover.

## Verify by hand

- Admin room page: Copy the export URL -> green "Copied to clipboard" toast bottom-right, gone after about 4 seconds.
- Admin room page: save a room with an invalid value -> red error toast with a description.
- Trigger two toasts quickly: they stack; hovering expands the stack.
- With a dialog open, a toast shows above the backdrop, not dimmed.
- Login: "Logged in" toast after password sign-in.
