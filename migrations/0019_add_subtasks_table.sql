-- 하위 작업(subtasks) 테이블
-- 상위 작업(tasks) 하나에 여러 개의 하위 작업이 소속되며,
-- 하위 작업의 완료 비율로 상위 작업의 진척률(progress)이 자동 계산된다.
CREATE TABLE IF NOT EXISTS subtasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  is_completed INTEGER NOT NULL DEFAULT 0,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id);
