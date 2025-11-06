# tRPC Procedures Reference

**Last Updated:** 2025-11-05
**Version:** 1.0

Complete reference of all tRPC procedures in the Irishette application, including protection levels, inputs, outputs, and usage examples.

## Table of Contents

1. [Bookings Router](#bookings-router)
2. [Users Router](#users-router)
3. [Rooms Router](#rooms-router)
4. [Availability Router](#availability-router)
5. [Quick Reference Table](#quick-reference-table)
6. [Protection Level Legend](#protection-level-legend)

---

## Protection Level Legend

| Icon | Level | Description |
|------|-------|-------------|
| 🌐 | **Public** | No authentication required |
| 🔒 | **Protected** | Requires authentication |
| 🛡️ | **Admin** | Requires admin role |

---

## Bookings Router

Location: `src/integrations/trpc/bookings.ts`

### checkAvailability
- **Protection:** 🌐 Public
- **Type:** Query
- **Description:** Check if a room is available for specific dates

**Input:**
```typescript
{
  roomId: string;
  checkInDate: string;  // YYYY-MM-DD format
  checkOutDate: string; // YYYY-MM-DD format
}
```

**Output:**
```typescript
{
  roomId: string;
  checkInDate: string;
  checkOutDate: string;
  available: boolean;
  conflicts: Array<{
    checkInDate: string;
    checkOutDate: string;
    source: 'booking' | 'airbnb' | 'expedia';
  }>;
}
```

**Usage:**
```typescript
const availability = await trpc.bookings.checkAvailability.query({
  roomId: 'room-123',
  checkInDate: '2025-03-01',
  checkOutDate: '2025-03-05',
});
```

---

### calculateBooking
- **Protection:** 🌐 Public
- **Type:** Mutation
- **Description:** Calculate pricing for a booking (including taxes and fees)

**Input:**
```typescript
{
  roomId: string;
  checkInDate: string;
  checkOutDate: string;
  guestCount: number;
}
```

**Output:**
```typescript
{
  baseAmount: number;
  taxAmount: number;
  feesAmount: number;
  totalAmount: number;
  numberOfNights: number;
  pricePerNight: number;
}
```

**Usage:**
```typescript
const pricing = await trpc.bookings.calculateBooking.mutate({
  roomId: 'room-123',
  checkInDate: '2025-03-01',
  checkOutDate: '2025-03-05',
  guestCount: 2,
});
```

---

### createBooking
- **Protection:** 🔒 Protected
- **Type:** Mutation
- **Description:** Create a temporary booking (pending payment)

**Input:**
```typescript
{
  roomId: string;
  checkInDate: string;
  checkOutDate: string;
  guestCount: number;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  specialRequests?: string;
  basePrice: number;
  serviceFee: number;
  taxAmount: number;
  totalAmount: number;
}
```

**Output:**
```typescript
{
  bookingId: string;
  success: boolean;
}
```

**Usage:**
```typescript
const result = await trpc.bookings.createBooking.mutate({
  roomId: 'room-123',
  checkInDate: '2025-03-01',
  checkOutDate: '2025-03-05',
  guestCount: 2,
  guestName: 'John Doe',
  guestEmail: 'john@example.com',
  guestPhone: '555-0123',
  basePrice: 400,
  serviceFee: 40,
  taxAmount: 35.20,
  totalAmount: 475.20,
});
```

**Notes:**
- User ID comes from authenticated session
- Creates booking with status 'pending'
- Must be followed by `createCheckoutSession` for payment

---

### createCheckoutSession
- **Protection:** 🔒 Protected
- **Type:** Mutation
- **Description:** Create Stripe checkout session for booking payment

**Input:**
```typescript
{
  bookingId: string;
  successUrl: string;
  cancelUrl: string;
}
```

**Output:**
```typescript
{
  url: string;           // Stripe checkout URL
  sessionId: string;     // Stripe session ID
}
```

**Usage:**
```typescript
const checkout = await trpc.bookings.createCheckoutSession.mutate({
  bookingId: 'booking-123',
  successUrl: 'https://irishette.com/booking?step=confirmation',
  cancelUrl: 'https://irishette.com/booking?step=details',
});

// Redirect to Stripe
window.location.href = checkout.url;
```

**Notes:**
- Verifies booking belongs to authenticated user
- Booking must be in 'pending' status
- Returns Stripe checkout URL for redirect

---

### getMyBookings
- **Protection:** 🔒 Protected
- **Type:** Query
- **Description:** Get authenticated user's bookings with pagination

**Input:**
```typescript
{
  limit: number;        // Min: 1, Max: 100, Default: 10
  offset: number;       // Default: 0
  status?: 'pending' | 'confirmed' | 'cancelled' | 'completed';
}
```

**Output:**
```typescript
Array<{
  booking: {
    id: string;
    confirmationId: string;
    roomId: string;
    checkInDate: string;
    checkOutDate: string;
    numberOfNights: number;
    numberOfGuests: number;
    baseAmount: number;
    taxAmount: number | null;
    feesAmount: number | null;
    totalAmount: number;
    status: string;
    paymentStatus: string;
    guestName: string;
    guestEmail: string;
    guestPhone: string | null;
    specialRequests: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  room: {
    id: string;
    name: string;
    slug: string;
    basePrice: number;
  };
}>
```

**Usage:**
```typescript
const bookings = await trpc.bookings.getMyBookings.query({
  limit: 10,
  offset: 0,
  status: 'confirmed',
});
```

**Notes:**
- Automatically filters by authenticated user's ID
- Returns bookings with room information
- Sorted by creation date (newest first)

---

### getBooking
- **Protection:** 🔒 Protected
- **Type:** Query
- **Description:** Get detailed booking information

**Input:**
```typescript
{
  bookingId: string;
}
```

**Output:**
```typescript
{
  booking: { /* booking details */ };
  room: { /* room details */ };
  payment?: { /* payment details */ };
  user?: { /* user details - admin only */ };
}
```

**Usage:**
```typescript
const booking = await trpc.bookings.getBooking.query({
  bookingId: 'booking-123',
});
```

**Notes:**
- Regular users can only view their own bookings
- Admins can view any booking and get additional user data
- Includes payment information if available

---

### updateBooking
- **Protection:** 🔒 Protected
- **Type:** Mutation
- **Description:** Update booking details (before payment confirmation)

**Input:**
```typescript
{
  bookingId: string;
  specialRequests?: string;
  status?: 'pending' | 'confirmed' | 'cancelled' | 'completed';
}
```

**Output:**
```typescript
{
  success: boolean;
}
```

**Usage:**
```typescript
const result = await trpc.bookings.updateBooking.mutate({
  bookingId: 'booking-123',
  specialRequests: 'Please arrange early check-in',
});
```

**Notes:**
- Can only update own bookings
- Booking must be in 'pending' status
- Ownership verification enforced

---

### cancelBooking
- **Protection:** 🔒 Protected
- **Type:** Mutation
- **Description:** Cancel a booking

**Input:**
```typescript
{
  bookingId: string;
  reason?: string;
}
```

**Output:**
```typescript
{
  success: boolean;
}
```

**Usage:**
```typescript
const result = await trpc.bookings.cancelBooking.mutate({
  bookingId: 'booking-123',
  reason: 'Change of plans',
});
```

**Notes:**
- Can only cancel own bookings
- Updates status to 'cancelled'
- May trigger refund if payment was completed

---

### resendConfirmationEmail
- **Protection:** 🔒 Protected
- **Type:** Mutation
- **Description:** Resend booking confirmation email

**Input:**
```typescript
{
  bookingId: string;
}
```

**Output:**
```typescript
{
  success: boolean;
  message: string;
}
```

**Usage:**
```typescript
const result = await trpc.bookings.resendConfirmationEmail.mutate({
  bookingId: 'booking-123',
});
```

**Notes:**
- Users can resend their own confirmation emails
- Admins can resend any booking's confirmation
- Uses Resend API for email delivery

---

### adminListBookings
- **Protection:** 🛡️ Admin
- **Type:** Query
- **Description:** Get all bookings with filtering and pagination (admin only)

**Input:**
```typescript
{
  limit: number;     // Min: 1, Max: 100, Default: 10
  offset: number;    // Default: 0
  status?: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  paymentStatus?: 'pending' | 'paid' | 'failed' | 'refunded';
  roomId?: string;
  startDate?: string;
  endDate?: string;
}
```

**Output:**
```typescript
Array<{
  booking: { /* all booking fields */ };
  room: { id, slug, basePrice };
  user: { id, email, name };
}>
```

**Usage:**
```typescript
const allBookings = await trpc.bookings.adminListBookings.query({
  limit: 50,
  status: 'confirmed',
  roomId: 'room-123',
});
```

---

### adminGetStats
- **Protection:** 🛡️ Admin
- **Type:** Query
- **Description:** Get booking statistics (admin only)

**Input:** None

**Output:**
```typescript
{
  total: number;
  pending: number;
  confirmed: number;
  cancelled: number;
  totalRevenue: number;
  pendingPayments: number;
}
```

**Usage:**
```typescript
const stats = await trpc.bookings.adminGetStats.query();
```

---

### adminUpdateInternalNotes
- **Protection:** 🛡️ Admin
- **Type:** Mutation
- **Description:** Update internal notes for a booking (admin only)

**Input:**
```typescript
{
  bookingId: string;
  internalNotes: string;
}
```

**Output:**
```typescript
{
  success: boolean;
  message: string;
}
```

**Usage:**
```typescript
const result = await trpc.bookings.adminUpdateInternalNotes.mutate({
  bookingId: 'booking-123',
  internalNotes: 'Guest requested late checkout',
});
```

---

## Users Router

Location: `src/integrations/trpc/users.ts`

### adminListGuests
- **Protection:** 🛡️ Admin
- **Type:** Query
- **Description:** Get all guests (users with role 'user') with booking counts

**Input:**
```typescript
{
  limit: number;   // Min: 1, Max: 100, Default: 50
  offset: number;  // Default: 0
}
```

**Output:**
```typescript
{
  guests: Array<{
    user: {
      id: string;
      name: string;
      email: string;
      createdAt: Date;
      stripeCustomerId: string | null;
      phoneNumber: string | null;
    };
    bookingCount: number;
  }>;
  total: number;
  hasMore: boolean;
}
```

**Usage:**
```typescript
const guests = await trpc.users.adminListGuests.query({
  limit: 50,
  offset: 0,
});
```

---

### adminGetGuestDetails
- **Protection:** 🛡️ Admin
- **Type:** Query
- **Description:** Get detailed guest information including all bookings

**Input:**
```typescript
{
  userId: string;
}
```

**Output:**
```typescript
{
  user: { /* all user fields */ };
  bookings: Array<{ /* all booking fields */ }>;
}
```

**Usage:**
```typescript
const guestDetails = await trpc.users.adminGetGuestDetails.query({
  userId: 'user-123',
});
```

---

### updatePhoneNumber
- **Protection:** 🔒 Protected
- **Type:** Mutation
- **Description:** Update authenticated user's phone number

**Input:**
```typescript
{
  phoneNumber: string;  // Min: 10 digits
}
```

**Output:**
```typescript
{
  success: boolean;
  message: string;
}
```

**Usage:**
```typescript
const result = await trpc.users.updatePhoneNumber.mutate({
  phoneNumber: '555-0123',
});
```

**Notes:**
- Updates phone number for authenticated user
- User ID comes from session
- Phone number must be at least 10 digits

---

### updateProfile
- **Protection:** 🔒 Protected
- **Type:** Mutation
- **Description:** Update authenticated user's profile information

**Input:**
```typescript
{
  name?: string;        // Min: 1 character
  email?: string;       // Must be valid email
  phoneNumber?: string; // Min: 10 digits
}
```

**Output:**
```typescript
{
  success: boolean;
  message: string;
}
```

**Usage:**
```typescript
const result = await trpc.users.updateProfile.mutate({
  name: 'John Doe',
  phoneNumber: '555-0123',
});
```

**Notes:**
- All fields are optional
- Only provided fields are updated
- Updates authenticated user's profile

---

## Rooms Router

Location: `src/integrations/trpc/rooms.ts`

### ping
- **Protection:** 🌐 Public
- **Type:** Query
- **Description:** Health check endpoint

**Input:** None

**Output:**
```typescript
{
  message: string;
  timestamp: string;
}
```

**Usage:**
```typescript
const pong = await trpc.rooms.ping.query();
// { message: 'pong', timestamp: '2025-01-15T10:30:00Z' }
```

---

### list
- **Protection:** 🌐 Public
- **Type:** Query
- **Description:** Get all rooms with pagination and filtering

**Input:**
```typescript
{
  limit: number;    // Default: 50
  offset: number;   // Default: 0
  status?: 'active' | 'inactive' | 'archived';
  isActive?: boolean;  // Legacy support
}
```

**Output:**
```typescript
{
  rooms: Array<{
    id: string;
    name: string;
    slug: string;
    description: string;
    basePrice: number;
    status: string;
    isActive: boolean;
    airbnbIcalUrl: string | null;
    expediaIcalUrl: string | null;
    lastAirbnbSync: Date | null;
    lastExpediaSync: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}
```

**Usage:**
```typescript
const rooms = await trpc.rooms.list.query({
  limit: 10,
  status: 'active',
});
```

---

### get
- **Protection:** 🌐 Public
- **Type:** Query
- **Description:** Get single room by ID

**Input:**
```typescript
{
  id: string;
}
```

**Output:**
```typescript
{
  id: string;
  name: string;
  slug: string;
  description: string;
  basePrice: number;
  // ... all room fields
}
```

**Usage:**
```typescript
const room = await trpc.rooms.get.query({
  id: 'room-123',
});
```

---

### checkAvailability
- **Protection:** 🌐 Public
- **Type:** Query
- **Description:** Check room availability for date range

**Input:**
```typescript
{
  roomId: string;
  startDate: string;
  endDate: string;
}
```

**Output:**
```typescript
{
  roomId: string;
  available: boolean;
  conflictingBookings: Array<any>;
  externalConflicts: Array<any>;
}
```

**Usage:**
```typescript
const availability = await trpc.rooms.checkAvailability.query({
  roomId: 'room-123',
  startDate: '2025-03-01',
  endDate: '2025-03-05',
});
```

---

### bulkAvailability
- **Protection:** 🌐 Public
- **Type:** Query
- **Description:** Check availability for multiple rooms

**Input:**
```typescript
{
  roomIds?: string[];
  startDate: string;
  endDate: string;
}
```

**Output:**
```typescript
{
  availability: Array<{
    roomId: string;
    roomSlug: string;
    available: boolean;
    conflictingBookings: number;
  }>;
  dateRange: {
    startDate: string;
    endDate: string;
  };
  totalRooms: number;
}
```

**Usage:**
```typescript
const availability = await trpc.rooms.bulkAvailability.query({
  startDate: '2025-03-01',
  endDate: '2025-03-05',
});
```

---

### calculatePricing
- **Protection:** 🌐 Public
- **Type:** Query
- **Description:** Calculate room pricing with rules applied

**Input:**
```typescript
{
  roomId: string;
  checkInDate: string;
  checkOutDate: string;
  guestCount: number;
}
```

**Output:**
```typescript
{
  baseAmount: number;
  appliedRules: Array<{
    id: string;
    name: string;
    ruleType: string;
    value: number;
  }>;
  roomBasePrice: number;
}
```

**Usage:**
```typescript
const pricing = await trpc.rooms.calculatePricing.query({
  roomId: 'room-123',
  checkInDate: '2025-03-01',
  checkOutDate: '2025-03-05',
  guestCount: 2,
});
```

---

### getIcalConfig
- **Protection:** 🌐 Public
- **Type:** Query
- **Description:** Get room's iCal configuration for export

**Input:**
```typescript
{
  roomId: string;
}
```

**Output:**
```typescript
{
  roomId: string;
  roomSlug: string;
  icalUrls: {
    airbnb: string | null;
    expedia: string | null;
  };
  lastSync: {
    airbnb: Date | null;
    expedia: Date | null;
  };
  configured: {
    airbnb: boolean;
    expedia: boolean;
  };
  exportUrls: {
    byId: string;
    bySlug: string;
  };
}
```

**Usage:**
```typescript
const config = await trpc.rooms.getIcalConfig.query({
  roomId: 'room-123',
});
```

---

### generateIcal
- **Protection:** 🌐 Public
- **Type:** Query
- **Description:** Generate iCal feed for room

**Input:**
```typescript
{
  roomId: string;
}
```

**Output:**
```typescript
{
  roomId: string;
  content: string;        // iCal format
  contentType: string;    // 'text/calendar'
  filename: string;
}
```

**Usage:**
```typescript
const ical = await trpc.rooms.generateIcal.query({
  roomId: 'room-123',
});
```

---

### create
- **Protection:** 🛡️ Admin
- **Type:** Mutation
- **Description:** Create a new room

**Input:**
```typescript
{
  name: string;
  slug: string;
  description: string;
  basePrice: number;
  status?: 'active' | 'inactive' | 'archived';
  airbnbIcalUrl?: string;
  expediaIcalUrl?: string;
}
```

**Output:**
```typescript
{
  id: string;
  // ... all room fields
}
```

**Usage:**
```typescript
const room = await trpc.rooms.create.mutate({
  name: 'Rose Room',
  slug: 'rose-room',
  description: 'Beautiful room with garden view',
  basePrice: 150,
});
```

---

### update
- **Protection:** 🛡️ Admin
- **Type:** Mutation
- **Description:** Update existing room

**Input:**
```typescript
{
  id: string;
  name?: string;
  description?: string;
  basePrice?: number;
  // ... other room fields
}
```

**Output:**
```typescript
{
  id: string;
  // ... updated room fields
}
```

**Usage:**
```typescript
const room = await trpc.rooms.update.mutate({
  id: 'room-123',
  basePrice: 175,
});
```

---

### archive / activate / deactivate
- **Protection:** 🛡️ Admin
- **Type:** Mutation
- **Description:** Change room status

**Input:**
```typescript
{
  id: string;
}
```

**Output:**
```typescript
{
  success: boolean;
  id: string;
  status: string;
}
```

**Usage:**
```typescript
await trpc.rooms.archive.mutate({ id: 'room-123' });
await trpc.rooms.activate.mutate({ id: 'room-123' });
await trpc.rooms.deactivate.mutate({ id: 'room-123' });
```

---

### syncCalendar
- **Protection:** 🛡️ Admin
- **Type:** Mutation
- **Description:** Sync external calendar (Airbnb/Expedia)

**Input:**
```typescript
{
  roomId: string;
  platform: 'airbnb' | 'expedia';
}
```

**Output:**
```typescript
{
  success: boolean;
  syncedEvents: number;
  lastSync: Date;
  platform: string;
  errorMessage?: string;
}
```

**Usage:**
```typescript
const result = await trpc.rooms.syncCalendar.mutate({
  roomId: 'room-123',
  platform: 'airbnb',
});
```

---

### updateIcalUrls
- **Protection:** 🛡️ Admin
- **Type:** Mutation
- **Description:** Update room's iCal import URLs

**Input:**
```typescript
{
  roomId: string;
  airbnbIcalUrl?: string | null;
  expediaIcalUrl?: string | null;
}
```

**Output:**
```typescript
{
  success: boolean;
  roomId: string;
  updatedUrls: {
    airbnb: string | null;
    expedia: string | null;
  };
  updatedAt: Date;
}
```

**Usage:**
```typescript
const result = await trpc.rooms.updateIcalUrls.mutate({
  roomId: 'room-123',
  airbnbIcalUrl: 'https://airbnb.com/calendar/ical/...',
});
```

---

### testIcalUrl
- **Protection:** 🛡️ Admin
- **Type:** Mutation
- **Description:** Test if an iCal URL is valid

**Input:**
```typescript
{
  url: string;
}
```

**Output:**
```typescript
{
  success: boolean;
  url: string;
  contentLength?: number;
  eventCount?: number;
  preview?: string;
  error?: string;
  validatedAt: Date;
}
```

**Usage:**
```typescript
const result = await trpc.rooms.testIcalUrl.mutate({
  url: 'https://airbnb.com/calendar/ical/...',
});
```

---

### Pricing Rules (Admin Only)

All pricing rule endpoints require 🛡️ Admin protection:

- `getPricingRules` - List pricing rules for a room
- `createPricingRule` - Create new pricing rule
- `updatePricingRule` - Update existing pricing rule
- `deletePricingRule` - Delete pricing rule

---

### Blocked Periods (Admin Only)

All blocked period endpoints require 🛡️ Admin protection:

- `getBlockedPeriods` - List blocked periods
- `getBlockedPeriod` - Get single blocked period
- `createBlockedPeriod` - Create blocked period
- `updateBlockedPeriod` - Update blocked period
- `deleteBlockedPeriod` - Delete blocked period

---

## Availability Router

Location: `src/integrations/trpc/availability.ts`

### checkRoom
- **Protection:** 🌐 Public
- **Type:** Query
- **Description:** Check room availability with detailed conflict information

**Input:**
```typescript
{
  roomId: string;
  startDate: string;  // YYYY-MM-DD
  endDate: string;    // YYYY-MM-DD
}
```

**Output:**
```typescript
{
  roomId: string;
  startDate: string;
  endDate: string;
  available: boolean;
  externalConflicts: Array<{
    checkInDate: string;
    checkOutDate: string;
    source: 'airbnb' | 'expedia';
    externalBookingId: string;
  }>;
  room: {
    slug: string;
    basePrice: number;
  };
}
```

**Usage:**
```typescript
const availability = await trpc.availability.checkRoom.query({
  roomId: 'room-123',
  startDate: '2025-03-01',
  endDate: '2025-03-05',
});
```

---

### checkBulk
- **Protection:** 🌐 Public
- **Type:** Query
- **Description:** Check availability for multiple rooms at once

**Input:**
```typescript
{
  roomIds?: string[];
  startDate: string;
  endDate: string;
}
```

**Output:**
```typescript
{
  availability: Array<{
    roomId: string;
    roomSlug: string;
    basePrice: number;
    available: boolean;
    conflictCount: number;
    lastAirbnbSync: Date | null;
    lastExpediaSync: Date | null;
  }>;
  dateRange: {
    startDate: string;
    endDate: string;
  };
  totalRooms: number;
}
```

**Usage:**
```typescript
const availability = await trpc.availability.checkBulk.query({
  startDate: '2025-03-01',
  endDate: '2025-03-05',
});
```

---

### getBySlug
- **Protection:** 🌐 Public
- **Type:** Query
- **Description:** Get availability calendar by room slug (for frontend)

**Input:**
```typescript
{
  roomSlug: string;
  startDate?: string;
  endDate?: string;
  monthsAhead?: number;  // Default: 6
}
```

**Output:**
```typescript
{
  room: {
    id: string;
    name: string;
    slug: string;
    basePrice: number;
    status: string;
    lastAirbnbSync: Date | null;
    lastExpediaSync: Date | null;
  };
  dateRange: {
    startDate: string;
    endDate: string;
  };
  calendar: Array<{
    date: string;
    available: boolean;
    blocked: boolean;
    price: number;
    source?: string;
    booking?: {
      id: string;
      confirmationId: string;
      checkInDate: string;
      checkOutDate: string;
    };
  }>;
  summary: {
    totalDays: number;
    availableDays: number;
    blockedDays: number;
    bookings: number;
  };
}
```

**Usage:**
```typescript
const calendar = await trpc.availability.getBySlug.query({
  roomSlug: 'rose-room',
  monthsAhead: 3,
});
```

---

### syncCalendar
- **Protection:** 🛡️ Admin
- **Type:** Mutation
- **Description:** Sync external calendar for a room

**Input:**
```typescript
{
  roomId: string;
  platform: 'airbnb' | 'expedia';
}
```

**Output:**
```typescript
{
  success: boolean;
  roomId: string;
  platform: string;
  bookingsProcessed: number;
  syncedAt: Date;
}
```

**Usage:**
```typescript
const result = await trpc.availability.syncCalendar.mutate({
  roomId: 'room-123',
  platform: 'airbnb',
});
```

---

### syncAllCalendars
- **Protection:** 🛡️ Admin
- **Type:** Mutation
- **Description:** Sync all external calendars for all rooms

**Input:**
```typescript
{
  roomIds?: string[];  // Optional: sync specific rooms only
}
```

**Output:**
```typescript
{
  totalRooms: number;
  totalSyncAttempts: number;
  successfulSyncs: number;
  failedSyncs: number;
  syncResults: Array<{
    roomId: string;
    roomSlug: string;
    platform: string;
    success: boolean;
    bookingsProcessed: number;
    errorMessage?: string;
  }>;
  syncedAt: Date;
}
```

**Usage:**
```typescript
const result = await trpc.availability.syncAllCalendars.mutate({});
```

---

### getCalendar
- **Protection:** 🛡️ Admin
- **Type:** Query
- **Description:** Get availability calendar for admin dashboard

**Input:**
```typescript
{
  roomId: string;
  startDate: string;
  endDate: string;
}
```

**Output:**
```typescript
{
  roomId: string;
  roomSlug: string;
  dateRange: {
    startDate: string;
    endDate: string;
  };
  calendar: Array<{
    date: string;
    available: boolean;
    blocked: boolean;
    source?: string;
    priceOverride?: number;
    externalBookingId?: string;
  }>;
  lastSync: {
    airbnb: Date | null;
    expedia: Date | null;
  };
}
```

**Usage:**
```typescript
const calendar = await trpc.availability.getCalendar.query({
  roomId: 'room-123',
