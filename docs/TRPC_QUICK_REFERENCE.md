# tRPC Quick Reference

**Last Updated:** 2025-11-05

Quick reference table for all tRPC procedures in the Irishette application.

## Legend

| Icon | Protection Level | Description |
|------|-----------------|-------------|
| 🌐 | Public | No authentication required |
| 🔒 | Protected | Requires authentication |
| 🛡️ | Admin | Requires admin role |
| 📖 | Query | Read operation |
| ✏️ | Mutation | Write operation |

---

## Bookings Router

| Procedure | Protection | Type | Description |
|-----------|-----------|------|-------------|
| `checkAvailability` | 🌐 | 📖 | Check if room is available for dates |
| `calculateBooking` | 🌐 | ✏️ | Calculate booking pricing with taxes/fees |
| `createBooking` | 🔒 | ✏️ | Create temporary booking (pending payment) |
| `createCheckoutSession` | 🔒 | ✏️ | Create Stripe checkout session |
| `getMyBookings` | 🔒 | 📖 | Get authenticated user's bookings |
| `getBooking` | 🔒 | 📖 | Get booking details (own or admin) |
| `updateBooking` | 🔒 | ✏️ | Update own booking (before payment) |
| `cancelBooking` | 🔒 | ✏️ | Cancel own booking |
| `resendConfirmationEmail` | 🔒 | ✏️ | Resend confirmation email |
| `adminListBookings` | 🛡️ | 📖 | List all bookings with filters |
| `adminGetStats` | 🛡️ | 📖 | Get booking statistics |
| `adminUpdateInternalNotes` | 🛡️ | ✏️ | Update booking internal notes |

---

## Users Router

| Procedure | Protection | Type | Description |
|-----------|-----------|------|-------------|
| `adminListGuests` | 🛡️ | 📖 | List all guests with booking counts |
| `adminGetGuestDetails` | 🛡️ | 📖 | Get guest details with all bookings |
| `updatePhoneNumber` | 🔒 | ✏️ | Update own phone number |
| `updateProfile` | 🔒 | ✏️ | Update own profile (name, email, phone) |

---

## Rooms Router

| Procedure | Protection | Type | Description |
|-----------|-----------|------|-------------|
| `ping` | 🌐 | 📖 | Health check endpoint |
| `list` | 🌐 | 📖 | List all rooms with pagination |
| `get` | 🌐 | 📖 | Get single room by ID |
| `checkAvailability` | 🌐 | 📖 | Check room availability |
| `bulkAvailability` | 🌐 | 📖 | Check multiple rooms availability |
| `calculatePricing` | 🌐 | 📖 | Calculate pricing with rules |
| `getIcalConfig` | 🌐 | 📖 | Get iCal export configuration |
| `generateIcal` | 🌐 | 📖 | Generate iCal feed |
| `create` | 🛡️ | ✏️ | Create new room |
| `update` | 🛡️ | ✏️ | Update existing room |
| `archive` | 🛡️ | ✏️ | Archive room (soft delete) |
| `activate` | 🛡️ | ✏️ | Activate room |
| `deactivate` | 🛡️ | ✏️ | Deactivate room |
| `syncCalendar` | 🛡️ | ✏️ | Sync external calendar |
| `updateIcalUrls` | 🛡️ | ✏️ | Update iCal import URLs |
| `testIcalUrl` | 🛡️ | ✏️ | Test iCal URL validity |
| `getPricingRules` | 🛡️ | 📖 | List pricing rules for room |
| `createPricingRule` | 🛡️ | ✏️ | Create new pricing rule |
| `updatePricingRule` | 🛡️ | ✏️ | Update pricing rule |
| `deletePricingRule` | 🛡️ | ✏️ | Delete pricing rule |
| `getBlockedPeriods` | 🛡️ | 📖 | List blocked periods |
| `getBlockedPeriod` | 🛡️ | 📖 | Get single blocked period |
| `createBlockedPeriod` | 🛡️ | ✏️ | Create blocked period |
| `updateBlockedPeriod` | 🛡️ | ✏️ | Update blocked period |
| `deleteBlockedPeriod` | 🛡️ | ✏️ | Delete blocked period |

---

## Availability Router

| Procedure | Protection | Type | Description |
|-----------|-----------|------|-------------|
| `checkRoom` | 🌐 | 📖 | Check room availability with conflicts |
| `checkBulk` | 🌐 | 📖 | Check multiple rooms at once |
| `getBySlug` | 🌐 | 📖 | Get availability calendar by room slug |
| `syncCalendar` | 🛡️ | ✏️ | Sync external calendar for room |
| `syncAllCalendars` | 🛡️ | ✏️ | Sync all calendars for all rooms |
| `getCalendar` | 🛡️ | 📖 | Get admin calendar view |
| `getSyncLogs` | 🛡️ | 📖 | Get calendar sync logs |

---

## Common Usage Patterns

