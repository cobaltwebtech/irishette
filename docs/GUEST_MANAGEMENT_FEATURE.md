# Guest Management Feature Implementation

## Overview
This document describes the implementation of a new Guest Management feature for the admin panel, allowing administrators to view and manage all registered guests (users with role 'user') along with their booking information.

## Files Created/Modified

### 1. New tRPC Router: `/src/integrations/trpc/users.ts`
**Purpose**: Handles backend API endpoints for guest/user management

**Endpoints**:
- `adminListGuests`: Returns a paginated list of all users with role 'user', including:
  - User information (id, name, email, createdAt, stripeCustomerId)
  - Total booking count per guest
  - Latest phone number from their most recent booking
  - Pagination support (limit/offset)
  
- `adminGetGuestDetails`: Returns detailed information for a specific guest, including:
  - Complete user information
  - All bookings associated with the user
  - Booking statistics

**Key Features**:
- Uses SQL aggregation to count bookings per user
- Uses a subquery to get the most recent phone number from bookings
- Implements proper error handling with TRPCError
- Filters users by role 'user' (customers/guests only, not admin users)

### 2. Updated tRPC Router: `/src/integrations/trpc/router.ts`
**Changes**: Added the `users` router to the main tRPC router export

```typescript
export const trpcRouter = createTRPCRouter({
	rooms: roomsRouter,
	bookings: bookingsRouter,
	availability: availabilityRouter,
	users: usersRouter, // NEW
});
```

### 3. New Admin Route: `/src/routes/admin/guest/index.tsx`
**Purpose**: Admin page for viewing and managing guests

**Features**:
- Data table with sortable columns
- Global search functionality
- Clickable rows that navigate to guest detail page
- Displays:
  - Guest Name (with member since date)
  - Email (clickable mailto link)
  - Phone (clickable tel link, from latest booking)
  - Booking Count (with "Repeat Guest" badge for 2+ bookings)
- Pagination controls
- Responsive design using AdminLayout
- Proper loading, error, and access control states

**Technical Details**:
- Uses TanStack Table for advanced table functionality
- Uses TanStack Query with tRPC for data fetching
- Implements sorting, filtering, and pagination
- Entire table row is clickable and navigates to `/admin/guest/$userId`
- Uses hover effect to indicate clickable rows

### 4. New Admin Route: `/src/routes/admin/guest/$userId.tsx`
**Purpose**: Detailed view of a specific guest with all their information and booking history

**Features**:
- Guest information card showing:
  - Name, email, phone
  - Member since date
  - Stripe Customer ID (if available)
- Statistics dashboard with 6 key metrics:
  - Total Bookings
  - Total Spent
  - Current & Upcoming Bookings
  - Completed Bookings
  - Cancelled Bookings
  - Average Booking Value
- Complete booking history table with:
  - Confirmation ID (links to booking detail page)
  - Check-in/Check-out dates
  - Number of nights and guests
  - Status and payment status badges
  - Total amount
  - Sortable columns
  - Pagination for large booking lists
- Back navigation to guest list

**Technical Details**:
- Uses the `adminGetGuestDetails` tRPC endpoint
- Calculates statistics client-side from booking data:
  - **Completed Bookings**: Counts bookings with status='confirmed' and checkout date in the past
  - **Current & Upcoming Bookings**: Counts bookings with status='confirmed' and checkout date today or in the future
  - **Total Spent**: Sums all bookings with paymentStatus='paid'
  - **Average Booking**: Total spent divided by total bookings
- Implements responsive grid layout
- All booking IDs link to the admin booking detail page
- Shows "No bookings" message if guest hasn't made any reservations

### 5. Updated Admin Sidebar: `/src/components/admin/app-sidebar.tsx`
**Changes**: Added new "Guests" navigation item

```typescript
{
	title: 'Guests',
	url: '/admin/guest',
	icon: Users,
	items: [
		{
			title: 'All Guests',
			url: '/admin/guest',
		},
	],
}
```

## Data Flow

### Guest List Page (`/admin/guest`)

1. **User visits `/admin/guest`**
2. **Route component loads** and checks authentication/authorization
3. **tRPC query fires** to `users.adminListGuests` endpoint
4. **Backend queries database** using Drizzle ORM:
   - Selects users with role = 'user'
   - Left joins with bookings table
   - Counts bookings per user
   - Gets latest phone from bookings subquery
   - Orders by name
5. **Data returns to frontend** as typed response
6. **TanStack Table renders** the data with sorting, filtering, pagination
7. **User can click any row** to navigate to guest detail page

### Guest Detail Page (`/admin/guest/$userId`)

