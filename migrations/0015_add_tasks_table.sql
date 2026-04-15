-- 캘린더와 분리된 독립 작업(progress) 테이블
-- progress: 0~4 (0=0%, 1=25%, 2=50%, 3=75%, 4=100%) — 5단계 진척률
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  hospital_id INTEGER,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tasks_year_month ON tasks(year, month);
CREATE INDEX IF NOT EXISTS idx_tasks_hospital ON tasks(hospital_id);
