-- 작업 완료 여부 컬럼 추가
ALTER TABLE schedules ADD COLUMN is_completed INTEGER DEFAULT 0;
