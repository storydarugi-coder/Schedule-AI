-- 병원 테이블
CREATE TABLE IF NOT EXISTS hospitals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  base_due_day INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 월별 작업량 테이블
CREATE TABLE IF NOT EXISTS monthly_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hospital_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  sanwi_nosul INTEGER DEFAULT 0,
  brand INTEGER DEFAULT 0,
  trend INTEGER DEFAULT 0,
  eonron_bodo INTEGER DEFAULT 1,
  jisikin INTEGER DEFAULT 1,
  deadline_pull_days INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE,
  UNIQUE(hospital_id, year, month)
);

-- 스케줄 테이블
CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hospital_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  task_date DATE NOT NULL,
  task_type TEXT NOT NULL,
  task_name TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  duration_hours REAL NOT NULL,
  is_report INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_monthly_tasks_hospital ON monthly_tasks(hospital_id, year, month);
CREATE INDEX IF NOT EXISTS idx_schedules_date ON schedules(task_date);
CREATE INDEX IF NOT EXISTS idx_schedules_hospital ON schedules(hospital_id, year, month);
