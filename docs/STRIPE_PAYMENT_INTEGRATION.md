# Stripe Payment Integration with Better Auth

This document outlines the complete Stripe payment integration for the Irishette booking platform, built to work seamlessly with Better Auth and the existing iCal sync system.

## Architecture Overview

The payment system follows a **temporary booking + checkout flow** pattern:

1. **Create Temporary Booking** → User fills booking details, system creates pending booking
2. **Create Checkout Session** → Generate Stripe checkout URL with booking details
3. **Payment Processing** → User completes payment via Stripe Checkout
4. **Webhook Confirmation** → Stripe webhook confirms payment, updates booking status
5. **Post-Payment Actions** → Send confirmations, update availability, etc.

## Core Components

### 1. Payment Validation Schemas (`/src/lib/payment-validation.ts`)

**Purpose**: Zod schemas for type-safe payment and booking validation

**Key Schemas**:

- `createBookingSchema` - Validates booking creation data
- `calculateBookingSchema` - Validates pricing calculation inputs
- `createCheckoutSessionSchema` - Validates Stripe checkout session creation
- `stripeWebhookSchema` - Validates incoming webhook data
- `cancelBookingSchema` - Validates booking cancellation requests

**Usage**: Ensures data integrity across the payment flow and provides TypeScript types.

### 2. Payment Service (`/src/lib/payment-service.ts`)

**Purpose**: Core business logic for payment processing and booking management

**Key Methods**:

#### `calculateBookingPrice(roomId, checkInDate, checkOutDate, guestCount)`

- Calculates room pricing with fees and taxes
- Returns: `{ baseAmount, feesAmount, taxAmount, totalAmount, numberOfNights }`
- Handles room lookup, date validation, and price calculations

#### `createTemporaryBooking(bookingData, userId)`

- Creates pending booking record before payment
- Validates room availability and prevents double bookings
- Returns booking ID for checkout session creation

#### `createCheckoutSession(bookingId, checkoutUrls)`

- Creates Stripe Checkout session with booking details
- Links to Better Auth Stripe customer
- Creates separate payment transaction record
- Returns checkout URL for user redirection

#### `confirmBookingPayment(sessionId)`

- Called by webhook when payment succeeds
- Updates booking status to 'confirmed'
- Updates payment transaction status
- Triggers post-booking workflows

#### `handlePaymentFailure(sessionId)`

- Handles cancelled or failed payments
- Updates booking and payment status appropriately

### 3. Bookings TRPC Router (`/src/integrations/trpc/bookings.ts`)

**Purpose**: Type-safe API endpoints for booking operations

**Key Endpoints**:

#### `calculateBooking`

- **Input**: Room ID, dates, guest count
- **Output**: Detailed pricing breakdown
- **Usage**: Frontend price calculation before booking

#### `createBooking`

- **Input**: Complete booking details + user ID
- **Output**: Booking ID and success status
- **Usage**: Create temporary booking before payment

#### `createCheckoutSession`

- **Input**: Booking ID + checkout URLs + user ID
- **Output**: Stripe session ID and checkout URL
- **Usage**: Generate payment link for user

#### `getBooking`

- **Input**: Booking ID (+ optional user ID)
- **Output**: Complete booking + payment details
- **Usage**: View booking status and payment info

#### `getMyBookings`

- **Input**: User ID + pagination + filters
- **Output**: User's bookings with room details
- **Usage**: User booking history dashboard

#### `cancelBooking`

- **Input**: Booking ID + user ID
- **Output**: Success status
- **Usage**: Cancel unpaid or refund paid bookings

#### Admin Endpoints:

- `adminListBookings` - Admin booking management
- `adminGetStats` - Booking statistics and revenue

### 4. Stripe Webhook Handler (`/src/lib/stripe-webhooks.ts`)

**Purpose**: Process Stripe payment lifecycle events

**Handled Events**:

- `checkout.session.completed` → Confirm booking payment
- `checkout.session.expired` → Cancel expired bookings
- `payment_intent.succeeded` → Additional payment processing
- `payment_intent.payment_failed` → Handle payment failures

**Security**: Validates webhook signatures using Stripe webhook secret

### 5. HTTP API Endpoints (`/src/integrations/hono/config.ts`)

**Added Endpoints**:

