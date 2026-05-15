-- 일일 점검 체크리스트 확장
-- winai.kr 을 매일 운영하면서 실제로 필요한 점검 항목을 추가.
-- 이미 존재하는 이름이면 건너뛰도록 INSERT...SELECT WHERE NOT EXISTS 패턴 사용.
INSERT INTO checklist_items (name, description, check_type, endpoint, sort_order)
SELECT '메인 페이지 응답', '루트 페이지 (/) 가 정상적으로 HTML 을 반환하는지 확인', 'auto', '/', 5
WHERE NOT EXISTS (SELECT 1 FROM checklist_items WHERE name = '메인 페이지 응답');

INSERT INTO checklist_items (name, description, check_type, endpoint, sort_order)
SELECT '정적 자원 (styles.css)', '정적 파일 서빙이 정상 동작하는지 확인', 'auto', '/static/styles.css', 6
WHERE NOT EXISTS (SELECT 1 FROM checklist_items WHERE name = '정적 자원 (styles.css)');

INSERT INTO checklist_items (name, description, check_type, endpoint, sort_order)
SELECT '결제 승인 대기 항목 확인', '예산 탭의 "결제 승인 전" 카드를 열어 누락된 결제 요청이 있는지 확인하고 필요시 대표님께 보고', 'manual', '', 200
WHERE NOT EXISTS (SELECT 1 FROM checklist_items WHERE name = '결제 승인 대기 항목 확인');

INSERT INTO checklist_items (name, description, check_type, endpoint, sort_order)
SELECT 'AI 잔액 임계치 점검', 'Claude / GPT 누적 잔액이 다음 결제일까지 버틸 수 있는 수준인지 확인. 부족하면 충전 요청', 'manual', '', 210
WHERE NOT EXISTS (SELECT 1 FROM checklist_items WHERE name = 'AI 잔액 임계치 점검');

INSERT INTO checklist_items (name, description, check_type, endpoint, sort_order)
SELECT 'AI 사용량 자동 동기화', 'Anthropic / OpenAI Admin API 로부터 어제 사용량이 정상 가져와졌는지 확인 (수동 sync 필요 여부 판단)', 'manual', '', 220
WHERE NOT EXISTS (SELECT 1 FROM checklist_items WHERE name = 'AI 사용량 자동 동기화');

INSERT INTO checklist_items (name, description, check_type, endpoint, sort_order)
SELECT '오늘 마감 일정 점검', '오늘 마감인 병원 일정 / 작업이 누락 없이 처리 가능한지 확인하고 우선순위 정리', 'manual', '', 230
WHERE NOT EXISTS (SELECT 1 FROM checklist_items WHERE name = '오늘 마감 일정 점검');

INSERT INTO checklist_items (name, description, check_type, endpoint, sort_order)
SELECT '마감 임박 (3일 이내) 일정 확인', '3일 이내 마감 일정/작업을 미리 훑어보고 진행 상황 체크', 'manual', '', 240
WHERE NOT EXISTS (SELECT 1 FROM checklist_items WHERE name = '마감 임박 (3일 이내) 일정 확인');

INSERT INTO checklist_items (name, description, check_type, endpoint, sort_order)
SELECT '어제 작업 마감 처리', '어제까지 완료했어야 할 작업이 모두 완료 체크 / 기록 작성됐는지 확인', 'manual', '', 250
WHERE NOT EXISTS (SELECT 1 FROM checklist_items WHERE name = '어제 작업 마감 처리');

INSERT INTO checklist_items (name, description, check_type, endpoint, sort_order)
SELECT '진척률 낮은 작업 점검', '50% 이하 진척률 + 마감 임박 작업이 있는지 확인하고 일정 재배분 고려', 'manual', '', 260
WHERE NOT EXISTS (SELECT 1 FROM checklist_items WHERE name = '진척률 낮은 작업 점검');

INSERT INTO checklist_items (name, description, check_type, endpoint, sort_order)
SELECT '이번주 휴가/연차 확인', '이번주 연차/휴가 일정 확인하고 휴가자 업무 분배 점검', 'manual', '', 270
WHERE NOT EXISTS (SELECT 1 FROM checklist_items WHERE name = '이번주 휴가/연차 확인');

INSERT INTO checklist_items (name, description, check_type, endpoint, sort_order)
SELECT '병원별 마감 임박 검토', '병원 관리 탭에서 이번달 마감일이 가까운 병원의 상위노출/콘텐츠 진행 상황 확인', 'manual', '', 280
WHERE NOT EXISTS (SELECT 1 FROM checklist_items WHERE name = '병원별 마감 임박 검토');

INSERT INTO checklist_items (name, description, check_type, endpoint, sort_order)
SELECT '정기결제 예상 청구 점검', '이번달 정기결제 항목 합계를 확인하고 예상 외 청구 여부 점검', 'manual', '', 290
WHERE NOT EXISTS (SELECT 1 FROM checklist_items WHERE name = '정기결제 예상 청구 점검');

INSERT INTO checklist_items (name, description, check_type, endpoint, sort_order)
SELECT '모바일 화면 UI 점검', '핸드폰으로 사이트 접속해서 모바일 레이아웃 깨짐 / 터치 동작 확인', 'manual', '', 300
WHERE NOT EXISTS (SELECT 1 FROM checklist_items WHERE name = '모바일 화면 UI 점검');

INSERT INTO checklist_items (name, description, check_type, endpoint, sort_order)
SELECT 'Cloudflare 배포 상태 점검', 'Cloudflare Pages 대시보드에서 최신 배포 성공 여부 / 에러율 / 응답시간 확인', 'manual', '', 310
WHERE NOT EXISTS (SELECT 1 FROM checklist_items WHERE name = 'Cloudflare 배포 상태 점검');

INSERT INTO checklist_items (name, description, check_type, endpoint, sort_order)
SELECT '브라우저 콘솔 에러 확인', '개발자 도구 Console / Network 탭을 한 번 열어서 에러나 4xx/5xx 응답이 있는지 확인', 'manual', '', 320
WHERE NOT EXISTS (SELECT 1 FROM checklist_items WHERE name = '브라우저 콘솔 에러 확인');