1. **User clicks a guest row or navigates to `/admin/guest/$userId`**
2. **Route component loads** with userId from URL params
3. **tRPC query fires** to `users.adminGetGuestDetails` endpoint with userId
4. **Backend queries database**:
   - Fetches user record
   - Fetches all bookings for that user
5. **Data returns to frontend**
6. **Component calculates statistics** (total spent, nights, averages)
7. **Renders user info card + statistics cards + bookings table**
8. **User can click booking confirmation IDs** to view booking details

## Database Schema Utilized

### Tables:
- `user` table (from auth-schema.ts):
  - id, name, email, role, createdAt, stripeCustomerId

- `bookings` table (from booking-schema.ts):
  - userId (foreign key to user.id)
  - guestPhone (stores phone from booking)
  - All other booking details

### Relationships:
- `user.id` ← `bookings.userId` (one-to-many)

## Key Features

1. **Phone Number Handling**: 
   - Phone numbers are stored in the bookings table, not user table
   - The system shows the most recent phone number from any booking
   - Phone numbers are clickable tel: links

2. **Booking Count**:
   - Shows total number of bookings per guest
   - Highlights "Repeat Guests" (2+ bookings) with special badge

3. **Search & Filter**:
   - Global search across all columns on guest list page
   - Sortable by Name, Email, Booking Count

4. **Clickable Rows**:
   - Entire table row is clickable and navigates to guest detail page
   - Hover effect indicates interactivity

5. **Guest Detail Page**:
   - Comprehensive statistics dashboard
   - Complete booking history with sorting and pagination
   - Direct links to individual booking detail pages
   - Back navigation to guest list

6. **Statistics Tracking**:
   - Total bookings, completed, and cancelled counts
   - Total revenue from guest (lifetime value)
   - Current and upcoming bookings count
   - Average booking value calculation

## UI Components Used

- `AdminLayout`: Consistent admin page wrapper
- `Card`, `CardHeader`, `CardContent`: Content containers
- `Table`, `TableHeader`, `TableBody`, etc.: Table components
- `Button`: Action buttons and sort toggles
- `Badge`: Status indicators
- `Input`: Search field
- `ScrollArea`: Horizontal scrolling for wide tables

## Type Safety

All data types are properly typed using TypeScript:
- tRPC provides end-to-end type safety
- Custom `GuestData` type defined in the route component
- TanStack Table is fully typed with the GuestData type

## Security

- Admin-only route with role check
- Session validation using Better Auth
- Proper error handling for unauthorized access
- tRPC procedures can be enhanced with middleware for auth checking

## Future Enhancements

Potential improvements:
1. ✅ ~~Add guest detail page (`/admin/guest/$guestId`)~~ - COMPLETED
2. Add export functionality (CSV, Excel) for guest list
3. Add guest notes/tags functionality for internal tracking
4. Add email campaign functionality to contact guests
5. Add more detailed guest statistics (booking frequency, seasonal patterns)
6. Add ability to merge duplicate guest accounts
7. Add advanced search by phone number or date ranges
8. Add filters (by booking count, registration date, lifetime value)
9. Add guest segmentation (VIP, frequent, at-risk, etc.)
10. Add communication history tracking

## Testing the Feature

To test the implementation:

### Guest List Page
1. Start the dev server: `pnpm dev`
2. Log in as an admin user
3. Navigate to the admin panel
4. Click "Guests" in the sidebar
5. Verify the guest list loads correctly with all columns
6. Test sorting by clicking column headers (Name, Email, Bookings)
7. Test search functionality - search for a guest by name or email
8. Test pagination if you have enough guests
9. Click on any guest row to navigate to their detail page

### Guest Detail Page
1. From the guest list, click on any guest row
2. Verify navigation to `/admin/guest/{userId}`
3. Check that guest information displays correctly (name, email, phone, member since)
4. Verify all statistics cards show correct numbers:
   - Total Bookings
   - Total Spent
   - Current & Upcoming Bookings (checkout date today or future)
   - Completed Bookings (checkout date in the past)
   - Cancelled Bookings
   - Average Booking Value
5. Scroll down to booking history table
6. Test sorting by clicking column headers (Check-in, Amount)
7. Click on a Confirmation ID to navigate to booking detail page
8. Test pagination if guest has many bookings
9. Click "Back to Guests" button to return to list

## Notes

- The route tree (`src/routeTree.gen.ts`) will be automatically regenerated when the dev server starts
- The guests query is cached for 5 minutes using TanStack Query's staleTime
- The page uses the same pagination pattern as the bookings page for consistency
- All UI components match the existing admin panel design system
