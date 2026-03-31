import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Bindings } from './types'

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
  const { name, base_due_day, sanwi_nosul_days, color } = await c.req.json()

  if (!name || !base_due_day) {
    return c.json({ error: '병원명과 기본 마감일을 입력해주세요' }, 400)
  }

  // sanwi_nosul_days를 JSON 문자열로 변환
  const sanwiDaysJson = sanwi_nosul_days ? JSON.stringify(sanwi_nosul_days) : null

  try {
    const result = await db.prepare(
      'INSERT INTO hospitals (name, base_due_day, sanwi_nosul_days, color) VALUES (?, ?, ?, ?)'
    ).bind(name, base_due_day, sanwiDaysJson, color || '#3b82f6').run()

    return c.json({ id: result.meta.last_row_id, name, base_due_day, sanwi_nosul_days: sanwiDaysJson, color })
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

// =========================
// 일정 유형 관리 API
// =========================

app.get('/api/task-types', async (c) => {
  const db = c.env.DB
  const result = await db.prepare('SELECT * FROM task_types ORDER BY name').all()
  return c.json(result.results)
})

app.post('/api/task-types', async (c) => {
  const db = c.env.DB
  const { name, duration, color } = await c.req.json()
  if (!name) return c.json({ error: '이름을 입력해주세요' }, 400)
  try {
    const result = await db.prepare('INSERT INTO task_types (name, duration, color) VALUES (?, ?, ?)')
      .bind(name, duration || 1, color || '#787FFF').run()
    return c.json({ id: result.meta.last_row_id, name, duration, color })
  } catch (e) {
    return c.json({ error: '이미 존재하는 유형입니다' }, 400)
  }
})

app.delete('/api/task-types/:id', async (c) => {
  const db = c.env.DB
  await db.prepare('DELETE FROM task_types WHERE id = ?').bind(c.req.param('id')).run()
  return c.json({ success: true })
})

// =========================
// 월별 작업량
// =========================

// 월별 작업량 저장/수정
app.post('/api/monthly-tasks', async (c) => {
  const db = c.env.DB
  const data = await c.req.json()
  const { hospital_id, year, month } = data

  // custom_tasks를 JSON 문자열로 저장
  const customTasksJson = JSON.stringify(data.custom_tasks || [])

  // 기존 데이터 확인
  const existing = await db.prepare(`
    SELECT id FROM monthly_tasks WHERE hospital_id = ? AND year = ? AND month = ?
  `).bind(hospital_id, year, month).first()

  if (existing) {
    await db.prepare(`
      UPDATE monthly_tasks SET custom_tasks = ? WHERE hospital_id = ? AND year = ? AND month = ?
    `).bind(customTasksJson, hospital_id, year, month).run()
  } else {
    await db.prepare(`
      INSERT INTO monthly_tasks (hospital_id, year, month, custom_tasks) VALUES (?, ?, ?, ?)
    `).bind(hospital_id, year, month, customTasksJson).run()
  }

  return c.json({ success: true })
})

// =========================
// 스케줄 생성 API
// =========================

// 스케줄 조회
app.get('/api/schedules/:year/:month', async (c) => {
  const db = c.env.DB
  const year = parseInt(c.req.param('year'))
  const month = parseInt(c.req.param('month'))

  const result = await db.prepare(`
    SELECT s.*, h.name as hospital_name, h.base_due_day, h.color as hospital_color
    FROM schedules s
    JOIN hospitals h ON s.hospital_id = h.id
    WHERE s.year = ? AND s.month = ?
    ORDER BY s.task_date, s.order_index, s.start_time
  `).bind(year, month).all()

  return c.json(result.results)
})

// 일정 수동 추가 (보고서, 카페 등)
app.post('/api/schedules/add-item', async (c) => {
  const db = c.env.DB
  const { hospital_id, year, month, task_date, task_type, task_name, start_time, end_time, duration_hours, is_report } = await c.req.json()

  let finalHospitalId = hospital_id
  let hospitalName = ''

  if (!hospital_id) {
    // 병원 없이 추가 — "기타" 병원 자동 사용
    let etcHospital = await db.prepare('SELECT id, name FROM hospitals WHERE name = ?')
      .bind('기타').first()

    if (!etcHospital) {
      await db.prepare('INSERT INTO hospitals (name, base_due_day) VALUES (?, ?)')
        .bind('기타', 1).run()
      etcHospital = await db.prepare('SELECT id, name FROM hospitals WHERE name = ?')
        .bind('기타').first()
    }

    finalHospitalId = etcHospital!.id
    hospitalName = task_name || task_type
  } else {
    const hospital = await db.prepare('SELECT name FROM hospitals WHERE id = ?')
      .bind(hospital_id).first()

    if (!hospital) {
      return c.json({ error: 'Hospital not found' }, 404)
    }
    hospitalName = hospital.name as string
  }

  // 해당 날짜의 마지막 order_index 가져오기
  const lastOrder = await db.prepare(
    'SELECT MAX(order_index) as max_order FROM schedules WHERE task_date = ?'
  ).bind(task_date).first()

  const orderIndex = (lastOrder?.max_order ?? -1) + 1

  // 일정 추가
  const result = await db.prepare(`
    INSERT INTO schedules (
      hospital_id, year, month, task_date, task_type, task_name,
      start_time, end_time, duration_hours, is_report, order_index
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    finalHospitalId, year, month, task_date, task_type, task_name,
    start_time, end_time, duration_hours, is_report ? 1 : 0, orderIndex
  ).run()

  return c.json({
    success: true,
    id: result.meta.last_row_id,
    hospital_name: hospitalName || task_name
  })
})

// 보고서 수동 추가 (하위 호환성)
app.post('/api/schedules/add-report', async (c) => {
  const db = c.env.DB
  const { hospital_id, year, month, task_date, start_time, end_time } = await c.req.json()

  // 병원 정보 가져오기
  const hospital = await db.prepare('SELECT name FROM hospitals WHERE id = ?')
    .bind(hospital_id).first()

  if (!hospital) {
    return c.json({ error: 'Hospital not found' }, 404)
  }

  // 해당 날짜의 마지막 order_index 가져오기
  const lastOrder = await db.prepare(
    'SELECT MAX(order_index) as max_order FROM schedules WHERE task_date = ?'
  ).bind(task_date).first()

  const orderIndex = (lastOrder?.max_order ?? -1) + 1

  // 보고서 추가
  const result = await db.prepare(`
    INSERT INTO schedules (
      hospital_id, year, month, task_date, task_type, task_name,
      start_time, end_time, duration_hours, is_report, order_index
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    hospital_id, year, month, task_date, 'report', '보고서',
    start_time, end_time, 2, 1, orderIndex
  ).run()

  return c.json({
    success: true,
    id: result.meta.last_row_id,
    hospital_name: hospital.name
  })
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

// 스케줄 순서 변경 (같은 날짜 내에서) - 반드시 :id 라우트보다 먼저 와야 함!
app.put('/api/schedules/reorder', async (c) => {
  const db = c.env.DB

  // DB 연결 확인
  if (!db) {
    return c.json({ error: 'DB 연결 없음', env: Object.keys(c.env || {}) }, 500)
  }

  try {
    const body = await c.req.json()
    const updates = body?.updates

    if (!updates || !Array.isArray(updates)) {
      return c.json({ error: 'updates 배열이 필요합니다', received: body }, 400)
    }

    for (const u of updates) {
      if (u.id != null && u.order_index != null) {
        await db.prepare('UPDATE schedules SET order_index = ? WHERE id = ?')
          .bind(Number(u.order_index), Number(u.id)).run()
      }
    }

    return c.json({ success: true, updated: updates.length })
  } catch (e: any) {
    return c.json({ error: e?.message || 'Unknown error', stack: e?.stack }, 500)
  }
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

// 개별 스케줄 삭제
app.delete('/api/schedules/item/:id', async (c) => {
  const db = c.env.DB
  const scheduleId = parseInt(c.req.param('id'))

  if (!scheduleId || isNaN(scheduleId)) {
    return c.json({ error: 'Invalid schedule ID' }, 400)
  }

  await db.prepare('DELETE FROM schedules WHERE id = ?').bind(scheduleId).run()

  return c.json({ success: true })
})

// 스케줄 메모 업데이트
app.put('/api/schedules/memo/:id', async (c) => {
  const db = c.env.DB
  const scheduleId = parseInt(c.req.param('id'))
  const { memo } = await c.req.json()

  if (!scheduleId || isNaN(scheduleId)) {
    return c.json({ error: 'Invalid schedule ID' }, 400)
  }

  await db.prepare('UPDATE schedules SET memo = ? WHERE id = ?')
    .bind(memo || '', scheduleId).run()

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
    

    <link href="/static/styles.css" rel="stylesheet">
    <script src="https://cdn.tailwindcss.com"></script>
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
      
      /* 동그라미 점 제거 */
      .fc-daygrid-event-dot {
        display: none !important;
      }
      
      /* 이벤트를 박스 형태로 표시 - 예쁜 정렬 */
      .fc-daygrid-event {
        padding: 4px 6px !important;
        margin: 2px 0 !important;
        border-radius: 4px !important;
        min-height: 22px !important;
        height: auto !important;
      }
      
      /* 이벤트 제목 텍스트 - 예쁜 줄바꿈 */
      .fc-event-title {
        white-space: normal !important;
        overflow: visible !important;
        text-overflow: clip !important;
        word-wrap: break-word !important;
        font-size: 12px !important;
        line-height: 1.4 !important;
        font-weight: 500 !important;
        display: block !important;
      }
      
      /* 이벤트 시간 표시 */
      .fc-event-time {
        font-size: 10px !important;
        opacity: 0.9 !important;
        font-weight: normal !important;
      }
      
      /* 일찍 출근 강조 스타일 */
      .early-start-event {
        font-weight: 600 !important;
        border: 2px solid #7e22ce !important;
        box-shadow: 0 2px 4px rgba(126, 34, 206, 0.2) !important;
      }
      
      .early-start-event .fc-event-title {
        font-weight: 600 !important;
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
                    <i class="fas fa-tags mr-2"></i>일정 유형
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
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <input type="text" id="hospital-name" placeholder="병원명" class="border-2 border-purple-200 rounded-lg px-4 py-3 focus:border-purple-400 focus:outline-none">
                    <input type="number" id="hospital-due-day" placeholder="기본 마감일 (1-31)" min="1" max="31" class="border-2 border-purple-200 rounded-lg px-4 py-3 focus:border-purple-400 focus:outline-none">
                    <div class="flex gap-2">
                        <input type="color" id="hospital-color" value="#3b82f6" class="border-2 border-purple-200 rounded-lg px-2 py-1 h-12 w-20 cursor-pointer">
                        <div class="flex-1 flex items-center px-4 border-2 border-purple-200 rounded-lg bg-gray-50">
                            <i class="fas fa-palette mr-2 text-gray-500"></i>
                            <span class="text-sm text-gray-600">병원 색상</span>
                        </div>
                    </div>
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
                    <i class="fas fa-tags mr-2"></i>일정 유형 관리
                </h2>
                <p class="text-sm text-gray-600 mb-6">여기서 추가한 유형이 캘린더에서 일정 추가 시 드롭다운에 표시됩니다.</p>

                <div class="flex gap-3 mb-6 items-end">
                    <div class="flex-1">
                        <label class="block text-xs font-semibold mb-1 text-gray-600">유형 이름</label>
                        <input type="text" id="new-type-name" placeholder="예: 브랜드" class="w-full border-2 border-purple-200 rounded-lg px-4 py-2.5 focus:border-purple-400 focus:outline-none">
                    </div>
                    <div class="w-28">
                        <label class="block text-xs font-semibold mb-1 text-gray-600">소요 시간</label>
                        <input type="number" id="new-type-duration" value="1" min="0.5" step="0.5" class="w-full border-2 border-purple-200 rounded-lg px-4 py-2.5 focus:border-purple-400 focus:outline-none">
                    </div>
                    <div class="w-16">
                        <label class="block text-xs font-semibold mb-1 text-gray-600">색상</label>
                        <input type="color" id="new-type-color" value="#787FFF" class="w-full h-10 border-2 border-purple-200 rounded-lg cursor-pointer">
                    </div>
                    <button onclick="addTaskType()" class="btn-primary text-white rounded-lg px-5 py-2.5 font-semibold shadow-md hover:shadow-lg transition-all whitespace-nowrap">
                        <i class="fas fa-plus mr-1"></i>추가
                    </button>
                </div>

                <div id="task-types-list" class="space-y-2"></div>
            </div>
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
                <div id="stats-grid" class="grid grid-cols-2 md:grid-cols-4 gap-4">
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

    <!-- 일정 추가 모달 -->
    <div id="add-report-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-xl shadow-2xl p-6 w-96 max-w-full mx-4">
            <h3 class="text-xl font-bold text-gray-800 mb-4">
                <i class="fas fa-calendar-plus text-purple-500 mr-2"></i>일정 추가
            </h3>
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">날짜</label>
                <input type="text" id="report-date" class="w-full border-2 border-gray-200 rounded-lg px-4 py-2 bg-gray-100" readonly>
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">일정 유형</label>
                <select id="report-type" class="w-full border-2 border-purple-200 rounded-lg px-4 py-2 focus:border-purple-400 focus:outline-none" onchange="onTaskTypeChange()">
                    <option value="__custom__">✏️ 직접 입력</option>
                    <option value="report">📄 보고서 (1시간)</option>
                    <option value="meeting">🤝 회의 (1시간)</option>
                </select>
            </div>
            <div id="custom-task-inputs" class="mb-4">
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-xs font-medium text-gray-600 mb-1">작업 이름</label>
                        <input type="text" id="custom-task-name-input" placeholder="예: 브랜드" class="w-full border-2 border-purple-200 rounded-lg px-3 py-2 focus:border-purple-400 focus:outline-none text-sm">
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-gray-600 mb-1">소요 시간</label>
                        <input type="number" id="custom-task-duration-input" value="1" min="0.5" step="0.5" class="w-full border-2 border-purple-200 rounded-lg px-3 py-2 focus:border-purple-400 focus:outline-none text-sm">
                    </div>
                </div>
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">병원 선택 (선택사항)</label>
                <select id="report-hospital" class="w-full border-2 border-purple-200 rounded-lg px-4 py-2 focus:border-purple-400 focus:outline-none">
                    <option value="">병원을 선택하세요</option>
                </select>
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">시작 시간</label>
                <select id="report-start-time" class="w-full border-2 border-purple-200 rounded-lg px-4 py-2 focus:border-purple-400 focus:outline-none">
                    <option value="09:00">09:00</option>
                    <option value="10:00" selected>10:00</option>
                    <option value="11:00">11:00</option>
                    <option value="12:00">12:00</option>
                    <option value="13:00">13:00</option>
                    <option value="14:00">14:00</option>
                    <option value="15:00">15:00</option>
                    <option value="16:00">16:00</option>
                    <option value="17:00">17:00</option>
                </select>
            </div>
            <div class="flex justify-end gap-2">
                <button onclick="closeReportModal()" class="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium">
                    취소
                </button>
                <button onclick="addScheduleItem()" class="bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg px-6 py-2 font-semibold shadow-md hover:shadow-lg transition-all">
                    <i class="fas fa-plus mr-2"></i>추가
                </button>
            </div>
        </div>
    </div>

    <!-- 메모 모달 -->
    <div id="memo-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-xl shadow-2xl p-6 w-96 max-w-full mx-4">
            <h3 class="text-xl font-bold text-gray-800 mb-4">
                <i class="fas fa-sticky-note text-blue-500 mr-2"></i>메모
            </h3>
            <input type="hidden" id="memo-schedule-id">
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1" id="memo-title-label">일정</label>
            </div>
            <div class="mb-4">
                <textarea id="memo-content" rows="4" class="w-full border-2 border-blue-200 rounded-lg px-4 py-2 focus:border-blue-400 focus:outline-none" placeholder="메모를 입력하세요..."></textarea>
            </div>
            <div class="flex justify-end gap-2">
                <button onclick="closeMemoModal()" class="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium">
                    취소
                </button>
                <button onclick="saveMemo()" class="bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg px-6 py-2 font-semibold shadow-md hover:shadow-lg transition-all">
                    <i class="fas fa-save mr-2"></i>저장
                </button>
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
        window.showTab = function(tab) {
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

                // 회의/기타 병원은 목록에서 숨김
                const visibleHospitals = hospitals.filter(h => h.name !== '회의/기타' && h.name !== '기타');

                const list = document.getElementById('hospitals-list');
                list.innerHTML = visibleHospitals.map(h => {
                    // 상위노출 날짜 HTML 생성
                    let sanwiHtml = '';
                    if (h.sanwi_nosul_days) {
                        const days = JSON.parse(h.sanwi_nosul_days)
                            .map(d => String(d).padStart(2, '0'))
                            .join(', ');
                        sanwiHtml = \`
                            <div class="flex items-center">
                                <i class="fas fa-star text-yellow-500 mr-2"></i>
                                <span class="text-yellow-600 font-semibold">상위노출: \${days}일</span>
                            </div>
                        \`;
                    }
                    
                    return \`
                        <div class="flex justify-between items-center p-5 border-2 border-purple-100 rounded-xl hover:border-purple-300 transition-all bg-gradient-to-r from-purple-50 to-white shadow-sm hover:shadow-md">
                            <div class="flex items-center space-x-4">
                                <div class="text-white rounded-lg p-3" style="background: linear-gradient(135deg, \${h.color || '#3b82f6'} 0%, \${h.color || '#3b82f6'}dd 100%);">
                                    <i class="fas fa-hospital text-2xl"></i>
                                </div>
                                <div>
                                    <span class="font-bold text-lg text-gray-800">\${h.name}</span>
                                    <div class="flex items-center mt-1 space-x-4">
                                        <div class="flex items-center">
                                            <i class="fas fa-calendar-day text-purple-500 mr-2"></i>
                                            <span class="text-purple-600 font-semibold">마감일: 매월 \${String(h.base_due_day).padStart(2, '0')}일</span>
                                        </div>
                                        \${sanwiHtml}
                                        <div class="flex items-center">
                                            <i class="fas fa-palette mr-2" style="color: \${h.color || '#3b82f6'}"></i>
                                            <span class="text-sm text-gray-600 font-mono">\${h.color || '#3b82f6'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <button onclick="deleteHospital(\${h.id})" class="text-red-500 hover:text-red-700 hover:bg-red-50 p-3 rounded-lg transition-all">
                                <i class="fas fa-trash text-xl"></i>
                            </button>
                        </div>
                    \`;
                }).join('');
            } catch (error) {
                alert('병원 목록 로드 실패');
            }
        }

        // 병원 추가
        window.addHospital = async function() {
            const name = document.getElementById('hospital-name').value;
            const baseDueDay = document.getElementById('hospital-due-day').value;
            const color = document.getElementById('hospital-color').value;

            if (!name || !baseDueDay) {
                alert('병원명과 기본 마감일을 입력해주세요');
                return;
            }

            try {
                await axios.post('/api/hospitals', {
                    name,
                    base_due_day: parseInt(baseDueDay),
                    color: color || '#3b82f6'
                });

                document.getElementById('hospital-name').value = '';
                document.getElementById('hospital-due-day').value = '';
                document.getElementById('hospital-color').value = '#3b82f6';

                loadHospitals();
                alert('병원이 추가되었습니다!');
            } catch (error) {
                alert('병원 추가 실패: ' + (error.response?.data?.error || '알 수 없는 오류'));
            }
        }

        // 병원 삭제
        window.deleteHospital = async function(id) {
            if (!confirm('정말 삭제하시겠습니까?')) return;

            try {
                await axios.delete(\`/api/hospitals/\${id}\`);
                loadHospitals();
                alert('병원이 삭제되었습니다');
            } catch (error) {
                alert('병원 삭제 실패');
            }
        }

        // 커스텀 작업 행 추가
        // 일정 유형 추가
        window.addTaskType = async function() {
            const name = document.getElementById('new-type-name').value.trim();
            const duration = parseFloat(document.getElementById('new-type-duration').value) || 1;
            const color = document.getElementById('new-type-color').value;

            if (!name) { alert('유형 이름을 입력해주세요'); return; }

            try {
                await axios.post('/api/task-types', { name, duration, color });
                document.getElementById('new-type-name').value = '';
                document.getElementById('new-type-duration').value = '1';
                loadTaskTypes();
            } catch (error) {
                alert('추가 실패: ' + (error.response?.data?.error || error.message));
            }
        }

        // 일정 유형 삭제
        window.deleteTaskType = async function(id) {
            if (!confirm('이 유형을 삭제하시겠습니까?')) return;
            try {
                await axios.delete(\`/api/task-types/\${id}\`);
                loadTaskTypes();
            } catch (error) {
                alert('삭제 실패');
            }
        }

        // 일정 유형 목록 로드
        async function loadTaskTypes() {
            try {
                const res = await axios.get('/api/task-types');
                const list = document.getElementById('task-types-list');

                if (res.data.length === 0) {
                    list.innerHTML = '<p class="text-gray-400 text-center py-6">등록된 일정 유형이 없습니다. 위에서 추가해주세요.</p>';
                    return;
                }

                list.innerHTML = res.data.map(t => \`
                    <div class="flex items-center justify-between p-3 rounded-lg border-2 border-gray-100 hover:border-purple-200 transition-all">
                        <div class="flex items-center gap-3">
                            <div class="w-4 h-4 rounded-full" style="background-color: \${t.color || '#787FFF'}"></div>
                            <span class="font-semibold text-gray-800">\${t.name}</span>
                            <span class="text-sm text-gray-500">\${t.duration}시간</span>
                        </div>
                        <button onclick="deleteTaskType(\${t.id})" class="text-red-400 hover:text-red-600 p-1">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                \`).join('');
            } catch (error) {
                console.error('일정 유형 로드 실패', error);
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
        window.addVacation = async function() {
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
        window.deleteVacation = async function(id) {
            if (!confirm('정말 삭제하시겠습니까?')) return;

            try {
                await axios.delete(\`/api/vacations/\${id}\`);
                loadVacations();
                alert('연차/휴가가 삭제되었습니다');
            } catch (error) {
                alert('연차/휴가 삭제 실패');
            }
        }

        // 캘린더 모달의 일정 유형 드롭다운 업데이트 (task_types 테이블 기반)
        async function updateModalTaskTypes() {
            const select = document.getElementById('report-type');
            if (!select) return;

            select.innerHTML = \`
                <option value="__custom__">✏️ 직접 입력</option>
                <option value="report" data-duration="1">📄 보고서 (1시간)</option>
                <option value="meeting" data-duration="1">🤝 회의 (1시간)</option>
            \`;

            try {
                const res = await axios.get('/api/task-types');
                for (const t of res.data) {
                    const opt = document.createElement('option');
                    opt.value = 'custom_' + t.name;
                    opt.dataset.duration = t.duration;
                    opt.textContent = t.name + ' (' + t.duration + '시간)';
                    // 직접 입력 다음에 삽입
                    select.insertBefore(opt, select.options[1]);
                }
                select.selectedIndex = 0;
            } catch(e) {
                console.log('일정 유형 로드 실패', e);
            }

            // 직접 입력 토글
            onTaskTypeChange();
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
                dateClick: handleDateClick, // 날짜 클릭 핸들러 (보고서 추가)
                eventDisplay: 'block', // 블록 형태로 표시 (동그라미 제거)
                displayEventTime: false, // 시간 표시 제거
                eventOrder: function(a, b) {
                    // order_index로 먼저 정렬, 같으면 시작 시간으로 정렬
                    const aOrder = a.extendedProps?.order_index ?? 999;
                    const bOrder = b.extendedProps?.order_index ?? 999;
                    if (aOrder !== bOrder) return aOrder - bOrder;
                    // start가 Date인지 확인
                    const aStart = a.start && typeof a.start.getTime === 'function' ? a.start.getTime() :
                                   a.start ? new Date(a.start).getTime() : 0;
                    const bStart = b.start && typeof b.start.getTime === 'function' ? b.start.getTime() :
                                   b.start ? new Date(b.start).getTime() : 0;
                    return aStart - bStart;
                },
                eventOrderStrict: true, // 엄격한 순서 적용
                eventDidMount: function(info) {
                    // 일찍 출근 이벤트가 있는 날짜의 배경색 변경
                    if (info.event.extendedProps.taskType === 'early_start') {
                        const dateStr = info.event.startStr;
                        const dayCell = document.querySelector('[data-date="' + dateStr + '"]');
                        if (dayCell) {
                            dayCell.style.backgroundColor = '#787FFF';
                            dayCell.style.fontWeight = 'bold';
                        }
                    }
                    
                    // 우클릭 메뉴 추가
                    info.el.addEventListener('contextmenu', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                        showReorderMenu(e, info.event);
                        return false;
                    }, true); // 캡처 단계에서 처리

                    // 롱프레스 삭제 기능 추가
                    let longPressTimer = null;
                    let isLongPress = false;

                    const startLongPress = function(e) {
                        console.log('롱프레스 시작:', info.event.title);
                        isLongPress = false;
                        longPressTimer = setTimeout(function() {
                            console.log('롱프레스 완료! 삭제 실행');
                            isLongPress = true;
                            const scheduleId = info.event.extendedProps.scheduleId;
                            const title = info.event.title;
                            console.log('scheduleId:', scheduleId, 'title:', title);
                            if (scheduleId) {
                                deleteScheduleItem(scheduleId, title);
                            } else {
                                console.log('scheduleId 없음!');
                            }
                        }, 600); // 600ms 롱프레스
                    };

                    const cancelLongPress = function(e) {
                        if (longPressTimer) {
                            console.log('롱프레스 취소됨');
                            clearTimeout(longPressTimer);
                            longPressTimer = null;
                        }
                    };

                    // 마우스 이벤트
                    info.el.addEventListener('mousedown', startLongPress);
                    info.el.addEventListener('mouseup', cancelLongPress);
                    info.el.addEventListener('mouseleave', cancelLongPress);

                    // 터치 이벤트 (모바일)
                    info.el.addEventListener('touchstart', startLongPress);
                    info.el.addEventListener('touchend', cancelLongPress);
                    info.el.addEventListener('touchcancel', cancelLongPress);
                },
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
                    // 병원 색상 사용 (없으면 기본 파란색)
                    const hospitalColor = s.hospital_color || '#3b82f6';
                    
                    // 색상 설정: 일찍 출근 > 보고서 > 일반 작업
                    let color, textColor;
                    if (s.task_type === 'early_start') {
                        // 일찍 출근: 보라색
                        color = '#9333ea'; // 진한 보라색
                        textColor = '#ffffff';
                    } else if (s.is_report) {
                        // 보고서: 파스텔 핑크
                        color = '#fda4af';
                        textColor = '#be123c';
                    } else {
                        // 일반 작업: 병원 색상
                        color = hospitalColor;
                        textColor = '#ffffff';
                    }
                    
                    // 완료 상태면 취소선 추가
                    const titlePrefix = s.is_completed ? '✅ ' : '';
                    
                    // 일찍 출근 이모지 추가
                    const earlyIcon = s.task_type === 'early_start' ? '⏰ ' : '';
                    
                    // 일찍 출근 클래스 추가
                    const classNames = s.is_completed ? ['completed-task'] : [];
                    if (s.task_type === 'early_start') {
                        classNames.push('early-start-event');
                    }
                    
                    const memoIcon = s.memo ? '📝 ' : '';
                    // 병원명이 있으면 "병원 - 작업", 없으면 작업만 표시
                    const displayTitle = s.hospital_name
                        ? \`\${s.hospital_name} - \${s.task_name}\`
                        : s.task_name;
                    return {
                        id: s.id, // 스케줄 ID 추가 (드래그 앤 드롭에 필요)
                        title: \`\${earlyIcon}\${memoIcon}\${titlePrefix}\${displayTitle}\`,
                        start: \`\${s.task_date}T\${s.start_time}\`, // 시간 포함하여 정렬
                        order_index: s.order_index || 0, // 순서 인덱스 추가
                        color: color,
                        textColor: textColor,
                        borderColor: textColor,
                        editable: true, // 이 이벤트는 이동 가능
                        classNames: classNames, // CSS 클래스 추가
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
                            order_index: s.order_index || 0, // 순서 인덱스
                            memo: s.memo || '' // 메모
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

                // 일별 총 근무시간 표시
                displayDailyTotalHours(scheduleRes.data);
            } catch (error) {
                console.error('캘린더 로드 실패', error);
            }
        }

        // 일별 총 근무시간 표시 함수
        function displayDailyTotalHours(schedules) {
            // 약간의 딜레이 후 실행 (캘린더 렌더링 완료 대기)
            setTimeout(() => {
                // 기존 표시 제거
                document.querySelectorAll('.daily-total-hours').forEach(el => el.remove());

                // 일별 시간 합계 계산
                const dailyHours = {};
                for (const s of schedules) {
                    if (!dailyHours[s.task_date]) {
                        dailyHours[s.task_date] = 0;
                    }
                    dailyHours[s.task_date] += s.duration_hours || 0;
                }

                // 캘린더 셀에 시간 표시
                for (const [dateStr, hours] of Object.entries(dailyHours)) {
                    // FullCalendar는 td.fc-daygrid-day에 data-date 속성을 가짐
                    const dayCell = document.querySelector('td.fc-daygrid-day[data-date="' + dateStr + '"]');
                    if (dayCell) {
                        const hoursLabel = document.createElement('div');
                        hoursLabel.className = 'daily-total-hours';
                        hoursLabel.style.cssText = 'position: absolute; bottom: 2px; right: 4px; font-size: 11px; font-weight: bold; color: #6b7280; background: rgba(255,255,255,0.9); padding: 2px 6px; border-radius: 4px; z-index: 10;';
                        hoursLabel.textContent = hours.toFixed(1) + 'h';
                        dayCell.style.position = 'relative';
                        dayCell.appendChild(hoursLabel);
                    }
                }
            }, 100);
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
        
        // 작업 통계 업데이트 (동적)
        function updateTaskStats(schedules) {
            const statsGrid = document.getElementById('stats-grid');
            if (!schedules || schedules.length === 0) {
                document.getElementById('task-stats').classList.add('hidden');
                return;
            }

            const selectedHospital = document.getElementById('stats-hospital').value;
            const filteredSchedules = selectedHospital === 'all'
                ? schedules
                : schedules.filter(s => s.hospital_id == selectedHospital);

            if (filteredSchedules.length === 0) {
                document.getElementById('task-stats').classList.add('hidden');
                return;
            }

            // 작업 타입별 통계 (동적 수집)
            const stats = {};
            filteredSchedules.forEach(s => {
                const type = s.task_type || 'unknown';
                const label = s.task_name || type;
                if (!stats[type]) stats[type] = { label: label, total: 0, completed: 0 };
                stats[type].total++;
                if (s.is_completed) stats[type].completed++;
            });

            // 전체 진행률
            const totalTasks = Object.values(stats).reduce((sum, s) => sum + s.total, 0);
            const completedTasks = Object.values(stats).reduce((sum, s) => sum + s.completed, 0);
            const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

            const colors = ['blue', 'green', 'purple', 'orange', 'pink', 'indigo', 'red', 'teal', 'cyan', 'amber'];
            let html = '';
            let colorIdx = 0;
            for (const [type, s] of Object.entries(stats)) {
                const c = colors[colorIdx % colors.length];
                html += \`
                    <div class="bg-\${c}-50 border-2 border-\${c}-200 rounded-lg p-4 text-center">
                        <div class="text-sm text-gray-600 mb-1">\${s.label}</div>
                        <div class="text-2xl font-bold text-\${c}-600">\${s.completed} / \${s.total}</div>
                    </div>
                \`;
                colorIdx++;
            }
            // 전체 진행률
            html += \`
                <div class="bg-gray-50 border-2 border-gray-200 rounded-lg p-4 text-center">
                    <div class="text-sm text-gray-600 mb-1">전체 진행률</div>
                    <div class="text-2xl font-bold text-gray-700">\${progress}%</div>
                </div>
            \`;

            statsGrid.innerHTML = html;
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

        // 날짜 클릭 핸들러 (보고서 추가 모달)
        function handleDateClick(info) {
            const dateStr = info.dateStr;
            document.getElementById('report-date').value = dateStr;

            // 병원 목록 채우기 (기타 제외)
            const hospitalSelect = document.getElementById('report-hospital');
            hospitalSelect.innerHTML = '<option value="">병원 선택 안함</option>' +
                hospitals.filter(h => h.name !== '회의/기타' && h.name !== '기타').map(h => \`<option value="\${h.id}">\${h.name}</option>\`).join('');

            // 커스텀 작업 유형 로드
            updateModalTaskTypes();

            // 모달 열기
            document.getElementById('add-report-modal').classList.remove('hidden');
        }

        // 보고서 모달 닫기
        window.closeReportModal = function() {
            document.getElementById('add-report-modal').classList.add('hidden');
        }

        // 기본 일정 유형 설정
        const taskTypeConfig = {
            report: { label: '보고서', duration: 1, isReport: true },
            meeting: { label: '회의', duration: 1, isReport: false }
        };

        // 선택된 일정 유형의 config 가져오기 (커스텀 타입 포함)
        function getTaskConfig(taskType) {
            if (taskTypeConfig[taskType]) return taskTypeConfig[taskType];

            // 커스텀 타입: "custom_이름" 형식
            if (taskType.startsWith('custom_')) {
                const name = taskType.substring(7);
                const select = document.getElementById('report-type');
                const option = select.querySelector(\`option[value="\${taskType}"]\`);
                const duration = option ? parseFloat(option.dataset.duration) || 1 : 1;
                return { label: name, duration: duration, isReport: false };
            }
            return null;
        }

        // 일정 유형 변경 시 - 직접 입력 토글
        window.onTaskTypeChange = function() {
            const taskType = document.getElementById('report-type').value;
            const customInputs = document.getElementById('custom-task-inputs');
            customInputs.style.display = taskType === '__custom__' ? 'block' : 'none';
        }

        // 일정 추가
        window.addScheduleItem = async function() {
            const dateStr = document.getElementById('report-date').value;
            const hospitalId = document.getElementById('report-hospital').value;
            const startTime = document.getElementById('report-start-time').value;
            const taskType = document.getElementById('report-type').value;

            let taskName, duration, isReport, actualType;

            if (taskType === '__custom__') {
                // 직접 입력
                taskName = document.getElementById('custom-task-name-input').value.trim();
                duration = parseFloat(document.getElementById('custom-task-duration-input').value) || 1;
                if (!taskName) {
                    alert('작업 이름을 입력해주세요');
                    return;
                }
                isReport = false;
                actualType = taskName;
            } else {
                const config = getTaskConfig(taskType);
                if (!config) {
                    alert('유효하지 않은 일정 유형입니다');
                    return;
                }
                taskName = config.label;
                duration = config.duration;
                isReport = config.isReport;
                actualType = taskType.startsWith('custom_') ? taskType.substring(7) : taskType;
            }

            const dateParts = dateStr.split('-');
            const year = parseInt(dateParts[0]);
            const month = parseInt(dateParts[1]);

            const startHour = parseInt(startTime.split(':')[0]);
            const endTotalMin = startHour * 60 + duration * 60;
            const endHour = Math.floor(endTotalMin / 60);
            const endMin = Math.floor(endTotalMin % 60);
            const endTime = String(endHour).padStart(2, '0') + ':' + String(endMin).padStart(2, '0');

            try {
                await axios.post('/api/schedules/add-item', {
                    hospital_id: hospitalId ? parseInt(hospitalId) : null,
                    year: year,
                    month: month,
                    task_date: dateStr,
                    task_type: actualType,
                    task_name: taskName,
                    start_time: startTime,
                    end_time: endTime,
                    duration_hours: duration,
                    is_report: isReport
                });

                alert(taskName + ' 추가 완료!');
                closeReportModal();
                loadCalendar();
            } catch (error) {
                console.error('일정 추가 실패:', error);
                alert('일정 추가 실패: ' + (error.response?.data?.error || error.message));
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

            // 날짜만 추출 (시간 제거)
            const oldDate = info.oldEvent.startStr.split('T')[0];
            const newDate = event.startStr.split('T')[0];

            // 같은 날짜 내에서 순서 변경인지, 다른 날짜로 이동인지 확인
            const isSameDay = oldDate === newDate;
            
            let confirmMsg = '';
            if (isSameDay) {
                confirmMsg = event.title + '\\n\\n같은 날짜 내에서 순서를 변경하시겠습니까?';
            } else {
                confirmMsg = event.title + '\\n\\n' + oldDate + ' → ' + newDate + '\\n\\n일정을 이동하시겠습니까?';
            }

            if (!confirm(confirmMsg)) {
                info.revert();
                return;
            }

            try {
                if (isSameDay) {
                    // 같은 날짜 내에서 순서 변경
                    // 해당 날짜의 모든 이벤트를 가져와서 새로운 순서 계산
                    const dayEvents = calendar.getEvents().filter(e => {
                        return e.startStr.split('T')[0] === newDate && e.extendedProps.scheduleId;
                    });
                    
                    // order_index를 재계산하여 업데이트
                    const updates = dayEvents.map((e, index) => ({
                        id: e.extendedProps.scheduleId,
                        order_index: index
                    }));
                    
                    await axios.put('/api/schedules/reorder', { updates });
                } else {
                    // 다른 날짜로 이동
                    await axios.put('/api/schedules/' + scheduleId, {
                        task_date: newDate
                    });
                }

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

        // 순서 변경 메뉴 표시
        function showReorderMenu(e, event) {
            const scheduleId = parseInt(event.id);
            if (!scheduleId || isNaN(scheduleId)) return; // 연차/휴가는 순서 변경 불가
            
            const menu = document.createElement('div');
            menu.style.position = 'fixed';
            menu.style.left = e.clientX + 'px';
            menu.style.top = e.clientY + 'px';
            menu.style.backgroundColor = 'white';
            menu.style.border = '1px solid #ccc';
            menu.style.borderRadius = '4px';
            menu.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
            menu.style.zIndex = '10000';
            menu.style.padding = '4px 0';
            
            // 위로 이동 버튼
            const moveUpBtn = document.createElement('div');
            moveUpBtn.textContent = '↑ 위로 이동';
            moveUpBtn.style.padding = '8px 16px';
            moveUpBtn.style.cursor = 'pointer';
            moveUpBtn.style.fontSize = '14px';
            moveUpBtn.onmouseover = () => moveUpBtn.style.backgroundColor = '#f0f0f0';
            moveUpBtn.onmouseout = () => moveUpBtn.style.backgroundColor = 'white';
            moveUpBtn.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (document.body.contains(menu)) {
                    document.body.removeChild(menu);
                }
                await moveEvent(event, -1);
            };
            menu.appendChild(moveUpBtn);
            
            // 아래로 이동 버튼
            const moveDownBtn = document.createElement('div');
            moveDownBtn.textContent = '↓ 아래로 이동';
            moveDownBtn.style.padding = '8px 16px';
            moveDownBtn.style.cursor = 'pointer';
            moveDownBtn.style.fontSize = '14px';
            moveDownBtn.onmouseover = () => moveDownBtn.style.backgroundColor = '#f0f0f0';
            moveDownBtn.onmouseout = () => moveDownBtn.style.backgroundColor = 'white';
            moveDownBtn.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (document.body.contains(menu)) {
                    document.body.removeChild(menu);
                }
                await moveEvent(event, 1);
            };
            menu.appendChild(moveDownBtn);

            // 구분선
            const divider = document.createElement('div');
            divider.style.borderTop = '1px solid #eee';
            divider.style.margin = '4px 0';
            menu.appendChild(divider);

            // 메모 버튼
            const memoBtn = document.createElement('div');
            memoBtn.textContent = '📝 메모';
            memoBtn.style.padding = '8px 16px';
            memoBtn.style.cursor = 'pointer';
            memoBtn.style.fontSize = '14px';
            memoBtn.style.color = '#2563eb';
            memoBtn.onmouseover = () => memoBtn.style.backgroundColor = '#dbeafe';
            memoBtn.onmouseout = () => memoBtn.style.backgroundColor = 'white';
            memoBtn.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (document.body.contains(menu)) {
                    document.body.removeChild(menu);
                }
                openMemoModal(scheduleId, event.title, event.extendedProps.memo || '');
            };
            menu.appendChild(memoBtn);

            // 삭제 버튼
            const deleteBtn = document.createElement('div');
            deleteBtn.textContent = '🗑️ 삭제';
            deleteBtn.style.padding = '8px 16px';
            deleteBtn.style.cursor = 'pointer';
            deleteBtn.style.fontSize = '14px';
            deleteBtn.style.color = '#dc2626';
            deleteBtn.onmouseover = () => deleteBtn.style.backgroundColor = '#fee2e2';
            deleteBtn.onmouseout = () => deleteBtn.style.backgroundColor = 'white';
            deleteBtn.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (document.body.contains(menu)) {
                    document.body.removeChild(menu);
                }
                await deleteScheduleItem(scheduleId, event.title);
            };
            menu.appendChild(deleteBtn);

            document.body.appendChild(menu);
            
            // 메뉴 외부 클릭 시 닫기 (메뉴 내부 클릭은 제외)
            setTimeout(() => {
                const closeMenu = (e) => {
                    if (!menu.contains(e.target) && document.body.contains(menu)) {
                        document.body.removeChild(menu);
                        document.removeEventListener('mousedown', closeMenu);
                    }
                };
                document.addEventListener('mousedown', closeMenu);
            }, 0);
        }

        // 개별 일정 삭제
        async function deleteScheduleItem(scheduleId, title) {
            if (!confirm('이 일정을 삭제하시겠습니까?\\n\\n' + title)) {
                return;
            }

            try {
                await axios.delete('/api/schedules/item/' + scheduleId);
                alert('✅ 삭제되었습니다!');
                loadCalendar();
            } catch (error) {
                console.error('삭제 실패:', error);
                alert('❌ 삭제에 실패했습니다: ' + (error.response?.data?.error || error.message));
            }
        }

        // 메모 모달 열기
        function openMemoModal(scheduleId, title, currentMemo) {
            document.getElementById('memo-schedule-id').value = scheduleId;
            document.getElementById('memo-title-label').textContent = title;
            document.getElementById('memo-content').value = currentMemo || '';
            document.getElementById('memo-modal').classList.remove('hidden');
        }

        // 메모 모달 닫기
        window.closeMemoModal = function() {
            document.getElementById('memo-modal').classList.add('hidden');
        }

        // 메모 저장
        window.saveMemo = async function() {
            const scheduleId = document.getElementById('memo-schedule-id').value;
            const memo = document.getElementById('memo-content').value;

            try {
                await axios.put('/api/schedules/memo/' + scheduleId, { memo: memo });
                alert('✅ 메모가 저장되었습니다!');
                closeMemoModal();
                loadCalendar();
            } catch (error) {
                console.error('메모 저장 실패:', error);
                alert('❌ 메모 저장에 실패했습니다: ' + (error.response?.data?.error || error.message));
            }
        }

        // 이벤트 위/아래 이동
        async function moveEvent(event, direction) {
            // event.id를 직접 사용 (FullCalendar ID와 DB ID가 동일)
            const scheduleId = parseInt(event.id);
            
            // scheduleId가 유효한 숫자가 아니면 리턴
            if (!scheduleId || isNaN(scheduleId)) {
                alert('이 일정은 순서를 변경할 수 없습니다.');
                return;
            }
            
            const dateStr = event.startStr.split('T')[0];
            
            console.log('moveEvent called:', { scheduleId, direction, dateStr });
            
            // 같은 날짜의 모든 이벤트 가져오기 (유효한 ID가 있는 것만)
            const dayEvents = calendar.getEvents().filter(e => {
                const eventId = parseInt(e.id);
                return e.startStr.split('T')[0] === dateStr && eventId && !isNaN(eventId);
            }).sort((a, b) => {
                const aIndex = a.extendedProps?.order_index ?? 0;
                const bIndex = b.extendedProps?.order_index ?? 0;
                return aIndex - bIndex;
            });
            
            console.log('dayEvents:', dayEvents.map(e => ({
                id: parseInt(e.id),
                title: e.title,
                order_index: e.extendedProps.order_index
            })));
            
            const currentIndex = dayEvents.findIndex(e => parseInt(e.id) === scheduleId);
            const targetIndex = currentIndex + direction;
            
            console.log('currentIndex:', currentIndex, 'targetIndex:', targetIndex);
            
            if (currentIndex === -1) {
                alert('현재 일정을 찾을 수 없습니다.');
                return;
            }
            
            if (targetIndex < 0 || targetIndex >= dayEvents.length) {
                alert('더 이상 이동할 수 없습니다.');
                return;
            }
            
            // 순서 교체
            const temp = dayEvents[currentIndex];
            dayEvents[currentIndex] = dayEvents[targetIndex];
            dayEvents[targetIndex] = temp;
            
            // order_index 업데이트 (모든 id가 유효한 숫자인지 확인)
            const updates = dayEvents.map((e, index) => {
                const id = parseInt(e.id);
                return {
                    id: id,
                    order_index: index
                };
            }).filter(u => u.id && !isNaN(u.id));
            
            console.log('Sending updates:', updates);
            
            if (updates.length === 0) {
                alert('업데이트할 일정이 없습니다.');
                return;
            }
            
            try {
                console.log('[Frontend] Sending reorder request:', JSON.stringify(updates, null, 2));
                
                const response = await axios.put('/api/schedules/reorder', { updates });
                
                console.log('[Frontend] Reorder response:', response.data);
                
                if (response.data.success) {
                    console.log('[Frontend] Reorder successful, reloading calendar...');
                    loadCalendar();
                } else {
                    console.error('[Frontend] Some updates failed:', response.data);
                    alert('⚠️ 일부 순서 변경에 실패했습니다.\\n\\n성공: ' + response.data.summary.success + '개\\n실패: ' + response.data.summary.failed + '개');
                    loadCalendar(); // 부분 성공이라도 새로고침
                }
            } catch (error) {
                console.error('[Frontend] Reorder failed:', error);
                console.error('[Frontend] Error response:', error.response?.data);
                
                let errorMsg = '❌ 순서 변경에 실패했습니다.';
                if (error.response?.data) {
                    errorMsg += '\\n\\n' + (error.response.data.error || error.response.data.message || JSON.stringify(error.response.data));
                } else {
                    errorMsg += '\\n\\n' + error.message;
                }
                
                alert(errorMsg);
            }
        }

        // 전체 스케줄 삭제
        window.deleteAllSchedules = async function() {
            const year = document.getElementById('calendar-year').value;
            const month = document.getElementById('calendar-month').value;

            if (!year || !month) {
                alert('년월을 선택해주세요');
                return;
            }

            if (!confirm(\`\${year}년 \${month}월의 모든 스케줄을 삭제하시겠습니까?\\n\\n이 작업은 되돌릴 수 없습니다!\`)) {
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
            loadTaskTypes();
            initDateSelectors();
        });
    </script>
</body>
</html>
  `)
})

export default app
