-- 매일 아침 점검 체크리스트
-- 매니저가 출근하면 가장 먼저 사이트의 주요 기능이 정상 동작하는지 한 화면에서 확인하기 위한 표.
-- check_type:
--   'manual' — 사람이 직접 눈으로 확인하고 체크 버튼을 누르는 항목
--   'auto'   — endpoint(GET)를 호출해서 응답이 OK 면 자동 체크되는 항목
--              endpoint 안의 __YEAR__ / __MONTH__ 토큰은 클라이언트가 현재 연/월로 치환한다.
CREATE TABLE IF NOT EXISTS checklist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  check_type TEXT NOT NULL DEFAULT 'manual',
  endpoint TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 하루에 항목당 row 가 여러 개 쌓일 수 있다 (재실행 가능). 최신 row 가 오늘의 상태.
CREATE TABLE IF NOT EXISTS checklist_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  check_date TEXT NOT NULL,
  checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'ok',
  note TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (item_id) REFERENCES checklist_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_checklist_logs_item ON checklist_logs(item_id);
CREATE INDEX IF NOT EXISTS idx_checklist_logs_date ON checklist_logs(check_date);

-- 기본 점검 항목 시드
INSERT INTO checklist_items (name, description, check_type, endpoint, sort_order) VALUES
  ('병원 목록 조회',        '병원 목록 API 가 정상 응답하는지 확인',                   'auto',   '/api/hospitals',                       10),
  ('이번달 일정 조회',      '현재 연/월 스케줄 API 정상 응답 확인',                     'auto',   '/api/schedules/__YEAR__/__MONTH__',    20),
  ('이번달 업무 조회',      '현재 연/월 업무(태스크) API 정상 응답 확인',               'auto',   '/api/tasks/__YEAR__/__MONTH__',        30),
  ('예산 데이터 조회',      '이번달 예산 API 정상 응답 확인',                            'auto',   '/api/budgets/__YEAR__/__MONTH__',      40),
  ('AI 사용량 조회',        '이번달 AI 사용량 API 정상 응답 확인',                       'auto',   '/api/ai-usage/__YEAR__/__MONTH__',     50),
  ('AI 잔액 API',           'Claude / GPT 누적 잔액 API 정상 동작 확인',                'auto',   '/api/ai-balance',                      60),
  ('연차/휴가 조회',        '이번달 연차/휴가 API 정상 응답 확인',                       'auto',   '/api/vacations/__YEAR__/__MONTH__',    70),
  ('캘린더 렌더링',         '캘린더 탭이 깨짐 없이 그려지는지 육안 확인',               'manual', '',                                     80),
  ('일정 추가/삭제 동작',   '병원 일정을 임의로 추가/삭제했을 때 정상 동작하는지 확인', 'manual', '',                                     90),
  ('업무 진척률 업데이트',  '업무의 진척률 변경 및 기록 작성/삭제가 정상 동작하는지 확인','manual', '',                                    100),
  ('예산 결제 승인 토글',   '결제 승인 전 / 승인 완료 토글이 정상 동작하는지 확인',     'manual', '',                                    110),
  ('전체 UI 점검',          '레이아웃 깨짐, 오타, 색상 이상 여부 육안 확인',           'manual', '',                                    120);
