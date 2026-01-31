# Schedule-AI 🧠

<div align="center">
  <img src="https://img.shields.io/badge/AI-Powered-787FFF?style=for-the-badge" alt="AI Powered">
  <img src="https://img.shields.io/badge/Cloudflare-Workers-FFF787?style=for-the-badge" alt="Cloudflare">
  <img src="https://img.shields.io/badge/Hono-Framework-E36002?style=for-the-badge" alt="Hono">
</div>

## 프로젝트 개요
- **이름**: Schedule-AI
- **목표**: 근무 시간, 마감 기한, 연차/휴가, 작업 소요시간 제약을 모두 만족하면서 절대 일정이 꼬이지 않는 AI 기반 월간 업무 스케줄 자동 생성
- **핵심 기능**:
  - 🏥 병원별 마감일 자동 계산 및 당김 조정
  - 📊 보고서 작업 우선 배치 (앵커 작업)
  - 🎯 콘텐츠 작업 최적 스케줄링
  - 🏖️ 연차/휴가 관리 및 자동 반영
  - 📅 시각적 캘린더 뷰
  - ⚠️ 시간 부족 경고 시스템

## 🎨 디자인 컬러
- **Primary**: `#787FFF` (보라색 그라데이션)
- **Secondary**: `#FFF787` (노란색 그라데이션)
- **Modern UI/UX**: 그라데이션 + 둥근 모서리 + 그림자 효과

## 현재 완료된 기능

### ✅ 기본 근무 규칙 구현
- 하루 8시간 근무 (월요일은 7시간 - 회의 1시간)
- 주말 및 공휴일 자동 제외 (2026년 공휴일 데이터 포함)
- 월요일 고정 회의 자동 처리
- **연차/휴가 자동 반영** (근무 불가일로 처리)

### ✅ 작업 종류 및 소요 시간 설정
- 상위노출 작업: 3.5시간 (**병원별 게시 날짜 지정 가능**)
- 브랜드 작업: 3.5시간 (**게시 순서 선택 가능**)
- 트렌드 작업: 1.5시간 (**게시 순서 선택 가능**)
- 지식인 원고: 0.5시간 (0개 설정 가능)
- 언론보도 원고: 0.5시간 (0개 설정 가능)
- 보고서 작성: 2시간 (10:00~12:00 고정)
- **블로그 게시 규칙**: 브랜드 1회, 트렌드 1회 (순서는 사용자가 선택)

### ✅ 마감일 계산 로직
- 병원별 기본 마감일(base_due_day) 설정
- 마감 당김 일수 선택 (0일/1일/2일)
- 콘텐츠 완료 기한 = 마감일 - 1일
- 보고서 작성일 = 마감일 당일
- **연차/휴가를 고려한 마감일 계산**

### ✅ 스케줄링 알고리즘
- 보고서 작업 우선 배치 (앵커 작업)
- 완료 기한 기준 콘텐츠 작업 배치
- 하루 근무 가능 시간 초과 시 다음 근무일로 자동 이동
- **연차/휴가 제외한 근무일 계산**
- 시간 부족 감지 및 경고

### ✅ 사용자 인터페이스
- **병원 관리**: 병원 추가/수정/삭제
  - 아름다운 카드 레이아웃
  - **날짜 오름차순 정렬** (마감일 기준)
  - **한 자리 수 일자 0 패딩** (02일, 05일 등 깔끔한 정렬)
- **연차/휴가 관리**: 
  - 날짜 선택 및 휴가 종류 선택
  - 연차, 여름휴가, 겨울휴가, 병가, 기타
  - 색상별 구분 표시
- **작업량 입력**: 월별 작업 개수 선택
  - 상위노출, 브랜드, 트렌드 개수 선택 가능
  - 언론보도, 지식인 0개 이상 설정 가능
  - **마감 당김 일수 선택 (0일~5일)**
  - **기존 데이터 자동 불러오기** (병원/년월 선택 시)
  - **상위노출 날짜 나중에 수정 가능**
