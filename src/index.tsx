import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Bindings } from './types'
import { generateSchedule, saveSchedule } from './scheduler'
import { formatDate } from './utils'

const app = new Hono<{ Bindings: Bindings }>()

// CORS 설정
app.use('/api/*', cors())

// =========================
// 병원 관리 API
// =========================

// 병원 목록 조회
app.get('/api/hospitals', async (c) => {
  const db = c.env.DB
  const result = await db.prepare('SELECT * FROM hospitals ORDER BY name').all()
  return c.json(result.results)
})

// 병원 추가
app.post('/api/hospitals', async (c) => {
  const db = c.env.DB
  const { name, base_due_day, sanwi_nosul_days } = await c.req.json()

  if (!name || !base_due_day) {
    return c.json({ error: '병원명과 기본 마감일을 입력해주세요' }, 400)
  }

  // sanwi_nosul_days를 JSON 문자열로 변환
  const sanwiDaysJson = sanwi_nosul_days ? JSON.stringify(sanwi_nosul_days) : null

  try {
    const result = await db.prepare(
      'INSERT INTO hospitals (name, base_due_day, sanwi_nosul_days) VALUES (?, ?, ?)'
    ).bind(name, base_due_day, sanwiDaysJson).run()

    return c.json({ id: result.meta.last_row_id, name, base_due_day, sanwi_nosul_days: sanwiDaysJson })
  } catch (error) {
    return c.json({ error: '병원 추가 실패 (중복된 이름일 수 있습니다)' }, 400)
  }
})

// 병원 수정
app.put('/api/hospitals/:id', async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')
  const { name, base_due_day, sanwi_nosul_day } = await c.req.json()

  await db.prepare(
    'UPDATE hospitals SET name = ?, base_due_day = ?, sanwi_nosul_day = ? WHERE id = ?'
  ).bind(name, base_due_day, sanwi_nosul_day || null, id).run()

  return c.json({ success: true })
})

