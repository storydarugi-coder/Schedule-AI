-- 예산 결제 유형 구분
-- payment_type: 'recurring'(정기결제/자동결제) / 'ondemand'(수시결제/크레딧결제)
ALTER TABLE budgets ADD COLUMN payment_type TEXT NOT NULL DEFAULT 'ondemand';

CREATE INDEX IF NOT EXISTS idx_budgets_payment_type ON budgets(payment_type);
