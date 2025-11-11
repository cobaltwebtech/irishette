# Saved Payment Methods Implementation

This document explains how payment methods are saved for future use in the Irish Ette booking system.

## Overview

When a customer completes a booking payment, their card is automatically saved to their Stripe customer profile for future use. This makes subsequent bookings faster and more convenient.

## How It Works

### 1. Backend Implementation (`payment-service.ts`)

The `createPaymentIntent` method now includes the `setup_future_usage: 'off_session'` parameter:

```typescript
const paymentIntent = await this.stripe.paymentIntents.create({
  amount: Math.round(booking.totalAmount * 100),
  currency: 'usd',
  customer: stripeCustomerId,
  metadata: {
    bookingId: booking.id,
    userId: userId,
    roomId: booking.roomId,
    type: 'booking',
  },
  automatic_payment_methods: {
    enabled: true,
  },
  setup_future_usage: 'off_session', // Saves the card for future use
});
```

### 2. Frontend Implementation (`PaymentStep.tsx`)

The payment form now includes:

- **Card Storage Notice**: Informs users their card will be automatically saved for post-checkout charges
- **Policy Acceptance**: Required checkbox for Terms of Service, Privacy Policy, and Cancellation/Refund Policy
- **Clear Messaging**: Explains cards are saved for potential additional charges (room service, extra fees, etc.)
- **No Opt-Out**: Card saving is mandatory to handle post-checkout transactions

### 3. What `setup_future_usage: 'off_session'` Means

- **off_session**: The payment method is saved for future charges when the customer is not actively present
- **Perfect for**: Recurring payments, future bookings, or any charge initiated by the system
- **Authentication**: The card is properly authenticated during the first payment

## Using Saved Payment Methods for Future Bookings

### Retrieving Saved Payment Methods

```typescript
// List all saved payment methods for a customer
const paymentMethods = await stripe.paymentMethods.list({
  customer: stripeCustomerId,
  type: 'card',
});

// Access the payment methods
paymentMethods.data.forEach((pm) => {
  console.log(`Card ending in ${pm.card?.last4}`);
  console.log(`Brand: ${pm.card?.brand}`);
  console.log(`Expires: ${pm.card?.exp_month}/${pm.card?.exp_year}`);
});
```

### Charging a Saved Payment Method

```typescript
// Option 1: Create and confirm in one step
const paymentIntent = await stripe.paymentIntents.create({
  amount: Math.round(totalAmount * 100),
  currency: 'usd',
  customer: stripeCustomerId,
  payment_method: savedPaymentMethodId, // Use the saved card
  off_session: true, // Charging while customer is offline
  confirm: true, // Immediately confirm the payment
  metadata: {
    bookingId: newBookingId,
    type: 'repeat_booking',
  },
});

// Option 2: Create and confirm separately
const paymentIntent = await stripe.paymentIntents.create({
  amount: Math.round(totalAmount * 100),
  currency: 'usd',
  customer: stripeCustomerId,
  payment_method: savedPaymentMethodId,
  off_session: true,
});

const confirmedIntent = await stripe.paymentIntents.confirm(paymentIntent.id);
```

### Error Handling for Saved Cards

When charging saved cards, some cards may require re-authentication:

```typescript
try {
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(totalAmount * 100),
    currency: 'usd',
    customer: stripeCustomerId,
    payment_method: savedPaymentMethodId,
    off_session: true,
    confirm: true,
  });
  
  // Payment succeeded
  console.log('Payment successful:', paymentIntent.id);
  
} catch (error: any) {
  if (error.code === 'authentication_required') {
    // Card requires authentication - redirect user to complete
    const paymentIntentId = error.raw.payment_intent.id;
    // Send payment intent client secret to frontend for user to complete
  } else {
    // Other error - handle or notify user
    console.error('Payment failed:', error.message);
  }
}
```

## Compliance Requirements

### Terms of Service

Your Terms of Service should include:

1. **Consent to save payment method**: Users agree to save their card for future use
2. **Usage disclosure**: How and when saved cards will be charged
3. **Timing of charges**: When charges may occur (e.g., at time of booking)
4. **Cancellation policy**: How to remove saved payment methods
5. **Security assurances**: How payment data is protected (handled by Stripe)

### Example Terms Language

> "By completing this booking, you authorize us to save your payment method for this reservation and potential post-checkout charges. Your card may be charged for additional services, fees, or adjustments related to your stay (such as room service, damages, or policy violations). You acknowledge that your payment information will be securely stored by Stripe, our payment processor. All payment data is encrypted and PCI-compliant."

