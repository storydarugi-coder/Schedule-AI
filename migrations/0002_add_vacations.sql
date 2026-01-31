-- 연차/휴가 테이블
CREATE TABLE IF NOT EXISTS vacations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vacation_date DATE NOT NULL UNIQUE,
  vacation_type TEXT NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_vacations_date ON vacations(vacation_date);