- **캘린더 뷰**: FullCalendar.js 기반 시각적 스케줄 표시
  - 보고서 작업: 빨간색
  - 콘텐츠 작업: 보라색 (#787FFF)
  - 연차/휴가: 각 종류별 색상
  - **토요일, 일요일 동일한 색상** (주말 구분 명확)

### ✅ 경고 시스템
- 콘텐츠 완료 기한까지 총 근무 시간 부족 감지
- 마감일이 주말/공휴일/연차인 경우 경고
- 병원명, 부족 시간, 작업 종류 상세 표시

## 🌐 URL

### GitHub Repository
- **저장소**: https://github.com/storydarugi-coder/Schedule-AI

### 프로덕션 (Cloudflare Pages)
- **메인 URL**: https://schedule-ai.pages.dev
- **최신 배포**: https://4a0f6fd8.schedule-ai.pages.dev

### 로컬 개발
- **개발 서버**: http://localhost:3000

### 공용 샌드박스 URL
- **접속 URL**: https://3000-i8r46wzl00mqd9bcczq81-d0b9e1e2.sandbox.novita.ai

## 📊 데이터 아키텍처

### 데이터 모델
```sql
-- 병원 정보
hospitals (
  id, name, base_due_day, created_at
)

-- 월별 작업량
monthly_tasks (
  id, hospital_id, year, month,
  sanwi_nosul, brand, trend, eonron_bodo, jisikin,
  deadline_pull_days, task_order,
  brand_order, trend_order, sanwi_dates,
  created_at
)

-- 스케줄
schedules (
  id, hospital_id, year, month, task_date,
  task_type, task_name, start_time, end_time,
  duration_hours, is_report, created_at
)

-- 연차/휴가 (NEW!)
vacations (
  id, vacation_date, vacation_type, description, created_at
)
```

### 저장 서비스
- **데이터베이스**: Cloudflare D1 (SQLite)
  - **프로덕션 DB**: webapp-production (ID: `8a9be10c-2201-4298-84bc-02511f19c8a3`)
- **로컬 개발**: `.wrangler/state/v3/d1` (자동 생성)

### 데이터 흐름
1. 병원 정보 입력 → hospitals 테이블 저장
2. 연차/휴가 등록 → vacations 테이블 저장
3. 월별 작업량 설정 → monthly_tasks 테이블 저장
4. 스케줄 생성 버튼 클릭 → 스케줄링 알고리즘 실행 (연차/휴가 반영)
5. 생성된 스케줄 → schedules 테이블 저장
6. 캘린더 탭에서 시각적 확인

## 📖 사용 가이드

### 1단계: 병원 정보 등록
1. "병원 관리" 탭 선택
2. 병원명과 기본 마감일 입력 (예: 뽀빠이통증의학과, 14일)
3. "추가" 버튼 클릭

### 2단계: 연차/휴가 등록 (NEW!)
1. "연차/휴가" 탭 선택
2. 날짜 선택
3. 휴가 종류 선택 (연차, 여름휴가, 겨울휴가, 병가, 기타)
4. 설명 입력 (선택사항)
5. "추가" 버튼 클릭
6. 등록된 연차/휴가는 자동으로 근무 불가일로 처리됩니다

### 3단계: 월별 작업량 입력
1. "작업량 입력" 탭 선택
2. 병원 선택
3. 년도/월 선택
   - **기존 데이터가 있으면 자동으로 불러옴**
4. 작업 개수 입력:
   - **상위노출**: 원하는 개수 입력
     - 각 상위노출마다 게시 날짜를 개별 지정 (1-31일)
     - 콘텐츠 완료 기한 이전 날짜만 선택 가능
   - **브랜드**: 원하는 개수 입력
     - 브랜드와 트렌드가 모두 있는 경우 게시 순서 선택 (1번째 또는 2번째)
   - **트렌드**: 원하는 개수 입력
     - 브랜드와 트렌드가 모두 있는 경우 게시 순서 선택 (1번째 또는 2번째)
     - ⚠️ 브랜드와 트렌드는 다른 순서여야 함
   - 언론보도: 0개 이상 입력 가능
   - 지식인: 0개 이상 입력 가능
5. **마감 당김 일수 선택 (0일~5일)**
6. **"저장" 버튼 클릭** (필수!)
7. 💡 **상위노출 날짜를 나중에 수정하고 싶으면 다시 병원/년월을 선택하면 기존 데이터가 자동으로 불러와집니다**

### 4단계: 스케줄 생성
1. "스케줄 생성" 버튼 클릭
2. 성공 메시지 확인 또는 경고 메시지 확인
3. 경고 발생 시:
   - 작업량 줄이기
   - 또는 마감 당김 일수 조정
   - 또는 연차/휴가 조정

### 5단계: 캘린더 확인
1. "캘린더" 탭 선택
2. 년도/월 선택
3. 스케줄 확인:
   - 🔴 빨간색: 보고서 작업 (10:00~12:00)
   - 🟣 보라색: 콘텐츠 작업
   - 🏖️ 각 색상: 연차/휴가 (종류별)

## 🚀 배포

### 로컬 개발
```bash
# 빌드
npm run build

# 데이터베이스 마이그레이션
npm run db:migrate:local

# 개발 서버 시작 (PM2)
pm2 start ecosystem.config.cjs

# 서버 상태 확인
pm2 list

# 로그 확인
pm2 logs webapp --nostream
```

### Cloudflare Pages 배포
```bash
# Cloudflare 로그인
npx wrangler login

# D1 데이터베이스 생성 (프로덕션)
npx wrangler d1 create webapp-production

# wrangler.jsonc에 database_id 업데이트

# 마이그레이션 적용 (프로덕션)
npx wrangler d1 migrations apply webapp-production

# 배포
npm run deploy
```

## 🛠 기술 스택
- **프레임워크**: Hono (경량 웹 프레임워크)
- **런타임**: Cloudflare Workers
- **데이터베이스**: Cloudflare D1 (SQLite)
- **프론트엔드**: TailwindCSS + FullCalendar.js + Axios
- **빌드 도구**: Vite
- **배포**: Cloudflare Pages
- **버전 관리**: Git + GitHub

## 📁 프로젝트 구조
```
webapp/
├── src/
│   ├── index.tsx      # 메인 앱 + API + UI
│   ├── types.ts       # TypeScript 타입 정의
│   ├── utils.ts       # 유틸리티 함수 (연차/휴가 반영)
│   └── scheduler.ts   # 스케줄링 알고리즘
├── migrations/
│   ├── 0001_initial_schema.sql
│   ├── 0002_add_vacations.sql
│   ├── 0003_add_task_order.sql
│   └── 0004_add_blog_order.sql
├── ecosystem.config.cjs
├── wrangler.jsonc
├── package.json
└── README.md
```

## 📊 프로젝트 상태
- ✅ **활성화**: 로컬 개발 환경 실행 중
- ✅ **공용 URL**: 접속 가능
- ✅ **GitHub**: 코드 업로드 완료
- ✅ **연차/휴가 기능**: 완전 구현
- ✅ **UI/UX 개선**: Schedule-AI 브랜딩 완료
- ✅ **블로그 게시 순서**: 브랜드/트렌드 순서 선택 기능 완료
- ✅ **상위노출 날짜 지정**: 병원별 개별 날짜 선택 기능 완료
- ✅ **병원 목록 정렬**: 날짜 오름차순 + 0 패딩
- ✅ **주말 색상 통일**: 토요일/일요일 동일 색상
- ✅ **마감 당김 확장**: 최대 5일까지 가능
- ✅ **데이터 수정 기능**: 기존 작업량 데이터 불러오기 및 수정
- ✅ **프로덕션 배포**: Cloudflare Pages 배포 완료 (https://schedule-ai.pages.dev)

## 🎯 마지막 업데이트
2026-01-31

**최근 개선사항:**
- 병원 목록 날짜 오름차순 정렬 및 한 자리 수 일자 0 패딩
- 토요일 색상을 일요일과 동일하게 변경 (주말 구분 명확)
- 마감 당김 일수 최대 5일로 확장
- 상위노출 날짜 나중에 추가/수정 기능 구현
- 기존 작업량 데이터 자동 불러오기 및 수정 기능

## 🔮 추천 다음 단계
1. ✅ **연차/휴가 관리**: 완료
2. ✅ **UI/UX 개선**: 완료
3. ⏳ **프로덕션 배포**: Cloudflare Pages에 배포
4. ⏳ **스케줄 수정 기능**: 생성된 스케줄 개별 수정
5. ⏳ **PDF 내보내기**: 월간 스케줄 PDF 다운로드
6. ⏳ **알림 기능**: 마감일 임박 알림
7. ⏳ **통계 대시보드**: 월별 작업량 통계 및 차트

---

<div align="center">
  <p>Made with 💜 by Schedule-AI</p>
  <p>© 2026 Schedule-AI. All rights reserved.</p>
</div>
