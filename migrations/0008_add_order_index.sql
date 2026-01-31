-- Add order_index column to schedules table for intra-day ordering
ALTER TABLE schedules ADD COLUMN order_index INTEGER DEFAULT 0;

-- Create index for efficient ordering queries
CREATE INDEX idx_schedules_order ON schedules(hospital_id, year, month, task_date, order_index);
