// Platforms an imported iCal feed can come from. Shared by the Drizzle schema
// (src/db/room-schema.ts) and the Zod schemas used by admin forms
// (src/lib/room-validation.ts), so client code never imports the schema file.
export const icalFeedSources = [
	'airbnb',
	'expedia',
	'vrbo',
	'booking',
	'other',
] as const;
