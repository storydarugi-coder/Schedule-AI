-- 월별 작업량에 커스텀 작업 유형 JSON 컬럼 추가
ALTER TABLE monthly_tasks ADD COLUMN custom_tasks TEXT DEFAULT '[]';
