-- 테스트 병원 데이터 추가
INSERT INTO hospitals (name, base_due_day) VALUES 
  ('뽀빠이 통증의학과', 14),
  ('어울림 산부인과', 2),
  ('척튼튼통증의학과', 17);

-- 확인
SELECT * FROM hospitals;
