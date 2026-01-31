-- 월별 작업량 테이블에 작업 순서 및 상위노출 날짜 컬럼 추가
ALTER TABLE monthly_tasks ADD COLUMN task_order TEXT DEFAULT 'brand,trend';
ALTER TABLE monthly_tasks ADD COLUMN brand_order INTEGER DEFAULT 1;
ALTER TABLE monthly_tasks ADD COLUMN trend_order INTEGER DEFAULT 2;
ALTER TABLE monthly_tasks ADD COLUMN sanwi_dates TEXT; -- JSON array of dates