### User Interface Requirements

✅ **Implemented**: Card storage notice with clear explanation
✅ **Implemented**: Policy acceptance required at payment step
✅ **Implemented**: Card automatically saved (no opt-out)
⚠️ **Recommended**: Add ability to view saved cards in account settings
⚠️ **Recommended**: Show saved cards during checkout for returning users
⚠️ **Recommended**: Add ability to update default payment method

## Security Considerations

### What Stripe Handles

- ✅ Card data storage (PCI compliance)
- ✅ Card authentication (3D Secure when required)
- ✅ Fraud detection
- ✅ Encryption in transit and at rest

### What You Handle

- ✅ Stripe Customer ID storage (already implemented)
- ✅ User authentication before accessing saved cards
- ⚠️ Display saved cards to authenticated users only
- ⚠️ Allow users to delete saved payment methods

## Testing

### Test Cards for Saved Payment Methods

Use these Stripe test cards:

| Card Number          | Scenario                                    |
|---------------------|---------------------------------------------|
| 4242 4242 4242 4242 | Succeeds and saves for future use           |
| 4000 0025 0000 3155 | Requires authentication                     |
| 4000 0000 0000 9995 | Declined (insufficient funds)               |

### Testing Workflow

1. **Make a booking with test card**: Complete payment and verify card is saved
2. **Check Stripe Dashboard**: Navigate to Customers → Select customer → View Payment methods
3. **Verify saved card**: Card should appear in the customer's payment methods
4. **Test future charge**: Use the saved payment method ID for a new booking

## Future Enhancements

### Recommended Features

1. **Saved Cards Management Page**
   - Display all saved payment methods
   - Show card brand, last 4 digits, expiration
   - Allow users to remove cards
   - Set a default payment method

2. **Express Checkout for Returning Users**
   - Pre-select saved payment method
   - One-click booking flow
   - Skip payment form if card on file

3. **Payment Method Selection**
   - Choose from multiple saved cards
   - Add new card option
   - Update existing card

### Example: Display Saved Cards

```typescript
// In PaymentStep.tsx or new SavedCardsSection component
const savedCards = await stripe.paymentMethods.list({
  customer: stripeCustomerId,
  type: 'card',
});

// Display cards in UI
{savedCards.data.map((pm) => (
  <div key={pm.id} className="flex items-center justify-between p-4 border rounded">
    <div className="flex items-center gap-3">
      <Icon icon={`tabler:brand-${pm.card?.brand}`} />
      <div>
        <p className="font-medium">
          {pm.card?.brand} •••• {pm.card?.last4}
        </p>
        <p className="text-sm text-muted-foreground">
          Expires {pm.card?.exp_month}/{pm.card?.exp_year}
        </p>
      </div>
    </div>
    <Button variant="outline" size="sm">
      Use this card
    </Button>
  </div>
))}
```

## Verification Checklist

After implementation, verify:

- ✅ Payment succeeds with `setup_future_usage` parameter
- ✅ Customer ID is properly stored in database
- ✅ Card appears in Stripe Dashboard under customer's payment methods
- ✅ Payment method can be retrieved via Stripe API
- ✅ UI clearly communicates card will be saved for post-checkout charges
- ✅ Policy acceptance required before payment submission
- ✅ Pay button disabled until policies accepted
- ⚠️ Terms of Service updated to reflect card storage policy (recommended)
- ⚠️ Account settings page for viewing saved cards (future enhancement)

## Resources

- [Stripe: Save cards without payment](https://stripe.com/docs/payments/save-during-payment)
- [Stripe: Charge saved payment methods](https://stripe.com/docs/payments/save-and-reuse)
- [Stripe: Payment Intents API](https://stripe.com/docs/api/payment_intents)
- [Stripe: Customer API](https://stripe.com/docs/api/customers)

## Support

If you encounter issues:

1. Check Stripe Dashboard logs for API errors
2. Verify `stripeCustomerId` is being saved to user records
3. Ensure `setup_future_usage` is set in PaymentIntent creation
4. Check that payment completes successfully before expecting saved card
5. Review Stripe webhook events for payment method attachment

---

**Last Updated**: January 2025
**Implementation Status**: Core functionality complete with policy acceptance and automatic card saving
**Card Saving**: Mandatory for all transactions (no opt-out) to handle post-checkout charges