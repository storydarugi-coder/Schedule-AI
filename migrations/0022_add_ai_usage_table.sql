-- AI 사용량 기록 테이블
-- 예산 관리(budgets)와 별개로, Claude/Gemini 를 '실제로 얼마나 썼는지' 일자별로 집계한다.
-- 예: Claude 는 충전 방식이라 $22 충전했다고 $22 를 쓴 게 아님 → 충전은 budgets 에 남기고,
--     실제 소비량은 여기에 기록.
CREATE TABLE IF NOT EXISTS ai_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usage_date TEXT NOT NULL,      -- YYYY-MM-DD
  provider TEXT NOT NULL,        -- 'claude' | 'gemini'
  amount INTEGER NOT NULL DEFAULT 0, -- USD 정수
  note TEXT NOT NULL DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_date ON ai_usage(usage_date);
CREATE INDEX IF NOT EXISTS idx_ai_usage_provider ON ai_usage(provider);