### Guest Booking Flow (Public → Protected)
```typescript
// 1. Browse rooms (Public)
const rooms = await trpc.rooms.list.query({ status: 'active' });

// 2. Check availability (Public)
const available = await trpc.bookings.checkAvailability.query({
  roomId: 'room-123',
  checkInDate: '2025-03-01',
  checkOutDate: '2025-03-05',
});

// 3. Calculate pricing (Public)
const pricing = await trpc.bookings.calculateBooking.mutate({
  roomId: 'room-123',
  checkInDate: '2025-03-01',
  checkOutDate: '2025-03-05',
  guestCount: 2,
});

// 4. User logs in or signs up

// 5. Create booking (Protected - requires auth)
const booking = await trpc.bookings.createBooking.mutate({
  roomId: 'room-123',
  checkInDate: '2025-03-01',
  checkOutDate: '2025-03-05',
  guestCount: 2,
  guestName: 'John Doe',
  guestEmail: 'john@example.com',
  guestPhone: '555-0123',
  // ... pricing data
});

// 6. Create checkout session (Protected - requires auth)
const checkout = await trpc.bookings.createCheckoutSession.mutate({
  bookingId: booking.bookingId,
  successUrl: '...',
  cancelUrl: '...',
});

// 7. Redirect to Stripe
window.location.href = checkout.url;
```

### User Account Management (Protected)
```typescript
// View my bookings
const bookings = await trpc.bookings.getMyBookings.query({
  limit: 10,
  offset: 0,
});

// Update profile
await trpc.users.updateProfile.mutate({
  name: 'John Doe',
  phoneNumber: '555-0123',
});

// Cancel a booking
await trpc.bookings.cancelBooking.mutate({
  bookingId: 'booking-123',
});
```

### Admin Operations (Admin Only)
```typescript
// View all bookings
const allBookings = await trpc.bookings.adminListBookings.query({
  limit: 50,
  status: 'confirmed',
});

// Get booking statistics
const stats = await trpc.bookings.adminGetStats.query();

// Manage rooms
await trpc.rooms.create.mutate({
  name: 'New Room',
  slug: 'new-room',
  basePrice: 150,
});

// Sync calendars
await trpc.availability.syncAllCalendars.mutate({});

// View guest details
const guest = await trpc.users.adminGetGuestDetails.query({
  userId: 'user-123',
});
```

---

## By Protection Level

### Public Procedures (No Auth Required)
**Purpose:** Browsing, checking availability, calculating prices

- All room listing/viewing operations
- Availability checking
- Price calculations
- iCal feed generation
- Health checks

### Protected Procedures (Requires Auth)
**Purpose:** User-specific operations on own data

- Creating bookings
- Viewing own bookings
- Updating own bookings
- Canceling own bookings
- Updating own profile
- Resending own confirmation emails

### Admin Procedures (Requires Admin Role)
**Purpose:** Management operations across all data

- Viewing all bookings/users
- Managing rooms
- Managing pricing rules
- Managing blocked periods
- Syncing external calendars
- Viewing statistics and logs

---

## Security Notes

### ✅ Secure Patterns
```typescript
// ✅ Good - userId from session
protectedProcedure.query(({ ctx }) => {
  const userId = ctx.user.id; // From authenticated session
  return getBookings(userId);
});
```

### ❌ Insecure Patterns
```typescript
// ❌ Bad - userId from input (NEVER DO THIS)
publicProcedure.query(({ input }) => {
  const userId = input.userId; // User could pass anyone's ID!
  return getBookings(userId);
});
```

### Ownership Verification
```typescript
// ✅ Always verify ownership before updates
protectedProcedure.mutation(async ({ ctx, input }) => {
  const booking = await db.bookings.findUnique({
    where: { id: input.bookingId }
  });

  // Verify booking belongs to user
  if (booking.userId !== ctx.user.id) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }

  // Proceed with update
});
```

---

## Error Codes

| Code | When | Example |
|------|------|---------|
| `UNAUTHORIZED` | Not logged in | Accessing protected procedure without auth |
| `FORBIDDEN` | Insufficient permissions | Regular user accessing admin endpoint |
| `NOT_FOUND` | Resource doesn't exist | Booking ID not found |
| `BAD_REQUEST` | Invalid input | Malformed date format |
| `INTERNAL_SERVER_ERROR` | Server error | Database connection failed |

---

## Related Documentation

- [TRPC_SECURITY_IMPLEMENTATION.md](./TRPC_SECURITY_IMPLEMENTATION.md) - Detailed security architecture
- [TRPC_PROCEDURES_REFERENCE.md](./TRPC_PROCEDURES_REFERENCE.md) - Complete API reference with examples
- [AUTH_CHECK_UTILITIES.md](./AUTH_CHECK_UTILITIES.md) - Route-level authentication helpers
- [BOOKING_ARCHITECTURE.md](./BOOKING_ARCHITECTURE.md) - Booking flow documentation

---

## Summary Statistics

| Category | Public | Protected | Admin | Total |
|----------|--------|-----------|-------|-------|
| Bookings | 2 | 7 | 3 | 12 |
| Users | 0 | 2 | 2 | 4 |
| Rooms | 8 | 0 | 17 | 25 |
| Availability | 3 | 0 | 4 | 7 |
| **Total** | **13** | **9** | **26** | **48** |

---

**Last Updated:** January 2025
**Maintained By:** Development Team
