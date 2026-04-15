-- 예산 항목에 결제 유형 추가: 'recurring' (정기결제, 자동) / 'onetime' (수시결제, 크레딧)
ALTER TABLE budgets ADD COLUMN payment_type TEXT NOT NULL DEFAULT 'onetime';
