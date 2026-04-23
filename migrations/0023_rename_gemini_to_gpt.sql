-- AI 제공자 이름 변경: 'gemini' → 'gpt'
-- 기존 데이터(충전 내역 · 사용 내역)는 GPT 로 마이그레이션한다.
UPDATE budgets  SET ai_provider = 'gpt' WHERE ai_provider = 'gemini';
UPDATE ai_usage SET provider    = 'gpt' WHERE provider    = 'gemini';
