-- Add memo column to schedules table for notes
ALTER TABLE schedules ADD COLUMN memo TEXT DEFAULT '';
