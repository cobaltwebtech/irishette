# Admin Email Notification System

This document explains the admin email notification system that sends alerts to administrators when new bookings are confirmed through Stripe payments.

## Features

- **Automatic Admin Notifications**: When a Stripe checkout session completes successfully, all admin users receive an email notification
- **Compact Email Design**: Clean, professional email template with essential booking information
- **Admin Dashboard Integration**: Direct link to view booking details in the admin dashboard
- **Database-Driven Admin List**: Automatically queries users with `role = 'admin'` from the database

## How It Works

1. **Booking Payment Completion**: Customer completes payment through Stripe
2. **Webhook Processing**: Stripe webhook confirms the payment
3. **Customer Email**: Booking confirmation email is sent to the customer
4. **Admin Query**: System queries database for all users with `role = 'admin'`
5. **Admin Notification**: Compact notification email is sent to all admins

## Admin Email Template

The admin notification email includes:

- **Booking Details**: Confirmation ID, guest info, room, dates
- **Financial Summary**: Total amount paid
- **Quick Actions**: Checklist of follow-up tasks
- **Dashboard Link**: Direct access to admin panel
- **Professional Styling**: Blue-themed, compact design

## Files Created/Modified

### New Files:
- `src/components/email/AdminBookingNotificationEmail.tsx` - React email template
- `src/lib/admin-service.ts` - Admin user query functions
- `src/routes/api/test-admin-email/$.ts` - Test endpoint

### Modified Files:
- `src/lib/email-service.ts` - Added admin notification functions
- `src/routes/api/stripe/$.ts` - Integrated admin notifications in webhook

## Testing

### Prerequisites
1. **Admin Users**: Create at least one user with `role = 'admin'` in the database
2. **Email Configuration**: Ensure `RESEND_API_KEY` is properly configured
3. **Better Auth Setup**: Verify Better Auth is working correctly

### Test Endpoint
Use the test endpoint to verify admin notifications work:

```bash
curl -X POST http://localhost:3000/api/test-admin-email
```

### Expected Response
```json
{
  "success": true,
  "message": "Admin notification test completed successfully",
  "adminCount": 1,
  "adminEmails": ["admin@example.com"],
  "testData": { ... }
}
```

### Creating Admin Users

To create admin users, you can:

1. **Via Better Auth Admin API**: Use the admin client to create users with admin role
2. **Direct Database**: Update user role to 'admin' in the database
3. **Registration**: Create users normally, then update their role

Example of updating a user to admin:
```sql
UPDATE user SET role = 'admin' WHERE email = 'admin@example.com';
```

## Production Considerations

1. **Error Handling**: Admin email failures don't affect booking confirmation
2. **Performance**: Admin query is optimized and runs after customer email
3. **Scalability**: Supports multiple admin users automatically
4. **Monitoring**: All email operations are logged for debugging

## Email Deliverability

- **From Address**: `admin@contact.cobaltweb.tech`
- **Subject Format**: `New Booking Alert: {confirmationId} - {guestName}`
- **Multiple Recipients**: All admin emails are included in the 'to' field
- **Professional Template**: Uses React Email components for consistency

## Integration Points

The admin notification system integrates with:

- **Stripe Webhooks**: Triggered on `checkout.session.completed`
- **Better Auth**: Uses admin role system for user identification
- **Resend Email Service**: Leverages existing email infrastructure
- **Booking System**: Accesses booking data through PaymentService

## Customization

To customize the admin notification:

1. **Email Template**: Modify `AdminBookingNotificationEmail.tsx`
2. **Admin Query**: Update `getAdminUsers()` in `admin-service.ts`
3. **Email Content**: Adjust data mapping in `sendAdminBookingNotification()`
4. **Webhook Timing**: Modify integration point in Stripe webhook handler