-- 예산 항목 자동 이월 기능
-- carry_over = 1 이면 이 항목은 다음 달부터도 자동으로 표시된다.
-- stop_year/stop_month 가 세팅되면 그 달까지만 노출되고 이후로는 숨겨진다.
ALTER TABLE budgets ADD COLUMN carry_over INTEGER NOT NULL DEFAULT 1;
ALTER TABLE budgets ADD COLUMN stop_year INTEGER;
ALTER TABLE budgets ADD COLUMN stop_month INTEGER;
