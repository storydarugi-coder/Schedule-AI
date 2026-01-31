-- Initialize order_index for existing schedules
-- Group by hospital and date, then assign sequential order_index

-- First, update all NULL order_index to 0
UPDATE schedules 
SET order_index = 0 
WHERE order_index IS NULL;

-- Create a temporary view to calculate proper order_index
-- This ensures each schedule within the same date gets a unique order_index
