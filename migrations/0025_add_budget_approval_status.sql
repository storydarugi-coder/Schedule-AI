-- 예산 항목에 승인 상태 추가 (대표님 승인 워크플로우)
-- approval_status: 'pending' (승인 대기) / 'approved' (승인 완료)
-- DEFAULT 'approved' 로 두어, ALTER TABLE 적용 시점에 존재하던 기존 행은 모두 자동 승인 처리된다.
-- 신규 항목은 백엔드(POST /api/budgets)에서 기본 'pending' 으로 기록한다
-- (단, 등록 시 결제 완료로 체크된 항목은 자동 'approved').
-- recurring/carry_over 항목은 원본 row 하나가 이월되어 표시되므로,
-- 한번 승인되면 다음 달에도 승인된 상태가 유지된다 — 매달 재승인 불필요.
ALTER TABLE budgets ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved';
CREATE INDEX IF NOT EXISTS idx_budgets_approval_status ON budgets(approval_status);