- `POST /api/webhooks/stripe` → Stripe payment webhook handler
- `POST /api/webhooks/test` → Webhook testing endpoint (development)

## Database Integration

### Bookings Table

- Stores complete booking details and status
- Links to Better Auth users and room records
- Tracks payment status separately from booking status

### Payment Transactions Table

- Separate payment tracking with Stripe integration
- Links to booking records
- Stores Stripe payment intent IDs and customer IDs

## Better Auth Integration

The payment system leverages Better Auth's existing Stripe customer integration:

1. **Automatic Customer Creation**: Better Auth creates Stripe customers during signup
2. **Customer Linking**: Payment service uses existing `stripeCustomerId` from user records
3. **One-Time Payments**: Uses Stripe Checkout for booking transactions
4. **Future Compatibility**: Architecture supports subscription upgrades later

## Environment Variables

Required environment variables for payment processing:

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Better Auth (already configured)
BETTER_AUTH_URL=https://your-domain.com
BETTER_AUTH_SECRET=your-secret

# Database (Cloudflare D1)
# Automatically available in Workers environment
```

## Usage Examples

### Frontend Booking Flow

```typescript
// 1. Calculate pricing
const pricing = await trpc.bookings.calculateBooking.mutate({
  roomId: 'room_123',
  checkInDate: '2024-01-15',
  checkOutDate: '2024-01-20',
  guestCount: 2,
})

// 2. Create booking
const booking = await trpc.bookings.createBooking.mutate({
  roomId: 'room_123',
  checkInDate: '2024-01-15',
  checkOutDate: '2024-01-20',
  guestCount: 2,
  guestName: 'John Doe',
  guestEmail: 'john@example.com',
  guestPhone: '+1234567890',
  billingAddress: {
    /* address object */
  },
  specialRequests: 'Late check-in please',
  // Pricing fields populated from calculation
  basePrice: pricing.baseAmount,
  totalAmount: pricing.totalAmount,
  userId: currentUser.id,
})

// 3. Create checkout session
const checkout = await trpc.bookings.createCheckoutSession.mutate({
  bookingId: booking.bookingId,
  successUrl: 'https://yoursite.com/booking/success',
  cancelUrl: 'https://yoursite.com/booking/cancel',
  userId: currentUser.id,
})

// 4. Redirect to Stripe Checkout
window.location.href = checkout.checkoutUrl
```

### Webhook Setup

1. **Stripe Dashboard**: Add webhook endpoint `https://yourdomain.com/api/webhooks/stripe`
2. **Events**: Select `checkout.session.completed` and `checkout.session.expired`
3. **Environment**: Add webhook secret to `STRIPE_WEBHOOK_SECRET`

## Security Considerations

1. **Webhook Verification**: All webhooks verify Stripe signatures
2. **User Authorization**: Booking operations validate user ownership
3. **Rate Limiting**: Consider adding rate limiting to booking endpoints
4. **Data Validation**: All inputs validated with Zod schemas
5. **Environment Secrets**: Stripe keys properly secured in environment

## Testing Strategy

### Development Testing

1. Use Stripe test mode keys
2. Test webhook endpoint with `/api/webhooks/test`
3. Use Stripe CLI for webhook testing: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`

### Payment Testing

1. Create test bookings with Stripe test cards
2. Verify booking status updates via webhooks
3. Test cancellation and refund flows

## Future Enhancements

### Phase 1 (Current)

- ✅ One-time booking payments
- ✅ Stripe Checkout integration
- ✅ Basic webhook handling
- ✅ Booking management APIs

### Phase 2 (Next)

- 🔄 Email confirmation system
- 🔄 Room availability blocking
- 🔄 Refund handling
- 🔄 Calendar event creation

### Phase 3 (Future)

- 📋 Subscription plans for hosts
- 📋 Multi-property management
- 📋 Advanced reporting
- 📋 Payment splitting

## Integration with iCal System

The payment system integrates seamlessly with the existing iCal sync:

1. **Confirmed Bookings**: Automatically block dates in room availability
2. **Cancellations**: Free up previously blocked dates
3. **External Sync**: Confirmed bookings appear in generated iCal feeds
4. **Conflict Prevention**: Payment validation checks existing availability

This creates a complete end-to-end booking system that handles payments while maintaining calendar synchronization with external platforms like Airbnb and Expedia.
