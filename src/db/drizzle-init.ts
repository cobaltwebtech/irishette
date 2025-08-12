import { drizzle } from 'drizzle-orm/d1'
import * as schema from '@/db/schema-export'

export const createDrizzle = (db: D1Database) =>
  drizzle(db, { schema })

export type Database = ReturnType<typeof createDrizzle>
