-- 예산 항목에 AI 제공자(Claude/Gemini) 필드 추가
-- ai_provider: 'claude' / 'gemini' / NULL (AI 관련 지출이 아닌 경우)
-- 수시결제로 등록된 Claude, Gemini 크레딧 사용량을 일자별로 추적하기 위해 사용된다.
ALTER TABLE budgets ADD COLUMN ai_provider TEXT;
CREATE INDEX IF NOT EXISTS idx_budgets_ai_provider ON budgets(ai_provider);
