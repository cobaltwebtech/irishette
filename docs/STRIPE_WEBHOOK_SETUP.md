# Stripe Webhook Setup Guide

## Overview

The Stripe webhook endpoint is now configured at `/api/stripe/webhook` and handles payment completion events to finalize bookings in your database.

## Files Created/Modified

### 1. Webhook Endpoint: `/src/routes/api/stripe/$.ts`
- Handles Stripe webhook events following TanStack Start routing pattern
- Uses Cloudflare bindings for environment variables
- Validates webhook signatures for security
- Processes payment completion events

### 2. Enhanced PaymentService: `/src/lib/payment-service.ts`
- Added `confirmBookingPayment()` method for finalizing bookings
- Added `blockRoomDates()` to prevent double bookings
- Added `sendConfirmationEmail()` placeholder for notifications
- Enhanced error handling and logging

### 3. Updated Database Schema: `/src/db/booking-schema.ts`
- Added `stripeSessionId` and `stripePaymentIntentId` fields
- Enables tracking of Stripe payment references

## Webhook Events Handled

1. **checkout.session.completed** - Payment successful
   - Updates booking status to 'confirmed'
   - Updates payment status to 'paid'
   - Blocks room dates in availability calendar
   - Sends confirmation email (TODO)

2. **checkout.session.expired** - Payment session expired
   - Updates booking status to 'cancelled'
   - Updates payment status to 'failed'

3. **payment_intent.payment_failed** - Payment failed
   - Logs the failure for investigation

## Environment Variables Required

Make sure these are set in your Cloudflare Worker environment:

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
BETTER_AUTH_URL=https://your-domain.com
```

## Testing the Webhook

### 1. Local Testing with Stripe CLI

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login to your Stripe account
stripe login

# Forward webhooks to your local development server
stripe listen --forward-to localhost:3000/api/stripe/webhook

# In another terminal, trigger test events
stripe trigger checkout.session.completed
stripe trigger checkout.session.expired
```

### 2. Manual Testing (Limited)

Run the provided test script (note: will fail signature verification):

```bash
./test-webhook.sh
```

## Production Deployment

### 1. Configure Webhook in Stripe Dashboard

1. Go to your Stripe Dashboard > Webhooks
2. Add endpoint: `https://your-domain.com/api/stripe/webhook`
3. Select events to send:
   - `checkout.session.completed`
   - `checkout.session.expired`
   - `payment_intent.payment_failed`
4. Copy the webhook signing secret to your environment variables

### 2. Database Migration

If you're adding this to an existing database, you may need to run a migration to add the new Stripe fields:

```sql
ALTER TABLE bookings ADD COLUMN stripe_session_id TEXT;
ALTER TABLE bookings ADD COLUMN stripe_payment_intent_id TEXT;
```

## Integration with Booking Flow

The webhook works automatically with your existing booking flow:

1. User completes booking form (`/booking`)
2. `PaymentService.createTemporaryBooking()` creates pending booking
3. `PaymentService.createCheckoutSession()` redirects to Stripe
4. User completes payment on Stripe
5. **Stripe sends webhook to `/api/stripe/webhook`** ← NEW
6. **Webhook confirms booking and blocks dates** ← NEW
7. User redirected to confirmation page

## Security Features

- **Signature Verification**: All webhooks are verified using Stripe's signature
- **Idempotency**: Safe to receive duplicate events
- **Error Handling**: Failed webhooks don't break the system
- **Logging**: Comprehensive logging for debugging

## Next Steps (TODO)

1. **Implement Email Service**: Replace the placeholder in `sendConfirmationEmail()`
2. **Add More Events**: Handle refunds, disputes, etc.
3. **Admin Notifications**: Notify staff of new bookings
4. **Analytics**: Track conversion rates and payment success

## Troubleshooting

### Common Issues

1. **Webhook not receiving events**
   - Check Stripe dashboard webhook logs
   - Verify endpoint URL is correct
   - Ensure webhook secret is properly set

2. **Signature verification fails**
   - Verify `STRIPE_WEBHOOK_SECRET` matches Stripe dashboard
   - Check request body is not modified by middleware

3. **Database errors**
   - Ensure booking exists before webhook processes
   - Check database connection and schema

### Debugging

Check your application logs for:
- `Stripe webhook received`
- `Processing checkout completion: cs_xxx`
- `Booking confirmed successfully`
- `Post-booking workflows completed`

Any errors will be logged with full context for investigation.