// 병원 삭제
app.delete('/api/hospitals/:id', async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')

  await db.prepare('DELETE FROM hospitals WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// =========================
// 월별 작업량 관리 API
// =========================

// 월별 작업량 조회
app.get('/api/monthly-tasks/:year/:month', async (c) => {
  const db = c.env.DB
  const year = parseInt(c.req.param('year'))
  const month = parseInt(c.req.param('month'))

  const result = await db.prepare(`
    SELECT mt.*, h.name as hospital_name
    FROM monthly_tasks mt
    JOIN hospitals h ON mt.hospital_id = h.id
    WHERE mt.year = ? AND mt.month = ?
  `).bind(year, month).all()

  return c.json(result.results)
})

// 특정 병원의 월별 작업량 조회
app.get('/api/monthly-tasks/:hospital_id/:year/:month', async (c) => {
  const db = c.env.DB
  const hospitalId = parseInt(c.req.param('hospital_id'))
  const year = parseInt(c.req.param('year'))
  const month = parseInt(c.req.param('month'))

  const result = await db.prepare(`
    SELECT * FROM monthly_tasks WHERE hospital_id = ? AND year = ? AND month = ?
  `).bind(hospitalId, year, month).first()

  return c.json(result)
})

// 월별 작업량 저장/수정
app.post('/api/monthly-tasks', async (c) => {
  const db = c.env.DB
  const data = await c.req.json()
  const {
    hospital_id,
    year,
    month,
    sanwi_nosul,
    brand,
    trend,
    eonron_bodo,
    jisikin,
    cafe,
    deadline_pull_days,
    task_order
  } = data

  // sanwi_dates를 JSON 문자열로 변환
  const sanwiDatesJson = JSON.stringify(data.sanwi_dates || [])

  // 기존 데이터 확인
  const existing = await db.prepare(`
    SELECT id FROM monthly_tasks WHERE hospital_id = ? AND year = ? AND month = ?
  `).bind(hospital_id, year, month).first()

  if (existing) {
    // 업데이트
    await db.prepare(`
      UPDATE monthly_tasks
      SET sanwi_nosul = ?, brand = ?, trend = ?, eonron_bodo = ?, jisikin = ?, cafe = ?,
          deadline_pull_days = ?, task_order = ?, brand_order = ?, trend_order = ?, sanwi_dates = ?
      WHERE hospital_id = ? AND year = ? AND month = ?
    `).bind(
      sanwi_nosul, brand, trend, eonron_bodo, jisikin, cafe || 0, deadline_pull_days, 
      task_order || 'brand,trend', 
      data.brand_order || 1, 
      data.trend_order || 2,
      sanwiDatesJson,
      hospital_id, year, month
    ).run()
  } else {
    // 삽입
    await db.prepare(`
      INSERT INTO monthly_tasks (hospital_id, year, month, sanwi_nosul, brand, trend, eonron_bodo, jisikin, cafe, deadline_pull_days, task_order, brand_order, trend_order, sanwi_dates)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      hospital_id, year, month, sanwi_nosul, brand, trend, eonron_bodo, jisikin, cafe || 0, deadline_pull_days, 
      task_order || 'brand,trend',
      data.brand_order || 1,
      data.trend_order || 2,
      sanwiDatesJson
    ).run()
  }

  return c.json({ success: true })
})

// =========================
// 스케줄 생성 API
// =========================

// 스케줄 생성
app.post('/api/schedules/generate', async (c) => {
  const db = c.env.DB
  const { hospital_id, year, month } = await c.req.json()

  // 월별 작업량 조회
  const monthlyTask = await db.prepare(`
    SELECT * FROM monthly_tasks WHERE hospital_id = ? AND year = ? AND month = ?
  `).bind(hospital_id, year, month).first()

  if (!monthlyTask) {
    return c.json({ error: '해당 월의 작업량 데이터가 없습니다' }, 400)
  }

  // 스케줄 생성
  const result = await generateSchedule(db, hospital_id, year, month, monthlyTask as any)

  // 에러 체크
  if ('message' in result) {
    return c.json({ error: result }, 400)
  }

  // 스케줄 저장
  await saveSchedule(db, hospital_id, year, month, result)

  return c.json({ success: true, schedules: result })
})

// 스케줄 조회
app.get('/api/schedules/:year/:month', async (c) => {
  const db = c.env.DB
  const year = parseInt(c.req.param('year'))
  const month = parseInt(c.req.param('month'))

  const result = await db.prepare(`
    SELECT s.*, h.name as hospital_name, h.base_due_day,
           mt.deadline_pull_days
    FROM schedules s
    JOIN hospitals h ON s.hospital_id = h.id
    LEFT JOIN monthly_tasks mt ON s.hospital_id = mt.hospital_id 
      AND s.year = mt.year AND s.month = mt.month
    WHERE s.year = ? AND s.month = ?
    ORDER BY s.task_date, s.is_report, s.start_time
  `).bind(year, month).all()

  return c.json(result.results)
})

// 스케줄 삭제
app.delete('/api/schedules/:year/:month/:hospital_id', async (c) => {
  const db = c.env.DB
  const year = parseInt(c.req.param('year'))
  const month = parseInt(c.req.param('month'))
  const hospitalId = parseInt(c.req.param('hospital_id'))

  await db.prepare(
    'DELETE FROM schedules WHERE year = ? AND month = ? AND hospital_id = ?'
  ).bind(year, month, hospitalId).run()

  return c.json({ success: true })
})

// 스케줄 업데이트 (날짜 이동)
app.put('/api/schedules/:id', async (c) => {
  const db = c.env.DB
  const scheduleId = parseInt(c.req.param('id'))
  const { task_date } = await c.req.json()

  await db.prepare(
    'UPDATE schedules SET task_date = ? WHERE id = ?'
  ).bind(task_date, scheduleId).run()

  return c.json({ success: true })
})

// 스케줄 완료 상태 업데이트
app.put('/api/schedules/:id/complete', async (c) => {
  const db = c.env.DB
  const scheduleId = parseInt(c.req.param('id'))
  const { is_completed } = await c.req.json()

  await db.prepare(
    'UPDATE schedules SET is_completed = ? WHERE id = ?'
  ).bind(is_completed, scheduleId).run()

  return c.json({ success: true })
})

// =========================
// 연차/휴가 관리 API
// =========================

// 연차/휴가 목록 조회
app.get('/api/vacations/:year/:month', async (c) => {
  const db = c.env.DB
  const year = parseInt(c.req.param('year'))
  const month = parseInt(c.req.param('month'))

  const result = await db.prepare(`
    SELECT * FROM vacations
    WHERE strftime('%Y', vacation_date) = ? AND strftime('%m', vacation_date) = ?
    ORDER BY vacation_date
  `).bind(year.toString(), month.toString().padStart(2, '0')).all()

  return c.json(result.results)
})

// 연차/휴가 추가
app.post('/api/vacations', async (c) => {
  const db = c.env.DB
  const { vacation_date, vacation_type, description } = await c.req.json()

  if (!vacation_date || !vacation_type) {
    return c.json({ error: '날짜와 휴가 종류를 입력해주세요' }, 400)
  }

  try {
    const result = await db.prepare(
      'INSERT INTO vacations (vacation_date, vacation_type, description) VALUES (?, ?, ?)'
    ).bind(vacation_date, vacation_type, description || '').run()

    return c.json({ id: result.meta.last_row_id, vacation_date, vacation_type, description })
  } catch (error) {
    return c.json({ error: '연차/휴가 추가 실패 (중복된 날짜일 수 있습니다)' }, 400)
  }
})

// 연차/휴가 삭제
app.delete('/api/vacations/:id', async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')

  await db.prepare('DELETE FROM vacations WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// =========================
// 루트 페이지
// =========================

app.get('/', (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Schedule-AI - 스마트 업무 스케줄러</title>
    
    <!-- Favicon -->
    <link rel="icon" type="image/svg+xml" href="/static/favicon.svg">
    <link rel="icon" type="image/x-icon" href="/static/favicon.ico">
    <link rel="apple-touch-icon" href="/static/apple-touch-icon.png">
    
    <script>
      // Suppress Tailwind CDN production warning
      window.process = { env: { NODE_ENV: 'production' } };
    </script>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="/static/styles.css" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    
    <style>
      /* 완료된 작업 스타일 */
      .completed-task .fc-event-title {
        text-decoration: line-through !important;
        opacity: 0.6;
      }
      
      /* 이벤트 클릭 커서 */
      .fc-event {
        cursor: pointer !important;
      }
      
      /* 드래그 가능 표시 */
      .fc-event:hover {
        opacity: 0.8;
        transform: scale(1.02);
        transition: all 0.2s;
      }
    </style>
    <link href='https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.css' rel='stylesheet' />
</head>
<body class="bg-gradient-to-br from-purple-50 to-yellow-50 min-h-screen">
    <div id="app" class="max-w-7xl mx-auto p-6">
        <!-- Header -->
        <header class="mb-8 text-center">
            <div class="inline-block primary-gradient px-8 py-4 rounded-2xl shadow-lg mb-4">
                <h1 class="text-5xl font-bold text-white mb-2">
                    <i class="fas fa-brain mr-3"></i>
                    Schedule-AI
                </h1>
                <p class="text-white text-opacity-90">AI 기반 스마트 업무 스케줄 관리 시스템</p>
            </div>
        </header>

        <!-- 탭 네비게이션 -->
        <div class="mb-6 bg-white rounded-xl shadow-md p-2">
            <nav class="flex space-x-2">
                <button onclick="showTab('hospitals')" id="tab-hospitals" class="tab-button flex-1 py-3 px-4 rounded-lg font-medium text-sm transition-all">
                    <i class="fas fa-hospital mr-2"></i>병원 관리
                </button>
                <button onclick="showTab('vacations')" id="tab-vacations" class="tab-button flex-1 py-3 px-4 rounded-lg font-medium text-sm transition-all">
                    <i class="fas fa-umbrella-beach mr-2"></i>연차/휴가
                </button>
                <button onclick="showTab('tasks')" id="tab-tasks" class="tab-button flex-1 py-3 px-4 rounded-lg font-medium text-sm transition-all">
                    <i class="fas fa-tasks mr-2"></i>작업량 입력
                </button>
                <button onclick="showTab('calendar')" id="tab-calendar" class="tab-button flex-1 py-3 px-4 rounded-lg font-medium text-sm transition-all">
                    <i class="fas fa-calendar mr-2"></i>캘린더
                </button>
            </nav>
        </div>

        <!-- 병원 관리 탭 -->
        <div id="content-hospitals" class="tab-content">
            <div class="bg-white rounded-xl shadow-lg p-6 mb-6 border-2 border-purple-100">
                <h2 class="text-2xl font-bold mb-4 primary-color">
                    <i class="fas fa-plus-circle mr-2"></i>병원 추가
                </h2>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input type="text" id="hospital-name" placeholder="병원명" class="border-2 border-purple-200 rounded-lg px-4 py-3 focus:border-purple-400 focus:outline-none">
                    <input type="number" id="hospital-due-day" placeholder="기본 마감일 (1-31)" min="1" max="31" class="border-2 border-purple-200 rounded-lg px-4 py-3 focus:border-purple-400 focus:outline-none">
                </div>
                <div class="mt-4">
                    <label class="block text-sm font-semibold mb-2 primary-color">
                        <i class="fas fa-star mr-1"></i>상위노출 일자 (선택, 최대 5개)
                    </label>
                    <div class="flex flex-wrap gap-2">
                        <input type="number" id="hospital-sanwi-day-1" placeholder="1번째 (예: 5)" min="1" max="31" class="border-2 border-purple-200 rounded-lg px-4 py-2 w-32 focus:border-purple-400 focus:outline-none">
                        <input type="number" id="hospital-sanwi-day-2" placeholder="2번째 (예: 15)" min="1" max="31" class="border-2 border-purple-200 rounded-lg px-4 py-2 w-32 focus:border-purple-400 focus:outline-none">
                        <input type="number" id="hospital-sanwi-day-3" placeholder="3번째 (예: 25)" min="1" max="31" class="border-2 border-purple-200 rounded-lg px-4 py-2 w-32 focus:border-purple-400 focus:outline-none">
                        <input type="number" id="hospital-sanwi-day-4" placeholder="4번째" min="1" max="31" class="border-2 border-purple-200 rounded-lg px-4 py-2 w-32 focus:border-purple-400 focus:outline-none">
                        <input type="number" id="hospital-sanwi-day-5" placeholder="5번째" min="1" max="31" class="border-2 border-purple-200 rounded-lg px-4 py-2 w-32 focus:border-purple-400 focus:outline-none">
                    </div>
                    <p class="text-sm text-purple-600 mt-2">
                        <i class="fas fa-info-circle mr-1"></i>
                        상위노출 일자를 여러 개 지정하면 해당 날짜들에 상위노출 작업이 배치됩니다 (빈 칸은 무시됨)
                    </p>
                </div>
                <button onclick="addHospital()" class="mt-4 btn-primary text-white rounded-lg px-6 py-3 font-semibold shadow-md hover:shadow-lg transition-all">
                    <i class="fas fa-plus mr-2"></i>추가
                </button>
            </div>

            <div class="bg-white rounded-xl shadow-lg p-6 border-2 border-purple-100">
                <h2 class="text-2xl font-bold mb-6 primary-color">
                    <i class="fas fa-list mr-2"></i>병원 목록
                </h2>
                <div id="hospitals-list" class="space-y-3"></div>
            </div>
        </div>

        <!-- 연차/휴가 관리 탭 -->
        <div id="content-vacations" class="tab-content hidden">
            <div class="bg-white rounded-xl shadow-lg p-6 mb-6 border-2 border-yellow-100">
                <h2 class="text-2xl font-bold mb-4 secondary-color" style="color: #FFA500;">
                    <i class="fas fa-umbrella-beach mr-2"></i>연차/휴가 추가
                </h2>
                <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <input type="date" id="vacation-date" class="border-2 border-yellow-200 rounded-lg px-4 py-3 focus:border-yellow-400 focus:outline-none">
                    <select id="vacation-type" class="border-2 border-yellow-200 rounded-lg px-4 py-3 focus:border-yellow-400 focus:outline-none">
                        <option value="annual">연차</option>
                        <option value="summer">여름휴가</option>
                        <option value="winter">겨울휴가</option>
                        <option value="sick">병가</option>
                        <option value="other">기타</option>
                    </select>
                    <input type="text" id="vacation-description" placeholder="설명 (선택)" class="border-2 border-yellow-200 rounded-lg px-4 py-3 focus:border-yellow-400 focus:outline-none">
                    <button onclick="addVacation()" class="btn-secondary text-gray-800 rounded-lg px-6 py-3 font-semibold shadow-md hover:shadow-lg transition-all">
                        <i class="fas fa-plus mr-2"></i>추가
                    </button>
                </div>
            </div>

            <div class="bg-white rounded-xl shadow-lg p-6 border-2 border-yellow-100">
                <h2 class="text-2xl font-bold mb-6 secondary-color" style="color: #FFA500;">
                    <i class="fas fa-calendar-check mr-2"></i>연차/휴가 목록
                </h2>
                <div class="flex gap-2 mb-4">
                    <select id="vacation-year" onchange="loadVacations()" class="border-2 border-yellow-200 rounded-lg px-4 py-2"></select>
                    <select id="vacation-month" onchange="loadVacations()" class="border-2 border-yellow-200 rounded-lg px-4 py-2"></select>
                </div>
                <div id="vacations-list" class="space-y-3"></div>
            </div>
        </div>

        <!-- 작업량 입력 탭 -->
        <div id="content-tasks" class="tab-content hidden">
            <div class="bg-white rounded-xl shadow-lg p-6 mb-6 border-2 border-purple-100">
                <h2 class="text-2xl font-bold mb-4 primary-color">
                    <i class="fas fa-cog mr-2"></i>월별 작업량 설정
                </h2>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <select id="task-hospital" onchange="loadExistingTaskData()" class="border-2 border-purple-200 rounded-lg px-4 py-3 focus:border-purple-400 focus:outline-none">
                        <option value="">병원 선택</option>
                    </select>
                    <select id="task-year" onchange="loadExistingTaskData()" class="border-2 border-purple-200 rounded-lg px-4 py-3 focus:border-purple-400 focus:outline-none"></select>
                    <select id="task-month" onchange="loadExistingTaskData()" class="border-2 border-purple-200 rounded-lg px-4 py-3 focus:border-purple-400 focus:outline-none"></select>
                </div>

                <div class="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 mb-4" id="existing-data-notice" style="display: none;">
                    <p class="text-sm text-blue-800">
                        <i class="fas fa-info-circle mr-2"></i>
                        <strong>기존 데이터가 있습니다!</strong> 아래 값을 수정하고 "저장" 버튼을 클릭하면 업데이트됩니다.
                    </p>
                </div>

                <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                    <div>
                        <label class="block text-sm font-semibold mb-2 primary-color">브랜드</label>
                        <input type="number" id="task-brand" min="0" value="0" class="border-2 border-purple-200 rounded-lg px-4 py-3 w-full focus:border-purple-400 focus:outline-none" onchange="updateBrandTrendOrder()">
                        <div id="brand-order-container" class="mt-2 hidden">
                            <label class="text-xs text-gray-600">게시 순서:</label>
                            <select id="brand-order" class="text-sm border border-gray-300 rounded px-2 py-1 w-full">
                                <option value="1">1번째</option>
                                <option value="2">2번째</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-semibold mb-2 primary-color">트렌드</label>
                        <input type="number" id="task-trend" min="0" value="0" class="border-2 border-purple-200 rounded-lg px-4 py-3 w-full focus:border-purple-400 focus:outline-none" onchange="updateBrandTrendOrder()">
                        <div id="trend-order-container" class="mt-2 hidden">
                            <label class="text-xs text-gray-600">게시 순서:</label>
                            <select id="trend-order" class="text-sm border border-gray-300 rounded px-2 py-1 w-full">
                                <option value="1">1번째</option>
                                <option value="2">2번째</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-semibold mb-2 primary-color">언론보도</label>
                        <input type="number" id="task-eonron" min="0" value="1" class="border-2 border-purple-200 rounded-lg px-4 py-3 w-full focus:border-purple-400 focus:outline-none">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold mb-2 primary-color">지식인</label>
                        <input type="number" id="task-jisikin" min="0" value="1" class="border-2 border-purple-200 rounded-lg px-4 py-3 w-full focus:border-purple-400 focus:outline-none">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold mb-2 primary-color">카페 포스팅</label>
                        <input type="number" id="task-cafe" min="0" value="4" class="border-2 border-purple-200 rounded-lg px-4 py-3 w-full focus:border-purple-400 focus:outline-none">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold mb-2 primary-color">마감 당김 일수</label>
                        <select id="task-pull-days" class="border-2 border-purple-200 rounded-lg px-4 py-3 w-full focus:border-purple-400 focus:outline-none">
                            <option value="0">0일</option>
                            <option value="1">1일</option>
                            <option value="2">2일</option>
                            <option value="3">3일</option>
                            <option value="4">4일</option>
                            <option value="5">5일</option>
                        </select>
                    </div>
                </div>

                <div class="bg-purple-50 border-2 border-purple-200 rounded-lg p-4 mb-6">
                    <p class="text-sm text-purple-800">
                        <i class="fas fa-info-circle mr-2"></i>
                        <strong>사용 방법:</strong> 
                        1) 병원, 년월 선택 → 2) 작업 개수 입력 → 3) <strong class="text-purple-600">"저장" 버튼 클릭 필수</strong> → 4) "스케줄 생성" 클릭
                    </p>
                </div>

                <div class="flex gap-4">
                    <button onclick="saveMonthlyTask()" class="btn-primary text-white rounded-lg px-8 py-3 font-semibold shadow-md hover:shadow-lg transition-all">
                        <i class="fas fa-save mr-2"></i>저장
                    </button>
                    <button onclick="generateSchedule()" class="btn-secondary text-gray-800 rounded-lg px-8 py-3 font-semibold shadow-md hover:shadow-lg transition-all">
                        <i class="fas fa-magic mr-2"></i>스케줄 생성
                    </button>
                </div>
            </div>

            <div id="schedule-error" class="hidden bg-red-50 border-2 border-red-300 text-red-700 px-6 py-4 rounded-xl mb-4 shadow-md"></div>
            <div id="schedule-success" class="hidden bg-green-50 border-2 border-green-300 text-green-700 px-6 py-4 rounded-xl mb-4 shadow-md"></div>
        </div>

        <!-- 캘린더 탭 -->
        <div id="content-calendar" class="tab-content hidden">
            <!-- 작업 개수 현황표 -->
            <div id="task-stats" class="bg-white rounded-xl shadow-lg p-6 mb-4 border-2 border-purple-100 hidden">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-bold primary-color">
                        <i class="fas fa-tasks mr-2"></i>작업 개수 현황
                    </h3>
                    <div class="flex gap-2 items-center">
                        <label class="text-sm text-gray-600">병원:</label>
                        <select id="stats-hospital" onchange="updateStatsForHospital()" class="border-2 border-purple-200 rounded-lg px-3 py-2 text-sm">
                            <option value="all">전체</option>
                        </select>
                    </div>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div class="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 text-center">
                        <div class="text-sm text-gray-600 mb-1">브랜드</div>
                        <div class="text-2xl font-bold text-blue-600">
                            <span id="stat-brand-completed">0</span> / <span id="stat-brand-total">0</span>
                        </div>
                    </div>
                    <div class="bg-green-50 border-2 border-green-200 rounded-lg p-4 text-center">
                        <div class="text-sm text-gray-600 mb-1">트렌드</div>
                        <div class="text-2xl font-bold text-green-600">
                            <span id="stat-trend-completed">0</span> / <span id="stat-trend-total">0</span>
                        </div>
                    </div>
                    <div class="bg-purple-50 border-2 border-purple-200 rounded-lg p-4 text-center">
                        <div class="text-sm text-gray-600 mb-1">상위노출</div>
                        <div class="text-2xl font-bold text-purple-600">
                            <span id="stat-sanwi-completed">0</span> / <span id="stat-sanwi-total">0</span>
                        </div>
                    </div>
                    <div class="bg-orange-50 border-2 border-orange-200 rounded-lg p-4 text-center">
                        <div class="text-sm text-gray-600 mb-1">언론보도</div>
                        <div class="text-2xl font-bold text-orange-600">
                            <span id="stat-eonron-completed">0</span> / <span id="stat-eonron-total">0</span>
                        </div>
                    </div>
                    <div class="bg-pink-50 border-2 border-pink-200 rounded-lg p-4 text-center">
                        <div class="text-sm text-gray-600 mb-1">지식인</div>
                        <div class="text-2xl font-bold text-pink-600">
                            <span id="stat-jisikin-completed">0</span> / <span id="stat-jisikin-total">0</span>
                        </div>
                    </div>
                    <div class="bg-indigo-50 border-2 border-indigo-200 rounded-lg p-4 text-center">
                        <div class="text-sm text-gray-600 mb-1">카페 포스팅</div>
                        <div class="text-2xl font-bold text-indigo-600">
                            <span id="stat-cafe-completed">0</span> / <span id="stat-cafe-total">0</span>
                        </div>
                    </div>
                    <div class="bg-red-50 border-2 border-red-200 rounded-lg p-4 text-center">
                        <div class="text-sm text-gray-600 mb-1">보고서</div>
                        <div class="text-2xl font-bold text-red-600">
                            <span id="stat-report-completed">0</span> / <span id="stat-report-total">0</span>
                        </div>
                    </div>
                    <div class="bg-gray-50 border-2 border-gray-200 rounded-lg p-4 text-center">
                        <div class="text-sm text-gray-600 mb-1">전체 진행률</div>
                        <div class="text-2xl font-bold text-gray-700">
                            <span id="stat-progress">0</span>%
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="bg-white rounded-xl shadow-lg p-6 mb-4 border-2 border-purple-100">
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-2xl font-bold primary-color">
                        <i class="fas fa-calendar-alt mr-2"></i>스케줄 캘린더
                    </h2>
                    <div class="flex gap-2">
                        <button onclick="deleteAllSchedules()" class="bg-red-500 hover:bg-red-600 text-white rounded-lg px-4 py-2 font-semibold shadow-md hover:shadow-lg transition-all">
                            <i class="fas fa-trash-alt mr-2"></i>전체 삭제
                        </button>
                        <select id="calendar-year" onchange="loadCalendar()" class="border-2 border-purple-200 rounded-lg px-4 py-2"></select>
                        <select id="calendar-month" onchange="loadCalendar()" class="border-2 border-purple-200 rounded-lg px-4 py-2"></select>
                    </div>
                </div>
                <div id="calendar"></div>
            </div>
        </div>
    </div>

    <script src='https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.js'></script>
    <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
    <script>
        let calendar = null;
        let hospitals = [];
        
        // 2026년 공휴일 목록
        const holidays2026 = [
            '2026-01-01', // 신정
            '2026-02-16', '2026-02-17', '2026-02-18', // 설날
            '2026-03-01', '2026-03-02', // 삼일절
            '2026-05-05', '2026-05-24', '2026-05-25', // 어린이날, 부처님오신날
            '2026-06-06', // 현충일
            '2026-08-15', '2026-08-17', // 광복절
            '2026-09-24', '2026-09-25', '2026-09-26', // 추석
            '2026-10-03', '2026-10-05', // 개천절
            '2026-10-09', // 한글날
            '2026-12-25' // 크리스마스
        ];
        
        // 연차/휴가 타입 (파스텔 톤)
        const vacationTypes = {
            annual: { label: '연차', color: '#ffc9e0' },      // 파스텔 핑크
            summer: { label: '여름휴가', color: '#b4e7ce' },   // 파스텔 민트
            winter: { label: '겨울휴가', color: '#b8d4f1' },   // 파스텔 블루
            sick: { label: '병가', color: '#ffd4a3' },         // 파스텔 오렌지
            other: { label: '기타', color: '#d4c5f9' }         // 파스텔 퍼플
        };

        // 탭 전환
        function showTab(tab) {
            document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
            document.querySelectorAll('.tab-button').forEach(el => {
                el.classList.remove('btn-primary', 'text-white');
                el.classList.add('text-gray-600');
            });

            document.getElementById('content-' + tab).classList.remove('hidden');
            document.getElementById('tab-' + tab).classList.add('btn-primary', 'text-white');
            document.getElementById('tab-' + tab).classList.remove('text-gray-600');

            if (tab === 'calendar' && calendar === null) {
                initCalendar();
            }
            if (tab === 'vacations') {
                loadVacations();
            }
        }

        // 병원 목록 로드
        async function loadHospitals() {
            try {
                const res = await axios.get('/api/hospitals');
                hospitals = res.data;
                
                // 날짜 오름차순으로 정렬
                hospitals.sort((a, b) => a.base_due_day - b.base_due_day);
                
                const list = document.getElementById('hospitals-list');
                list.innerHTML = hospitals.map(h => \`
                    <div class="flex justify-between items-center p-5 border-2 border-purple-100 rounded-xl hover:border-purple-300 transition-all bg-gradient-to-r from-purple-50 to-white shadow-sm hover:shadow-md">
                        <div class="flex items-center space-x-4">
                            <div class="bg-gradient-to-br from-purple-400 to-purple-600 text-white rounded-lg p-3">
                                <i class="fas fa-hospital text-2xl"></i>
                            </div>
                            <div>
                                <span class="font-bold text-lg text-gray-800">\${h.name}</span>
                                <div class="flex items-center mt-1 space-x-4">
                                    <div class="flex items-center">
                                        <i class="fas fa-calendar-day text-purple-500 mr-2"></i>
                                        <span class="text-purple-600 font-semibold">마감일: 매월 \${String(h.base_due_day).padStart(2, '0')}일</span>
                                    </div>
                                    \${h.sanwi_nosul_days ? \`
                                        <div class="flex items-center">
                                            <i class="fas fa-star text-yellow-500 mr-2"></i>
                                            <span class="text-yellow-600 font-semibold">상위노출: \${JSON.parse(h.sanwi_nosul_days).map(d => String(d).padStart(2, '0')).join(', ')}일</span>
                                        </div>
                                    \` : ''}
                                </div>
                            </div>
                        </div>
                        <button onclick="deleteHospital(\${h.id})" class="text-red-500 hover:text-red-700 hover:bg-red-50 p-3 rounded-lg transition-all">
                            <i class="fas fa-trash text-xl"></i>
                        </button>
                    </div>
                \`).join('');

                // 작업량 입력 탭의 드롭다운 업데이트
                const select = document.getElementById('task-hospital');
                select.innerHTML = '<option value="">병원 선택</option>' + 
                    hospitals.map(h => \`<option value="\${h.id}">\${h.name}</option>\`).join('');
            } catch (error) {
                alert('병원 목록 로드 실패');
            }
        }

        // 병원 추가
        async function addHospital() {
            const name = document.getElementById('hospital-name').value;
            const baseDueDay = document.getElementById('hospital-due-day').value;
            
            // 상위노출 날짜 수집 (최대 5개)
            const sanwiDays = [];
            for (let i = 1; i <= 5; i++) {
                const dayInput = document.getElementById(\`hospital-sanwi-day-\${i}\`);
                if (dayInput && dayInput.value) {
                    sanwiDays.push(parseInt(dayInput.value));
                }
            }

            if (!name || !baseDueDay) {
                alert('병원명과 기본 마감일을 입력해주세요');
                return;
            }

            try {
                await axios.post('/api/hospitals', { 
                    name, 
                    base_due_day: parseInt(baseDueDay),
                    sanwi_nosul_days: sanwiDays.length > 0 ? sanwiDays : null
                });
                document.getElementById('hospital-name').value = '';
                document.getElementById('hospital-due-day').value = '';
                for (let i = 1; i <= 5; i++) {
                    document.getElementById(\`hospital-sanwi-day-\${i}\`).value = '';
                }
                loadHospitals();
                alert('병원이 추가되었습니다');
            } catch (error) {
                alert('병원 추가 실패: ' + (error.response?.data?.error || '알 수 없는 오류'));
            }
        }

        // 병원 삭제
        async function deleteHospital(id) {
            if (!confirm('정말 삭제하시겠습니까?')) return;

            try {
                await axios.delete(\`/api/hospitals/\${id}\`);
                loadHospitals();
                alert('병원이 삭제되었습니다');
            } catch (error) {
                alert('병원 삭제 실패');
            }
        }

        // 상위노출 날짜 선택 UI 업데이트
        // 브랜드/트렌드 게시 순서 UI 업데이트
        function updateBrandTrendOrder() {
            const brandCount = parseInt(document.getElementById('task-brand').value) || 0;
            const trendCount = parseInt(document.getElementById('task-trend').value) || 0;
            const brandOrderContainer = document.getElementById('brand-order-container');
            const trendOrderContainer = document.getElementById('trend-order-container');
            
            if (brandCount > 0 && trendCount > 0) {
                brandOrderContainer.classList.remove('hidden');
                trendOrderContainer.classList.remove('hidden');
            } else {
                brandOrderContainer.classList.add('hidden');
                trendOrderContainer.classList.add('hidden');
            }
        }

        // 연차/휴가 목록 로드
        async function loadVacations() {
            const year = document.getElementById('vacation-year').value;
            const month = document.getElementById('vacation-month').value;

            if (!year || !month) return;

            try {
                const res = await axios.get(\`/api/vacations/\${year}/\${month}\`);
                const list = document.getElementById('vacations-list');
                
                if (res.data.length === 0) {
                    list.innerHTML = '<p class="text-gray-500 text-center py-4">등록된 연차/휴가가 없습니다</p>';
                    return;
                }

                list.innerHTML = res.data.map(v => {
                    const vType = vacationTypes[v.vacation_type] || vacationTypes.other;
                    const textColor = v.vacation_type === 'annual' ? '#be123c' : 
                                     v.vacation_type === 'summer' ? '#065f46' :
                                     v.vacation_type === 'winter' ? '#1e40af' :
                                     v.vacation_type === 'sick' ? '#c2410c' : '#6b21a8';
                    return \`
                        <div class="flex justify-between items-center p-4 border-2 rounded-xl transition-all shadow-sm hover:shadow-md" style="border-color: \${vType.color}; background: linear-gradient(to right, \${vType.color}30, white);">
                            <div class="flex items-center space-x-4">
                                <div class="rounded-lg p-3" style="background-color: \${vType.color};">
                                    <i class="fas fa-umbrella-beach text-2xl text-white"></i>
                                </div>
                                <div>
                                    <span class="font-bold text-lg text-gray-800">\${v.vacation_date}</span>
                                    <div class="flex items-center mt-1 space-x-2">
                                        <span class="px-3 py-1 rounded-full text-sm font-semibold" style="background-color: \${vType.color}; color: \${textColor};">
                                            \${vType.label}
                                        </span>
                                        \${v.description ? \`<span class="text-gray-600">\${v.description}</span>\` : ''}
                                    </div>
                                </div>
                            </div>
                            <button onclick="deleteVacation(\${v.id})" class="text-red-500 hover:text-red-700 hover:bg-red-50 p-3 rounded-lg transition-all">
                                <i class="fas fa-trash text-xl"></i>
                            </button>
                        </div>
                    \`;
                }).join('');
            } catch (error) {
                console.error('연차/휴가 로드 실패', error);
            }
        }

        // 연차/휴가 추가
        async function addVacation() {
            const date = document.getElementById('vacation-date').value;
            const type = document.getElementById('vacation-type').value;
            const description = document.getElementById('vacation-description').value;

            if (!date) {
                alert('날짜를 선택해주세요');
                return;
            }

            try {
                await axios.post('/api/vacations', {
                    vacation_date: date,
                    vacation_type: type,
                    description: description
                });

                document.getElementById('vacation-date').value = '';
                document.getElementById('vacation-description').value = '';
                loadVacations();
                alert('연차/휴가가 추가되었습니다');
            } catch (error) {
                alert('연차/휴가 추가 실패: ' + (error.response?.data?.error || '알 수 없는 오류'));
            }
        }

        // 연차/휴가 삭제
        async function deleteVacation(id) {
            if (!confirm('정말 삭제하시겠습니까?')) return;

            try {
                await axios.delete(\`/api/vacations/\${id}\`);
                loadVacations();
                alert('연차/휴가가 삭제되었습니다');
            } catch (error) {
                alert('연차/휴가 삭제 실패');
            }
        }

        // 월별 작업량 저장
        async function saveMonthlyTask() {
            const hospitalId = document.getElementById('task-hospital').value;
            const year = document.getElementById('task-year').value;
            const month = document.getElementById('task-month').value;

            if (!hospitalId || !year || !month) {
                alert('병원과 년월을 선택해주세요');
                return;
            }

            const data = {
                hospital_id: parseInt(hospitalId),
                year: parseInt(year),
                month: parseInt(month),
                sanwi_nosul: 0, // 병원 관리에서 설정된 날짜 사용
                brand: parseInt(document.getElementById('task-brand').value),
                trend: parseInt(document.getElementById('task-trend').value),
                eonron_bodo: parseInt(document.getElementById('task-eonron').value),
                jisikin: parseInt(document.getElementById('task-jisikin').value),
                cafe: parseInt(document.getElementById('task-cafe').value),
                deadline_pull_days: parseInt(document.getElementById('task-pull-days').value),
                task_order: 'brand,trend', // 기본값
                brand_order: parseInt(document.getElementById('brand-order')?.value || '1'),
                trend_order: parseInt(document.getElementById('trend-order')?.value || '2'),
                sanwi_dates: [] // 병원 관리에서 설정된 날짜 사용
            };

            // 브랜드/트렌드 게시 순서 검증
            const brandCount = data.brand;
            const trendCount = data.trend;
            if (brandCount > 0 && trendCount > 0) {
                if (data.brand_order === data.trend_order) {
                    alert('브랜드와 트렌드의 게시 순서가 같을 수 없습니다');
                    return;
                }
            }

            try {
                await axios.post('/api/monthly-tasks', data);
                document.getElementById('schedule-success').classList.remove('hidden');
                document.getElementById('schedule-success').textContent = '작업량이 저장되었습니다';
                setTimeout(() => {
                    document.getElementById('schedule-success').classList.add('hidden');
                }, 3000);
            } catch (error) {
                alert('저장 실패');
            }
        }

        // 기존 작업량 데이터 불러오기
        async function loadExistingTaskData() {
            const hospitalId = document.getElementById('task-hospital').value;
            const year = document.getElementById('task-year').value;
            const month = document.getElementById('task-month').value;

            if (!hospitalId || !year || !month) {
                document.getElementById('existing-data-notice').style.display = 'none';
                return;
            }

            try {
                const res = await axios.get(\`/api/monthly-tasks/\${hospitalId}/\${year}/\${month}\`);
                const data = res.data;

                if (data) {
                    // 기존 데이터가 있으면 폼에 채우기
                    document.getElementById('task-brand').value = data.brand || 0;
                    document.getElementById('task-trend').value = data.trend || 0;
                    document.getElementById('task-eonron').value = data.eonron_bodo || 0;
                    document.getElementById('task-jisikin').value = data.jisikin || 0;
                    document.getElementById('task-cafe').value = data.cafe || 4;
                    document.getElementById('task-pull-days').value = data.deadline_pull_days || 0;

                    // 브랜드/트렌드 순서 복원
                    updateBrandTrendOrder();
                    if (data.brand_order) {
                        document.getElementById('brand-order').value = data.brand_order;
                    }
                    if (data.trend_order) {
                        document.getElementById('trend-order').value = data.trend_order;
                    }

                    document.getElementById('existing-data-notice').style.display = 'block';
                } else {
                    document.getElementById('existing-data-notice').style.display = 'none';
                }
            } catch (error) {
                // 데이터가 없으면 무시
                document.getElementById('existing-data-notice').style.display = 'none';
            }
        }

        // 스케줄 생성
        async function generateSchedule() {
            const hospitalId = document.getElementById('task-hospital').value;
            const year = document.getElementById('task-year').value;
            const month = document.getElementById('task-month').value;

            if (!hospitalId || !year || !month) {
                alert('병원과 년월을 선택해주세요');
                return;
            }

            document.getElementById('schedule-error').classList.add('hidden');
            document.getElementById('schedule-success').classList.add('hidden');

            try {
                await axios.post('/api/schedules/generate', {
                    hospital_id: parseInt(hospitalId),
                    year: parseInt(year),
                    month: parseInt(month)
                });

                document.getElementById('schedule-success').classList.remove('hidden');
                document.getElementById('schedule-success').innerHTML = \`
                    <strong><i class="fas fa-check-circle mr-2"></i>스케줄 생성 완료!</strong><br>
                    캘린더 탭에서 확인하세요.
                \`;
                
                // 3초 후 캘린더 탭으로 자동 이동
                setTimeout(() => {
                    showTab('calendar');
                    loadCalendar();
                }, 2000);
            } catch (error) {
                const errorData = error.response?.data?.error;
                document.getElementById('schedule-error').classList.remove('hidden');
                
                if (typeof errorData === 'string') {
                    // 단순 문자열 에러 (예: "해당 월의 작업량 데이터가 없습니다")
                    document.getElementById('schedule-error').innerHTML = \`
                        <strong><i class="fas fa-exclamation-triangle mr-2"></i>오류:</strong> \${errorData}<br>
                        <div class="mt-2 text-sm">
                            💡 <strong>해결 방법:</strong> 위의 "저장" 버튼을 먼저 클릭하여 작업량을 저장한 후 스케줄을 생성하세요.
                        </div>
                    \`;
                } else if (errorData && errorData.message) {
                    // 구조화된 에러 객체
                    const messageWithBreaks = errorData.message.replace(/\\n/g, '<br>');
                    document.getElementById('schedule-error').innerHTML = \`
                        <div style="white-space: pre-wrap;">\${messageWithBreaks}</div>
                        <div class="mt-4 text-sm">
                            <strong>병원:</strong> \${errorData.hospital_name}<br>
                            \${errorData.shortage_hours > 0 ? \`<strong>부족 시간:</strong> \${errorData.shortage_hours}시간\` : ''}
                        </div>
                    \`;
                } else {
                    document.getElementById('schedule-error').innerHTML = \`
                        <strong><i class="fas fa-exclamation-triangle mr-2"></i>스케줄 생성 실패</strong><br>
                        <div class="mt-2 text-sm">
                            💡 작업량을 먼저 저장했는지 확인하세요.
                        </div>
                    \`;
                }
            }
        }

        // 캘린더 초기화
        function initCalendar() {
            const calendarEl = document.getElementById('calendar');
            calendar = new FullCalendar.Calendar(calendarEl, {
                initialView: 'dayGridMonth',
                headerToolbar: false,
                locale: 'ko',
                height: 'auto',
                events: [],
                editable: true, // 드래그 앤 드롭 활성화
                eventDrop: handleEventDrop, // 이벤트 이동 핸들러
                eventClick: handleEventClick, // 이벤트 클릭 핸들러 (완료 체크)
                dayCellDidMount: function(info) {
                    const date = info.date;
                    const dayOfWeek = date.getDay();
                    // 로컬 타임존으로 날짜 포맷 (UTC 변환 방지)
                    const year = date.getFullYear();
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const day = String(date.getDate()).padStart(2, '0');
                    const dateStr = year + '-' + month + '-' + day;
                    
                    // 공휴일 배경색 (파스텔 빨강)
                    if (holidays2026.includes(dateStr)) {
                        info.el.style.backgroundColor = '#fecaca'; // 파스텔 빨강
                        info.el.style.fontWeight = 'bold';
                    }
                    // 주말 배경색 (토요일, 일요일 모두 파스텔 핑크)
                    else if (dayOfWeek === 0 || dayOfWeek === 6) {
                        info.el.style.backgroundColor = '#ffe4e6'; // 파스텔 핑크
                    }
                    // 평일 배경색 (연한 파란색)
                    else {
                        info.el.style.backgroundColor = '#f0f9ff'; // 아주 연한 파란색
                    }
                },
                eventDidMount: function(info) {
                    // 일찍 출근 이벤트가 있는 날짜의 배경색 변경
                    if (info.event.extendedProps.taskType === 'early_start') {
                        const dateStr = info.event.startStr;
                        const dayCell = document.querySelector(\`[data-date="\${dateStr}"]\`);
                        if (dayCell) {
                            dayCell.style.backgroundColor = '#787FFF';
                            dayCell.style.fontWeight = 'bold';
                        }
                    }
                },
                dayCellClassNames: function(info) {
                    const date = info.date;
                    const dayOfWeek = date.getDay();
                    // 로컬 타임존으로 날짜 포맷 (UTC 변환 방지)
                    const year = date.getFullYear();
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const day = String(date.getDate()).padStart(2, '0');
                    const dateStr = year + '-' + month + '-' + day;
                    
                    // 공휴일 빨간색 텍스트
                    if (holidays2026.includes(dateStr)) {
                        return ['text-red-500'];
                    }
                    // 주말 (토요일, 일요일) 빨간색 텍스트
                    if (dayOfWeek === 0 || dayOfWeek === 6) {
                        return ['text-red-400'];
                    }
                    return [];
                }
            });
            calendar.render();
            loadCalendar();
        }

        // 캘린더 로드
        async function loadCalendar() {
            const year = document.getElementById('calendar-year').value;
            const month = document.getElementById('calendar-month').value;

            if (!calendar || !year || !month) return;

            try {
                // 스케줄 가져오기
                const scheduleRes = await axios.get(\`/api/schedules/\${year}/\${month}\`);
                const events = scheduleRes.data.map(s => {
                    // 파스텔 톤 색상 (보고서: 파스텔 핑크, 작업: 파스텔 블루)
                    const color = s.is_report ? '#fda4af' : '#bfdbfe'; // 파스텔 핑크 vs 파스텔 블루
                    const textColor = s.is_report ? '#be123c' : '#1e40af'; // 진한 핑크 vs 진한 블루
                    
                    // 완료 상태면 취소선 추가
                    const titlePrefix = s.is_completed ? '✅ ' : '';
                    
                    return {
                        id: s.id, // 스케줄 ID 추가 (드래그 앤 드롭에 필요)
                        title: \`\${titlePrefix}\${s.hospital_name} - \${s.task_name} (\${s.start_time}-\${s.end_time})\`,
                        start: s.task_date,
                        color: color,
                        textColor: textColor,
                        borderColor: textColor,
                        editable: true, // 이 이벤트는 이동 가능
                        classNames: s.is_completed ? ['completed-task'] : [], // 완료 시 CSS 클래스 추가
                        extendedProps: {
                            scheduleId: s.id,
                            hospitalId: s.hospital_id,
                            taskType: s.task_type,
                            taskName: s.task_name,
                            startTime: s.start_time,
                            endTime: s.end_time,
                            durationHours: s.duration_hours,
                            isReport: s.is_report,
                            isCompleted: s.is_completed || 0,
                            pullDays: s.deadline_pull_days
                        }
                    };
                });

                // 연차/휴가 가져오기
                const vacationRes = await axios.get(\`/api/vacations/\${year}/\${month}\`);
                const vacationEvents = vacationRes.data.map(v => {
                    const vType = vacationTypes[v.vacation_type] || vacationTypes.other;
                    // 연차/휴가도 진한 텍스트 색상 사용
                    const textColor = v.vacation_type === 'annual' ? '#be123c' : 
                                     v.vacation_type === 'summer' ? '#065f46' :
                                     v.vacation_type === 'winter' ? '#1e40af' :
                                     v.vacation_type === 'sick' ? '#c2410c' : '#6b21a8';
                    return {
                        title: \`🏖️ \${vType.label}\${v.description ? ': ' + v.description : ''}\`,
                        start: v.vacation_date,
                        color: vType.color,
                        textColor: textColor,
                        borderColor: textColor,
                        allDay: true,
                        editable: false // 연차는 이동 불가
                    };
                });

                calendar.removeAllEvents();
                calendar.addEventSource(events.concat(vacationEvents));
                calendar.gotoDate(\`\${year}-\${month.padStart(2, '0')}-01\`);
                
                // 병원 목록 업데이트 (통계용)
                updateStatsHospitalList(scheduleRes.data);
                
                // 작업 통계 업데이트
                updateTaskStats(scheduleRes.data);
            } catch (error) {
                console.error('캘린더 로드 실패', error);
            }
        }
        
        // 통계용 병원 목록 업데이트
        function updateStatsHospitalList(schedules) {
            const hospitalSelect = document.getElementById('stats-hospital');
            const uniqueHospitals = [...new Set(schedules.map(s => JSON.stringify({ id: s.hospital_id, name: s.hospital_name })))].map(s => JSON.parse(s));
            
            // 기존 옵션 제거 (전체 제외)
            while (hospitalSelect.options.length > 1) {
                hospitalSelect.remove(1);
            }
            
            // 병원 옵션 추가
            uniqueHospitals.forEach(h => {
                const option = document.createElement('option');
                option.value = h.id;
                option.textContent = h.name;
                hospitalSelect.appendChild(option);
            });
        }
        
        // 병원별 통계 업데이트 (드롭다운에서 선택 시)
        async function updateStatsForHospital() {
            const year = document.getElementById('calendar-year').value;
            const month = document.getElementById('calendar-month').value;
            
            if (!year || !month) return;
            
            try {
                const scheduleRes = await axios.get(\`/api/schedules/\${year}/\${month}\`);
                updateTaskStats(scheduleRes.data);
            } catch (error) {
                console.error('통계 업데이트 실패', error);
            }
        }
        
        // 작업 통계 업데이트
        function updateTaskStats(schedules) {
            if (!schedules || schedules.length === 0) {
                document.getElementById('task-stats').classList.add('hidden');
                return;
            }
            
            // 선택된 병원 필터링
            const selectedHospital = document.getElementById('stats-hospital').value;
            const filteredSchedules = selectedHospital === 'all' 
                ? schedules 
                : schedules.filter(s => s.hospital_id == selectedHospital);
            
            if (filteredSchedules.length === 0) {
                document.getElementById('task-stats').classList.add('hidden');
                return;
            }
            
            // 작업 타입별 통계 계산
            const stats = {
                brand: { total: 0, completed: 0 },
                trend: { total: 0, completed: 0 },
                sanwi_nosul: { total: 0, completed: 0 },
                eonron_bodo: { total: 0, completed: 0 },
                jisikin: { total: 0, completed: 0 },
                cafe_posting: { total: 0, completed: 0 },
                report: { total: 0, completed: 0 }
            };
            
            filteredSchedules.forEach(s => {
                if (stats[s.task_type] !== undefined) {
                    stats[s.task_type].total++;
                    if (s.is_completed) {
                        stats[s.task_type].completed++;
                    }
                }
            });
            
            // 통계 표시 업데이트
            document.getElementById('stat-brand-total').textContent = stats.brand.total;
            document.getElementById('stat-brand-completed').textContent = stats.brand.completed;
            
            document.getElementById('stat-trend-total').textContent = stats.trend.total;
            document.getElementById('stat-trend-completed').textContent = stats.trend.completed;
            
            document.getElementById('stat-sanwi-total').textContent = stats.sanwi_nosul.total;
            document.getElementById('stat-sanwi-completed').textContent = stats.sanwi_nosul.completed;
            
            document.getElementById('stat-eonron-total').textContent = stats.eonron_bodo.total;
            document.getElementById('stat-eonron-completed').textContent = stats.eonron_bodo.completed;
            
            document.getElementById('stat-jisikin-total').textContent = stats.jisikin.total;
            document.getElementById('stat-jisikin-completed').textContent = stats.jisikin.completed;
            
            document.getElementById('stat-cafe-total').textContent = stats.cafe_posting.total;
            document.getElementById('stat-cafe-completed').textContent = stats.cafe_posting.completed;
            
            document.getElementById('stat-report-total').textContent = stats.report.total;
            document.getElementById('stat-report-completed').textContent = stats.report.completed;
            
            // 전체 진행률 계산
            const totalTasks = Object.values(stats).reduce((sum, s) => sum + s.total, 0);
            const completedTasks = Object.values(stats).reduce((sum, s) => sum + s.completed, 0);
            const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
            document.getElementById('stat-progress').textContent = progress;
            
            // 통계 표시
            document.getElementById('task-stats').classList.remove('hidden');
        }

        // 이벤트 클릭 핸들러 (완료 체크)
        async function handleEventClick(info) {
            const event = info.event;
            const scheduleId = event.extendedProps.scheduleId;
            
            if (!scheduleId) {
                // 연차/휴가는 완료 체크 불가
                return;
            }

            const currentCompleted = event.extendedProps.isCompleted;
            const newCompleted = currentCompleted ? 0 : 1;

            try {
                // DB 업데이트 API 호출
                await axios.put(\`/api/schedules/\${scheduleId}/complete\`, {
                    is_completed: newCompleted
                });

                // 캘린더 새로고침
                loadCalendar();
            } catch (error) {
                console.error('완료 상태 변경 실패', error);
                alert('❌ 완료 상태 변경에 실패했습니다.');
            }
        }

        // 이벤트 드래그 앤 드롭 핸들러
        async function handleEventDrop(info) {
            const event = info.event;
            const scheduleId = event.extendedProps.scheduleId;
            
            if (!scheduleId) {
                // 연차/휴가 이벤트는 이동 불가
                info.revert();
                return;
            }

            const oldDate = info.oldEvent.startStr;
            const newDate = event.startStr;

            if (!confirm(\`\${event.title}\n\n\${oldDate} → \${newDate}\n\n일정을 이동하시겠습니까?\`)) {
                info.revert();
                return;
            }

            try {
                // DB 업데이트 API 호출
                await axios.put(\`/api/schedules/\${scheduleId}\`, {
                    task_date: newDate
                });

                // 성공 메시지
                alert('✅ 일정이 이동되었습니다!');
                
                // 캘린더 새로고침
                loadCalendar();
            } catch (error) {
                console.error('일정 이동 실패', error);
                alert('❌ 일정 이동에 실패했습니다. 다시 시도해주세요.');
                info.revert();
            }
        }

        // 전체 스케줄 삭제
        async function deleteAllSchedules() {
            const year = document.getElementById('calendar-year').value;
            const month = document.getElementById('calendar-month').value;

            if (!year || !month) {
                alert('년월을 선택해주세요');
                return;
            }

            if (!confirm(\`\${year}년 \${month}월의 모든 스케줄을 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다!\`)) {
                return;
            }

            try {
                // 해당 월의 모든 스케줄 조회
                const res = await axios.get(\`/api/schedules/\${year}/\${month}\`);
                const schedules = res.data;
                
                if (schedules.length === 0) {
                    alert('삭제할 스케줄이 없습니다');
                    return;
                }

                // 병원별로 그룹화
                const hospitalIds = [...new Set(schedules.map(s => s.hospital_id))];
                
                // 각 병원의 스케줄 삭제
                for (const hospitalId of hospitalIds) {
                    await axios.delete(\`/api/schedules/\${year}/\${month}/\${hospitalId}\`);
                }

                alert(\`\${schedules.length}개의 스케줄이 삭제되었습니다\`);
                loadCalendar();
            } catch (error) {
                alert('스케줄 삭제 실패');
                console.error(error);
            }
        }

        // 년도/월 선택 초기화
        function initDateSelectors() {
            // 한국 시간 (KST, UTC+9) 기준
            const now = new Date();
            const kstOffset = 9 * 60; // 9시간을 분으로 변환
            const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
            const kstTime = new Date(utc + (kstOffset * 60000));
            
            const currentYear = kstTime.getFullYear();
            const currentMonth = kstTime.getMonth() + 1;

            // 작업량 입력 탭
            const taskYear = document.getElementById('task-year');
            const taskMonth = document.getElementById('task-month');

            for (let y = currentYear - 1; y <= currentYear + 2; y++) {
                taskYear.innerHTML += \`<option value="\${y}" \${y === currentYear ? 'selected' : ''}>\${y}년</option>\`;
            }

            for (let m = 1; m <= 12; m++) {
                taskMonth.innerHTML += \`<option value="\${m}" \${m === currentMonth ? 'selected' : ''}>\${m}월</option>\`;
            }

            // 연차/휴가 탭
            const vacYear = document.getElementById('vacation-year');
            const vacMonth = document.getElementById('vacation-month');

            for (let y = currentYear - 1; y <= currentYear + 2; y++) {
                vacYear.innerHTML += \`<option value="\${y}" \${y === currentYear ? 'selected' : ''}>\${y}년</option>\`;
            }

            for (let m = 1; m <= 12; m++) {
                vacMonth.innerHTML += \`<option value="\${m}" \${m === currentMonth ? 'selected' : ''}>\${m}월</option>\`;
            }

            // 캘린더 탭
            const calYear = document.getElementById('calendar-year');
            const calMonth = document.getElementById('calendar-month');

            for (let y = currentYear - 1; y <= currentYear + 2; y++) {
                calYear.innerHTML += \`<option value="\${y}" \${y === currentYear ? 'selected' : ''}>\${y}년</option>\`;
            }

            for (let m = 1; m <= 12; m++) {
                calMonth.innerHTML += \`<option value="\${m}" \${m === currentMonth ? 'selected' : ''}>\${m}월</option>\`;
            }
        }

        // 초기화
        document.addEventListener('DOMContentLoaded', () => {
            showTab('hospitals');
            loadHospitals();
            initDateSelectors();
        });
    </script>
</body>
</html>
  `)
})

export default app
