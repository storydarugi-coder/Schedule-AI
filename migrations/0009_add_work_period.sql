-- Add work period columns to monthly_tasks table
ALTER TABLE monthly_tasks ADD COLUMN work_start_date TEXT;
ALTER TABLE monthly_tasks ADD COLUMN work_end_date TEXT;

-- Create index for efficient period queries
CREATE INDEX idx_monthly_tasks_period ON monthly_tasks(work_start_date, work_end_date);
