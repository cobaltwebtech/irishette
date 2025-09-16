-- Migration: Add room status column
-- Date: 2025-09-11
-- Description: Add status column to room table for better lifecycle management

-- Add the status column with default value 'active'
ALTER TABLE room ADD COLUMN status TEXT DEFAULT 'active' NOT NULL;

-- Update existing rooms to set status based on isActive
-- If isActive is true (1), set status to 'active'
-- If isActive is false (0), set status to 'inactive'
UPDATE room SET status = CASE 
    WHEN is_active = 1 THEN 'active' 
    WHEN is_active = 0 THEN 'inactive' 
    ELSE 'active' 
END;

-- Add constraint to ensure status is one of the valid values
-- Note: SQLite doesn't support CHECK constraints in ALTER TABLE, 
-- so we'll enforce this at the application level
