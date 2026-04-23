-- 예산 항목에 결제 완료 여부 추가
-- is_paid = 0 이면 "결제 필요", 1 이면 "결제 완료".
-- 기본값 0 → 새 항목은 모두 결제 필요 상태로 생성된다.
ALTER TABLE budgets ADD COLUMN is_paid INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_budgets_is_paid ON budgets(is_paid);
