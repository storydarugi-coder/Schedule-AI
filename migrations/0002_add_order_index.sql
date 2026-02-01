-- Add order_index column to schedules table for reordering
ALTER TABLE schedules ADD COLUMN order_index INTEGER DEFAULT 0;
