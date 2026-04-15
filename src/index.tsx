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
// 유튜브 관리 API
// =========================

app.get('/api/youtube', async (c) => {
  const db = c.env.DB
  try {
    const result = await db.prepare('SELECT * FROM youtube_entries ORDER BY created_at DESC').all()
    return c.json(result.results)
  } catch (e) {
    return c.json([])
  }
})

app.post('/api/youtube', async (c) => {
  const db = c.env.DB
  const { url, title, impressions, views, subscribers, upload_date } = await c.req.json()
  if (!url) return c.json({ error: 'URL을 입력해주세요' }, 400)
  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS youtube_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      title TEXT DEFAULT '',
      impressions INTEGER DEFAULT 0,
      views INTEGER DEFAULT 0,
      subscribers INTEGER DEFAULT 0,
      upload_date TEXT DEFAULT '',
      memo TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`).run()
    // upload_date 컬럼이 없으면 추가
    try { await db.prepare('ALTER TABLE youtube_entries ADD COLUMN upload_date TEXT DEFAULT ""').run() } catch(e) {}

    const result = await db.prepare(
      'INSERT INTO youtube_entries (url, title, impressions, views, subscribers, upload_date) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(url, title || '', impressions || 0, views || 0, subscribers || 0, upload_date || '').run()
    return c.json({ id: result.meta.last_row_id })
  } catch (e) {
    return c.json({ error: '추가 실패' }, 400)
  }
})

app.put('/api/youtube/:id', async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')
  const { url, title, impressions, views, subscribers, upload_date } = await c.req.json()
  try { await db.prepare('ALTER TABLE youtube_entries ADD COLUMN upload_date TEXT DEFAULT ""').run() } catch(e) {}
  await db.prepare(
    'UPDATE youtube_entries SET url = ?, title = ?, impressions = ?, views = ?, subscribers = ?, upload_date = ? WHERE id = ?'
  ).bind(url || '', title || '', impressions || 0, views || 0, subscribers || 0, upload_date || '', id).run()
  return c.json({ success: true })
})

app.delete('/api/youtube/:id', async (c) => {
  const db = c.env.DB
  await db.prepare('DELETE FROM youtube_entries WHERE id = ?').bind(c.req.param('id')).run()
  return c.json({ success: true })
})

// =========================
// 인스타그램 관리 API
// =========================

app.get('/api/instagram', async (c) => {
  const db = c.env.DB
  try {
    const result = await db.prepare('SELECT * FROM instagram_entries ORDER BY created_at DESC').all()
    return c.json(result.results)
  } catch (e) {
    return c.json([])
  }
})

app.post('/api/instagram', async (c) => {
  const db = c.env.DB
  const { url, title, impressions, views, followers, upload_date } = await c.req.json()
  if (!url) return c.json({ error: 'URL을 입력해주세요' }, 400)
  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS instagram_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      title TEXT DEFAULT '',
      impressions INTEGER DEFAULT 0,
      views INTEGER DEFAULT 0,
      followers INTEGER DEFAULT 0,
      upload_date TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`).run()
    try { await db.prepare('ALTER TABLE instagram_entries ADD COLUMN upload_date TEXT DEFAULT ""').run() } catch(e) {}
    const result = await db.prepare(
      'INSERT INTO instagram_entries (url, title, impressions, views, followers, upload_date) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(url, title || '', impressions || 0, views || 0, followers || 0, upload_date || '').run()
    return c.json({ id: result.meta.last_row_id })
  } catch (e) {
    return c.json({ error: '추가 실패' }, 400)
  }
})

app.put('/api/instagram/:id', async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')
  const { url, title, impressions, views, followers, upload_date } = await c.req.json()
  try { await db.prepare('ALTER TABLE instagram_entries ADD COLUMN upload_date TEXT DEFAULT ""').run() } catch(e) {}
  await db.prepare(
    'UPDATE instagram_entries SET url = ?, title = ?, impressions = ?, views = ?, followers = ?, upload_date = ? WHERE id = ?'
  ).bind(url || '', title || '', impressions || 0, views || 0, followers || 0, upload_date || '', id).run()
  return c.json({ success: true })
})

app.delete('/api/instagram/:id', async (c) => {
  const db = c.env.DB
  await db.prepare('DELETE FROM instagram_entries WHERE id = ?').bind(c.req.param('id')).run()
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

// 일정 수동 추가
app.post('/api/schedules/add-item', async (c) => {
  try {
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
  } catch (e: any) {
    return c.json({ error: e?.message || 'Unknown error' }, 500)
  }
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
  const data = await c.req.json()

  // color 컬럼 없으면 자동 추가
  try { await db.prepare('ALTER TABLE schedules ADD COLUMN color TEXT DEFAULT NULL').run() } catch(e) {}

  const fields: string[] = []
  const values: any[] = []

  if (data.task_date !== undefined) { fields.push('task_date = ?'); values.push(data.task_date) }
  if (data.task_name !== undefined) { fields.push('task_name = ?'); values.push(data.task_name) }
  if (data.task_type !== undefined) { fields.push('task_type = ?'); values.push(data.task_type) }
  if (data.duration_hours !== undefined) { fields.push('duration_hours = ?'); values.push(data.duration_hours) }
  if (data.start_time !== undefined) { fields.push('start_time = ?'); values.push(data.start_time) }
  if (data.end_time !== undefined) { fields.push('end_time = ?'); values.push(data.end_time) }
  if (data.color !== undefined) { fields.push('color = ?'); values.push(data.color) }

  if (fields.length === 0) return c.json({ error: 'No fields to update' }, 400)

  values.push(scheduleId)
  await db.prepare(`UPDATE schedules SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run()
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
// 독립 작업 관리 API (캘린더와 분리)
// progress: 0~4 (0=0%, 1=25%, 2=50%, 3=75%, 4=100%)
// =========================

async function ensureTasksTable(db: any) {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        hospital_id INTEGER,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        progress INTEGER NOT NULL DEFAULT 0,
        order_index INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run()
  } catch (e) {}
}

// 월별 작업 목록
app.get('/api/tasks/:year/:month', async (c) => {
  const db = c.env.DB
  await ensureTasksTable(db)
  const year = parseInt(c.req.param('year'))
  const month = parseInt(c.req.param('month'))

  const result = await db.prepare(`
    SELECT t.*, h.name as hospital_name
    FROM tasks t
    LEFT JOIN hospitals h ON t.hospital_id = h.id
    WHERE t.year = ? AND t.month = ?
    ORDER BY t.order_index, t.id
  `).bind(year, month).all()

  return c.json(result.results)
})

// 작업 추가
app.post('/api/tasks', async (c) => {
  const db = c.env.DB
  await ensureTasksTable(db)
  const { name, hospital_id, year, month, progress } = await c.req.json()

  if (!name || !year || !month) {
    return c.json({ error: 'name, year, month 필수' }, 400)
  }

  const lastOrder = await db.prepare(
    'SELECT MAX(order_index) as max_order FROM tasks WHERE year = ? AND month = ?'
  ).bind(year, month).first()
  const orderIndex = ((lastOrder?.max_order as number) ?? -1) + 1

  const result = await db.prepare(`
    INSERT INTO tasks (name, hospital_id, year, month, progress, order_index)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    name,
    hospital_id || null,
    year,
    month,
    Math.max(0, Math.min(4, parseInt(progress) || 0)),
    orderIndex
  ).run()

  return c.json({ success: true, id: result.meta.last_row_id })
})

// 작업 수정 (이름, 진척률, 병원)
app.put('/api/tasks/:id', async (c) => {
  const db = c.env.DB
  await ensureTasksTable(db)
  const id = parseInt(c.req.param('id'))
  const data = await c.req.json()

  const fields: string[] = []
  const values: any[] = []
  if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name) }
  if (data.hospital_id !== undefined) { fields.push('hospital_id = ?'); values.push(data.hospital_id || null) }
  if (data.progress !== undefined) {
    const p = Math.max(0, Math.min(4, parseInt(data.progress) || 0))
    fields.push('progress = ?'); values.push(p)
  }

  if (fields.length === 0) return c.json({ error: 'No fields to update' }, 400)

  values.push(id)
  await db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run()
  return c.json({ success: true })
})

// 작업 삭제
app.delete('/api/tasks/:id', async (c) => {
  const db = c.env.DB
  await ensureTasksTable(db)
  const id = parseInt(c.req.param('id'))
  if (!id || isNaN(id)) return c.json({ error: 'Invalid id' }, 400)
  await db.prepare('DELETE FROM tasks WHERE id = ?').bind(id).run()
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
      .completed-task .fc-event-title {
        text-decoration: line-through !important;
        opacity: 0.6;
      }
      .fc-event { cursor: pointer !important; }
      .fc-event:hover { opacity: 0.85; transition: opacity 0.15s; }
      .fc-daygrid-event-dot { display: none !important; }
      .fc-daygrid-event {
        padding: 3px 6px !important;
        margin: 1px 2px !important;
        border-radius: 6px !important;
        border: none !important;
        font-size: 12px !important;
        line-height: 1.3 !important;
      }
      .fc-event-title {
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        font-size: 11.5px !important;
        font-weight: 500 !important;
      }
      .fc-event-time { display: none !important; }
      .fc-daygrid-day-events { padding: 0 2px !important; }
      .fc-daygrid-event-harness { margin-bottom: 1px !important; }
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
                <button onclick="showTab('youtube')" id="tab-youtube" class="tab-button flex-1 py-3 px-4 rounded-lg font-medium text-sm transition-all">
                    <i class="fab fa-youtube mr-2"></i>유튜브
                </button>
                <button onclick="showTab('instagram')" id="tab-instagram" class="tab-button flex-1 py-3 px-4 rounded-lg font-medium text-sm transition-all">
                    <i class="fab fa-instagram mr-2"></i>인스타그램
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

        <!-- 캘린더 탭 -->
        <div id="content-calendar" class="tab-content hidden">
            <!-- 작업 현황 (캘린더와 분리된 독립 작업 목록) -->
            <div id="task-stats" class="bg-white rounded-xl shadow-lg p-6 mb-4 border border-slate-200">
                <div class="flex flex-wrap justify-between items-center gap-3 mb-5">
                    <div class="flex items-center gap-3">
                        <h3 class="text-lg font-bold text-slate-800">
                            <i class="fas fa-tasks mr-2 text-indigo-500"></i>작업 현황
                        </h3>
                        <span id="stats-overall-badge" class="text-sm font-semibold px-3 py-1 rounded-full bg-indigo-50 text-indigo-700">전체 0/0 · 0%</span>
                    </div>
                    <div class="flex gap-2 items-center">
                        <label class="text-sm text-gray-600">병원:</label>
                        <select id="stats-hospital" onchange="renderTasks()" class="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none">
                            <option value="all">전체</option>
                        </select>
                        <button onclick="openAddTaskModal()" class="bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-semibold shadow-sm">
                            <i class="fas fa-plus mr-1"></i>작업 추가
                        </button>
                    </div>
                </div>
                <div id="stats-grid" class="grid grid-cols-1 md:grid-cols-2 gap-3">
                </div>
                <div id="stats-empty" class="text-center text-slate-400 text-sm py-6 hidden">
                    아직 작업이 없습니다. 상단의 "작업 추가" 버튼으로 추가해주세요.
                </div>
            </div>

            <!-- 작업 추가/수정 모달 -->
            <div id="task-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div class="bg-white rounded-xl shadow-2xl p-6 w-96 max-w-full mx-4">
                    <h3 id="task-modal-title" class="text-xl font-bold text-slate-800 mb-4">
                        <i class="fas fa-plus-circle text-indigo-500 mr-2"></i>작업 추가
                    </h3>
                    <input type="hidden" id="task-edit-id" value="">
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-700 mb-1">작업 이름</label>
                        <input type="text" id="task-name-input" placeholder="예: 유튜브 기능 추가" class="w-full border-2 border-slate-200 rounded-lg px-4 py-2 focus:border-indigo-400 focus:outline-none">
                    </div>
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-700 mb-1">병원 (선택)</label>
                        <select id="task-hospital-input" class="w-full border-2 border-slate-200 rounded-lg px-4 py-2 focus:border-indigo-400 focus:outline-none">
                            <option value="">선택 안함</option>
                        </select>
                    </div>
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-700 mb-2">진척률 (5단계)</label>
                        <div id="task-progress-input" class="flex gap-2" data-value="0">
                            <button type="button" data-p="0" class="flex-1 py-2 rounded-lg border-2 text-sm font-semibold transition-colors">0%</button>
                            <button type="button" data-p="1" class="flex-1 py-2 rounded-lg border-2 text-sm font-semibold transition-colors">25%</button>
                            <button type="button" data-p="2" class="flex-1 py-2 rounded-lg border-2 text-sm font-semibold transition-colors">50%</button>
                            <button type="button" data-p="3" class="flex-1 py-2 rounded-lg border-2 text-sm font-semibold transition-colors">75%</button>
                            <button type="button" data-p="4" class="flex-1 py-2 rounded-lg border-2 text-sm font-semibold transition-colors">100%</button>
                        </div>
                    </div>
                    <div class="flex justify-end gap-2">
                        <button onclick="closeTaskModal()" class="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium">취소</button>
                        <button onclick="saveTask()" class="bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg px-6 py-2 font-semibold shadow-md">저장</button>
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
                        <select id="calendar-year" onchange="loadCalendar(); loadTasks();" class="border-2 border-purple-200 rounded-lg px-4 py-2"></select>
                        <select id="calendar-month" onchange="loadCalendar(); loadTasks();" class="border-2 border-purple-200 rounded-lg px-4 py-2"></select>
                    </div>
                </div>
                <div id="calendar"></div>
            </div>
        </div>

        <!-- 유튜브 탭 -->
        <div id="content-youtube" class="tab-content hidden">
            <div class="bg-white rounded-xl shadow-lg p-6 border-2 border-red-100">
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-2xl font-bold text-red-500">
                        <i class="fab fa-youtube mr-2"></i>유튜브
                    </h2>
                    <button onclick="openYoutubeModal()" class="bg-red-500 hover:bg-red-600 text-white rounded-lg px-5 py-2.5 font-semibold shadow-md hover:shadow-lg transition-all">
                        <i class="fas fa-plus mr-2"></i>추가
                    </button>
                </div>
                <div id="youtube-list"></div>
            </div>
        </div>

        <!-- 인스타그램 탭 -->
        <div id="content-instagram" class="tab-content hidden">
            <div class="bg-white rounded-xl shadow-lg p-6 border-2 border-pink-100">
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-2xl font-bold text-pink-500">
                        <i class="fab fa-instagram mr-2"></i>인스타그램
                    </h2>
                    <button onclick="openInstagramModal()" class="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white rounded-lg px-5 py-2.5 font-semibold shadow-md hover:shadow-lg transition-all">
                        <i class="fas fa-plus mr-2"></i>추가
                    </button>
                </div>
                <div id="instagram-list"></div>
            </div>
        </div>
    </div>

    <!-- 유튜브 추가 모달 -->
    <div id="youtube-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-xl shadow-2xl p-6 w-[28rem] max-w-full mx-4">
            <h3 class="text-xl font-bold text-red-500 mb-4">
                <i class="fab fa-youtube mr-2"></i>유튜브 추가
            </h3>
            <div class="space-y-3">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">URL</label>
                    <input type="text" id="yt-url" placeholder="https://youtube.com/watch?v=..." class="w-full border-2 border-red-200 rounded-lg px-4 py-2 focus:border-red-400 focus:outline-none">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">제목</label>
                    <input type="text" id="yt-title" placeholder="영상 제목" class="w-full border-2 border-red-200 rounded-lg px-4 py-2 focus:border-red-400 focus:outline-none">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">업로드 날짜</label>
                    <input type="date" id="yt-upload-date" class="w-full border-2 border-red-200 rounded-lg px-4 py-2 focus:border-red-400 focus:outline-none">
                </div>
                <div class="grid grid-cols-3 gap-3">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">노출수</label>
                        <input type="number" id="yt-impressions" min="0" value="0" class="w-full border-2 border-red-200 rounded-lg px-4 py-2 focus:border-red-400 focus:outline-none">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">조회수</label>
                        <input type="number" id="yt-views" min="0" value="0" class="w-full border-2 border-red-200 rounded-lg px-4 py-2 focus:border-red-400 focus:outline-none">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">구독자수</label>
                        <input type="number" id="yt-subscribers" min="0" value="0" class="w-full border-2 border-red-200 rounded-lg px-4 py-2 focus:border-red-400 focus:outline-none">
                    </div>
                </div>
            </div>
            <div class="flex justify-end gap-2 mt-5">
                <button onclick="closeYoutubeModal()" class="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium">취소</button>
                <button onclick="addYoutubeEntry()" class="bg-red-500 hover:bg-red-600 text-white rounded-lg px-6 py-2 font-semibold shadow-md">
                    <i class="fas fa-plus mr-2"></i>추가
                </button>
            </div>
        </div>
    </div>

    <!-- 인스타그램 추가 모달 -->
    <div id="instagram-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-xl shadow-2xl p-6 w-[28rem] max-w-full mx-4">
            <h3 class="text-xl font-bold text-pink-500 mb-4">
                <i class="fab fa-instagram mr-2"></i>인스타그램 추가
            </h3>
            <div class="space-y-3">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">URL</label>
                    <input type="text" id="ig-url" placeholder="https://instagram.com/p/..." class="w-full border-2 border-pink-200 rounded-lg px-4 py-2 focus:border-pink-400 focus:outline-none">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">제목</label>
                    <input type="text" id="ig-title" placeholder="게시물 제목" class="w-full border-2 border-pink-200 rounded-lg px-4 py-2 focus:border-pink-400 focus:outline-none">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">업로드 날짜</label>
                    <input type="date" id="ig-upload-date" class="w-full border-2 border-pink-200 rounded-lg px-4 py-2 focus:border-pink-400 focus:outline-none">
                </div>
                <div class="grid grid-cols-3 gap-3">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">조회수</label>
                        <input type="number" id="ig-impressions" min="0" value="0" class="w-full border-2 border-pink-200 rounded-lg px-4 py-2 focus:border-pink-400 focus:outline-none">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">좋아요수</label>
                        <input type="number" id="ig-views" min="0" value="0" class="w-full border-2 border-pink-200 rounded-lg px-4 py-2 focus:border-pink-400 focus:outline-none">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">팔로워수</label>
                        <input type="number" id="ig-followers" min="0" value="0" class="w-full border-2 border-pink-200 rounded-lg px-4 py-2 focus:border-pink-400 focus:outline-none">
                    </div>
                </div>
            </div>
            <div class="flex justify-end gap-2 mt-5">
                <button onclick="closeInstagramModal()" class="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium">취소</button>
                <button onclick="addInstagramEntry()" class="bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-lg px-6 py-2 font-semibold shadow-md">
                    <i class="fas fa-plus mr-2"></i>추가
                </button>
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
                <label class="block text-sm font-medium text-gray-700 mb-1">작업 이름</label>
                <input type="text" id="custom-task-name-input" placeholder="예: 브랜드, 보고서, 회의..." class="w-full border-2 border-purple-200 rounded-lg px-4 py-2 focus:border-purple-400 focus:outline-none">
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">소요 시간</label>
                <input type="number" id="custom-task-duration-input" value="1" min="0.5" step="0.5" class="w-full border-2 border-purple-200 rounded-lg px-4 py-2 focus:border-purple-400 focus:outline-none">
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

    <!-- 일정 수정 모달 -->
    <div id="edit-schedule-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-xl shadow-2xl p-6 w-96 max-w-full mx-4">
            <h3 class="text-xl font-bold text-gray-800 mb-4">
                <i class="fas fa-edit text-purple-500 mr-2"></i>일정 수정
            </h3>
            <input type="hidden" id="edit-schedule-id">
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">작업 이름</label>
                <input type="text" id="edit-task-name" class="w-full border-2 border-purple-200 rounded-lg px-4 py-2 focus:border-purple-400 focus:outline-none">
            </div>
            <div class="grid grid-cols-2 gap-3 mb-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">소요 시간</label>
                    <input type="number" id="edit-duration" min="0.5" step="0.5" class="w-full border-2 border-purple-200 rounded-lg px-4 py-2 focus:border-purple-400 focus:outline-none">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">블록 색상</label>
                    <input type="color" id="edit-color" class="w-full h-10 border-2 border-purple-200 rounded-lg cursor-pointer">
                </div>
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">시작 시간</label>
                <select id="edit-start-time" class="w-full border-2 border-purple-200 rounded-lg px-4 py-2 focus:border-purple-400 focus:outline-none">
                    <option value="08:00">08:00</option>
                    <option value="09:00">09:00</option>
                    <option value="10:00">10:00</option>
                    <option value="11:00">11:00</option>
                    <option value="12:00">12:00</option>
                    <option value="13:00">13:00</option>
                    <option value="14:00">14:00</option>
                    <option value="15:00">15:00</option>
                    <option value="16:00">16:00</option>
                    <option value="17:00">17:00</option>
                </select>
            </div>
            <div class="flex justify-between">
                <div class="flex gap-2">
                    <button onclick="deleteFromEditModal()" class="text-red-500 hover:text-red-700 font-medium px-3 py-2">
                        <i class="fas fa-trash mr-1"></i>삭제
                    </button>
                    <button id="edit-complete-btn" onclick="toggleCompleteFromModal()" class="font-medium px-3 py-2">
                        <i class="fas fa-check-circle mr-1"></i><span id="edit-complete-text">완료</span>
                    </button>
                </div>
                <div class="flex gap-2">
                    <button onclick="closeEditModal()" class="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium">취소</button>
                    <button onclick="saveEditSchedule()" class="bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg px-6 py-2 font-semibold shadow-md hover:shadow-lg transition-all">
                        <i class="fas fa-save mr-2"></i>저장
                    </button>
                </div>
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
            if (tab === 'youtube') {
                loadYoutubeEntries();
            }
            if (tab === 'instagram') {
                loadInstagramEntries();
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
                console.error('병원 목록 로드 실패:', error);
                alert('병원 목록 로드 실패: ' + (error.response?.data?.error || error.message));
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

        // ========== 유튜브 ==========
        window.openYoutubeModal = function() {
            document.getElementById('yt-url').value = '';
            document.getElementById('yt-title').value = '';
            document.getElementById('yt-upload-date').value = '';
            document.getElementById('yt-impressions').value = '0';
            document.getElementById('yt-views').value = '0';
            document.getElementById('yt-subscribers').value = '0';
            document.getElementById('youtube-modal').classList.remove('hidden');
        }
        window.closeYoutubeModal = function() { document.getElementById('youtube-modal').classList.add('hidden'); }

        window.addYoutubeEntry = async function() {
            const url = document.getElementById('yt-url').value.trim();
            if (!url) { alert('URL을 입력해주세요'); return; }
            try {
                await axios.post('/api/youtube', {
                    url,
                    title: document.getElementById('yt-title').value.trim(),
                    upload_date: document.getElementById('yt-upload-date').value,
                    impressions: parseInt(document.getElementById('yt-impressions').value) || 0,
                    views: parseInt(document.getElementById('yt-views').value) || 0,
                    subscribers: parseInt(document.getElementById('yt-subscribers').value) || 0,
                });
                closeYoutubeModal();
                loadYoutubeEntries();
            } catch (error) {
                alert('추가 실패: ' + (error.response?.data?.error || error.message));
            }
        }

        window.deleteYoutubeEntry = async function(id) {
            if (!confirm('삭제하시겠습니까?')) return;
            try { await axios.delete(\`/api/youtube/\${id}\`); loadYoutubeEntries(); } catch(e) { alert('삭제 실패'); }
        }

        window.saveYoutubeEdit = async function(id) {
            const row = document.querySelector(\`[data-yt-id="\${id}"]\`);
            if (!row) return;
            try {
                await axios.put(\`/api/youtube/\${id}\`, {
                    url: row.querySelector('.yt-edit-url').value,
                    title: row.querySelector('.yt-edit-title').value,
                    upload_date: row.querySelector('.yt-edit-upload-date').value,
                    impressions: parseInt(row.querySelector('.yt-edit-impressions').value) || 0,
                    views: parseInt(row.querySelector('.yt-edit-views').value) || 0,
                    subscribers: parseInt(row.querySelector('.yt-edit-subscribers').value) || 0,
                });
                loadYoutubeEntries();
            } catch(e) { alert('수정 실패'); }
        }

        function formatNumber(n) { return (n || 0).toLocaleString(); }

        async function loadYoutubeEntries() {
            try {
                const res = await axios.get('/api/youtube');
                const list = document.getElementById('youtube-list');
                if (!res.data || res.data.length === 0) {
                    list.innerHTML = '<p class="text-gray-400 text-center py-8">등록된 항목이 없습니다.</p>';
                    return;
                }
                list.innerHTML = res.data.map(e => \`
                    <div class="bg-gradient-to-r from-red-50 to-white border-2 border-red-100 rounded-xl p-4 mb-3 hover:shadow-md transition-all" data-yt-id="\${e.id}">
                        <div class="flex justify-between items-center mb-3">
                            <a href="\${e.url}" target="_blank" class="text-red-600 hover:text-red-800 font-semibold truncate flex-1 mr-3">
                                <i class="fab fa-youtube mr-2"></i>\${e.title || '제목 없음'}
                            </a>
                            <div class="flex gap-1 shrink-0">
                                <button onclick="saveYoutubeEdit(\${e.id})" class="text-blue-500 hover:text-blue-700 p-1.5 rounded hover:bg-blue-50" title="저장"><i class="fas fa-save"></i></button>
                                <button onclick="deleteYoutubeEntry(\${e.id})" class="text-red-400 hover:text-red-600 p-1.5 rounded hover:bg-red-50" title="삭제"><i class="fas fa-trash"></i></button>
                            </div>
                        </div>
                        <input type="hidden" class="yt-edit-url" value="\${e.url}">
                        <input type="hidden" class="yt-edit-title" value="\${e.title || ''}">
                        <div class="flex items-center gap-2 mb-2 text-sm text-gray-500">
                            <i class="fas fa-calendar-alt"></i>
                            <input type="date" class="yt-edit-upload-date border border-gray-200 rounded px-2 py-1 text-sm" value="\${e.upload_date || ''}">
                        </div>
                        <div class="grid grid-cols-3 gap-3">
                            <div class="bg-white rounded-lg p-3 border border-red-100 text-center">
                                <div class="text-xs text-gray-500 mb-1">노출수</div>
                                <input type="number" class="yt-edit-impressions w-full text-center text-lg font-bold text-red-600 border-0 bg-transparent focus:outline-none" value="\${e.impressions || 0}">
                            </div>
                            <div class="bg-white rounded-lg p-3 border border-red-100 text-center">
                                <div class="text-xs text-gray-500 mb-1">조회수</div>
                                <input type="number" class="yt-edit-views w-full text-center text-lg font-bold text-red-600 border-0 bg-transparent focus:outline-none" value="\${e.views || 0}">
                            </div>
                            <div class="bg-white rounded-lg p-3 border border-red-100 text-center">
                                <div class="text-xs text-gray-500 mb-1">구독자수</div>
                                <input type="number" class="yt-edit-subscribers w-full text-center text-lg font-bold text-red-600 border-0 bg-transparent focus:outline-none" value="\${e.subscribers || 0}">
                            </div>
                        </div>
                    </div>
                \`).join('');
            } catch(e) { console.error('유튜브 로드 실패', e); }
        }

        // ========== 인스타그램 ==========
        window.openInstagramModal = function() {
            document.getElementById('ig-url').value = '';
            document.getElementById('ig-title').value = '';
            document.getElementById('ig-upload-date').value = '';
            document.getElementById('ig-impressions').value = '0';
            document.getElementById('ig-views').value = '0';
            document.getElementById('ig-followers').value = '0';
            document.getElementById('instagram-modal').classList.remove('hidden');
        }
        window.closeInstagramModal = function() { document.getElementById('instagram-modal').classList.add('hidden'); }

        window.addInstagramEntry = async function() {
            const url = document.getElementById('ig-url').value.trim();
            if (!url) { alert('URL을 입력해주세요'); return; }
            try {
                await axios.post('/api/instagram', {
                    url,
                    title: document.getElementById('ig-title').value.trim(),
                    upload_date: document.getElementById('ig-upload-date').value,
                    impressions: parseInt(document.getElementById('ig-impressions').value) || 0,
                    views: parseInt(document.getElementById('ig-views').value) || 0,
                    followers: parseInt(document.getElementById('ig-followers').value) || 0,
                });
                closeInstagramModal();
                loadInstagramEntries();
            } catch (error) {
                alert('추가 실패: ' + (error.response?.data?.error || error.message));
            }
        }

        window.deleteInstagramEntry = async function(id) {
            if (!confirm('삭제하시겠습니까?')) return;
            try { await axios.delete(\`/api/instagram/\${id}\`); loadInstagramEntries(); } catch(e) { alert('삭제 실패'); }
        }

        window.saveInstagramEdit = async function(id) {
            const row = document.querySelector(\`[data-ig-id="\${id}"]\`);
            if (!row) return;
            try {
                await axios.put(\`/api/instagram/\${id}\`, {
                    url: row.querySelector('.ig-edit-url').value,
                    title: row.querySelector('.ig-edit-title').value,
                    upload_date: row.querySelector('.ig-edit-upload-date').value,
                    impressions: parseInt(row.querySelector('.ig-edit-impressions').value) || 0,
                    views: parseInt(row.querySelector('.ig-edit-views').value) || 0,
                    followers: parseInt(row.querySelector('.ig-edit-followers').value) || 0,
                });
                loadInstagramEntries();
            } catch(e) { alert('수정 실패'); }
        }

        async function loadInstagramEntries() {
            try {
                const res = await axios.get('/api/instagram');
                const list = document.getElementById('instagram-list');
                if (!res.data || res.data.length === 0) {
                    list.innerHTML = '<p class="text-gray-400 text-center py-8">등록된 항목이 없습니다.</p>';
                    return;
                }
                list.innerHTML = res.data.map(e => \`
                    <div class="bg-gradient-to-r from-pink-50 to-white border-2 border-pink-100 rounded-xl p-4 mb-3 hover:shadow-md transition-all" data-ig-id="\${e.id}">
                        <div class="flex justify-between items-center mb-3">
                            <a href="\${e.url}" target="_blank" class="text-pink-600 hover:text-pink-800 font-semibold truncate flex-1 mr-3">
                                <i class="fab fa-instagram mr-2"></i>\${e.title || '제목 없음'}
                            </a>
                            <div class="flex gap-1 shrink-0">
                                <button onclick="saveInstagramEdit(\${e.id})" class="text-blue-500 hover:text-blue-700 p-1.5 rounded hover:bg-blue-50" title="저장"><i class="fas fa-save"></i></button>
                                <button onclick="deleteInstagramEntry(\${e.id})" class="text-pink-400 hover:text-pink-600 p-1.5 rounded hover:bg-pink-50" title="삭제"><i class="fas fa-trash"></i></button>
                            </div>
                        </div>
                        <input type="hidden" class="ig-edit-url" value="\${e.url}">
                        <input type="hidden" class="ig-edit-title" value="\${e.title || ''}">
                        <div class="flex items-center gap-2 mb-2 text-sm text-gray-500">
                            <i class="fas fa-calendar-alt"></i>
                            <input type="date" class="ig-edit-upload-date border border-gray-200 rounded px-2 py-1 text-sm" value="\${e.upload_date || ''}">
                        </div>
                        <div class="grid grid-cols-3 gap-3">
                            <div class="bg-white rounded-lg p-3 border border-pink-100 text-center">
                                <div class="text-xs text-gray-500 mb-1">조회수</div>
                                <input type="number" class="ig-edit-impressions w-full text-center text-lg font-bold text-pink-600 border-0 bg-transparent focus:outline-none" value="\${e.impressions || 0}">
                            </div>
                            <div class="bg-white rounded-lg p-3 border border-pink-100 text-center">
                                <div class="text-xs text-gray-500 mb-1">좋아요수</div>
                                <input type="number" class="ig-edit-views w-full text-center text-lg font-bold text-pink-600 border-0 bg-transparent focus:outline-none" value="\${e.views || 0}">
                            </div>
                            <div class="bg-white rounded-lg p-3 border border-pink-100 text-center">
                                <div class="text-xs text-gray-500 mb-1">팔로워수</div>
                                <input type="number" class="ig-edit-followers w-full text-center text-lg font-bold text-pink-600 border-0 bg-transparent focus:outline-none" value="\${e.followers || 0}">
                            </div>
                        </div>
                    </div>
                \`).join('');
            } catch(e) { console.error('인스타그램 로드 실패', e); }
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
                    // 커스텀 색상이 있으면 강제로 적용
                    const customColor = info.event.extendedProps.customColor;
                    if (customColor) {
                        info.el.style.setProperty('background-color', customColor, 'important');
                        info.el.style.setProperty('border-color', customColor, 'important');
                    }

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
            loadTasks();
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
                    // 색상 우선순위: 개별 색상 > 병원 색상 > 기본
                    const color = s.color || s.hospital_color || '#3b82f6';
                    const textColor = '#ffffff';
                    
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
                    // 병원명 표시 (기타/회의/기타는 숨김)
                    const hiddenHospitals = ['기타', '회의/기타'];
                    const displayTitle = (s.hospital_name && !hiddenHospitals.includes(s.hospital_name))
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
                            order_index: s.order_index || 0,
                            memo: s.memo || '',
                            customColor: s.color || ''
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
        
        // 독립 작업 목록 (캘린더와 분리)
        let __tasksCache = [];

        async function loadTasks() {
            const year = document.getElementById('calendar-year').value;
            const month = document.getElementById('calendar-month').value;
            if (!year || !month) return;
            try {
                // 병원 목록을 독립적으로 채움 (캘린더 일정이 없어도 동작)
                await populateHospitalDropdowns();
                const res = await axios.get(\`/api/tasks/\${year}/\${month}\`);
                __tasksCache = res.data || [];
                renderTasks();
            } catch (error) {
                console.error('작업 로드 실패', error);
            }
        }
        window.loadTasks = loadTasks;

        async function populateHospitalDropdowns() {
            try {
                const res = await axios.get('/api/hospitals');
                const hospitals = res.data || [];
                const filterSel = document.getElementById('stats-hospital');
                const modalSel = document.getElementById('task-hospital-input');
                const prevFilter = filterSel.value;
                const prevModal = modalSel.value;
                while (filterSel.options.length > 1) filterSel.remove(1);
                while (modalSel.options.length > 1) modalSel.remove(1);
                hospitals.forEach(h => {
                    if (h.name === '기타') return;
                    const o1 = document.createElement('option');
                    o1.value = h.id; o1.textContent = h.name;
                    filterSel.appendChild(o1);
                    const o2 = document.createElement('option');
                    o2.value = h.id; o2.textContent = h.name;
                    modalSel.appendChild(o2);
                });
                if (prevFilter) filterSel.value = prevFilter;
                if (prevModal) modalSel.value = prevModal;
            } catch (e) {
                console.error('병원 목록 로드 실패', e);
            }
        }

        // 진척률 단계 → 퍼센트
        const PROGRESS_PCT = [0, 25, 50, 75, 100];
        function progressBarColor(step) {
            if (step >= 4) return 'bg-emerald-500';
            if (step === 3) return 'bg-indigo-500';
            if (step === 2) return 'bg-sky-500';
            if (step === 1) return 'bg-amber-500';
            return 'bg-slate-300';
        }

        function renderTasks() {
            const statsGrid = document.getElementById('stats-grid');
            const overallBadge = document.getElementById('stats-overall-badge');
            const emptyEl = document.getElementById('stats-empty');

            const selectedHospital = document.getElementById('stats-hospital').value;
            const filtered = selectedHospital === 'all'
                ? __tasksCache
                : __tasksCache.filter(t => String(t.hospital_id) === String(selectedHospital));

            // 전체 평균 진척률
            const total = filtered.length;
            const sumPct = filtered.reduce((acc, t) => acc + PROGRESS_PCT[t.progress || 0], 0);
            const overall = total > 0 ? Math.round(sumPct / total) : 0;
            const doneCount = filtered.filter(t => (t.progress || 0) >= 4).length;
            overallBadge.textContent = \`전체 \${doneCount}/\${total} · \${overall}%\`;

            if (total === 0) {
                statsGrid.innerHTML = '';
                emptyEl.classList.remove('hidden');
                return;
            }
            emptyEl.classList.add('hidden');

            function escAttr(str) {
                return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            }
            function escText(str) {
                return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            }

            // 진척률 내림차순 정렬
            const sorted = [...filtered].sort((a, b) => (b.progress || 0) - (a.progress || 0));

            let html = '';
            for (const t of sorted) {
                const step = Math.max(0, Math.min(4, t.progress || 0));
                const pct = PROGRESS_PCT[step];
                const allDone = step >= 4;
                const rowClasses = allDone
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-white border-slate-200 hover:border-indigo-300';
                const nameClass = allDone ? 'text-slate-500 line-through' : 'text-slate-800';
                const hospitalLabel = t.hospital_name ? \`<span class="text-[11px] text-slate-500 bg-slate-100 rounded px-1.5 py-0.5 ml-1">\${escText(t.hospital_name)}</span>\` : '';

                // 5단계 도트 (클릭하여 진척률 설정)
                let dots = '';
                for (let i = 0; i <= 4; i++) {
                    const active = i <= step;
                    const dotColor = active
                        ? (allDone ? 'bg-emerald-500 border-emerald-500' : 'bg-indigo-500 border-indigo-500')
                        : 'bg-white border-slate-300 hover:border-indigo-400';
                    dots += \`<button data-action="setprog" data-id="\${t.id}" data-step="\${i}" title="\${PROGRESS_PCT[i]}%" class="w-5 h-5 rounded-full border-2 \${dotColor} transition-all"></button>\`;
                }

                html += \`
                    <div class="group border \${rowClasses} rounded-lg p-3 transition-all">
                        <div class="flex items-center justify-between gap-2 mb-2">
                            <div class="flex items-center gap-2 min-w-0 flex-1">
                                \${allDone ? '<i class="fas fa-check-circle text-emerald-500 text-sm flex-shrink-0"></i>' : ''}
                                <span class="text-sm font-semibold truncate \${nameClass}" title="\${escAttr(t.name)}">\${escText(t.name)}</span>
                                \${hospitalLabel}
                            </div>
                            <div class="flex items-center gap-1 flex-shrink-0">
                                <button data-action="edit" data-id="\${t.id}" title="수정" class="w-7 h-7 flex items-center justify-center rounded-md text-indigo-600 hover:bg-indigo-100 transition-colors">
                                    <i class="fas fa-pen text-xs"></i>
                                </button>
                                <button data-action="delete" data-id="\${t.id}" title="삭제" class="w-7 h-7 flex items-center justify-center rounded-md text-rose-600 hover:bg-rose-100 transition-colors">
                                    <i class="fas fa-trash text-xs"></i>
                                </button>
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <div class="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div class="h-full \${progressBarColor(step)} rounded-full transition-all duration-300" style="width: \${pct}%"></div>
                            </div>
                            <span class="text-xs font-semibold text-slate-600 tabular-nums w-10 text-right">\${pct}%</span>
                        </div>
                        <div class="flex items-center justify-between gap-2 mt-2">
                            <div class="flex items-center gap-1.5">\${dots}</div>
                            <span class="text-[11px] text-slate-400">5단계 진척률</span>
                        </div>
                    </div>
                \`;
            }

            statsGrid.innerHTML = html;

            // 이벤트 위임 (1회만 바인딩)
            if (!statsGrid.__tasksBound) {
                statsGrid.addEventListener('click', function(e) {
                    const btn = e.target.closest('button[data-action]');
                    if (!btn) return;
                    const id = parseInt(btn.dataset.id);
                    const action = btn.dataset.action;
                    if (action === 'setprog') {
                        const step = parseInt(btn.dataset.step);
                        updateTaskProgress(id, step);
                    } else if (action === 'edit') {
                        openEditTaskModal(id);
                    } else if (action === 'delete') {
                        deleteTask(id);
                    }
                });
                statsGrid.__tasksBound = true;
            }
        }
        window.renderTasks = renderTasks;

        async function updateTaskProgress(id, step) {
            try {
                await axios.put(\`/api/tasks/\${id}\`, { progress: step });
                const t = __tasksCache.find(x => x.id === id);
                if (t) t.progress = step;
                renderTasks();
            } catch (error) {
                alert('진척률 변경 실패: ' + (error.response?.data?.error || error.message));
            }
        }

        async function deleteTask(id) {
            const t = __tasksCache.find(x => x.id === id);
            if (!confirm(\`'\${t ? t.name : '작업'}'을(를) 삭제하시겠습니까?\`)) return;
            try {
                await axios.delete(\`/api/tasks/\${id}\`);
                loadTasks();
            } catch (error) {
                alert('삭제 실패: ' + (error.response?.data?.error || error.message));
            }
        }

        // === 작업 추가/수정 모달 ===
        function setProgressButton(step) {
            const container = document.getElementById('task-progress-input');
            container.dataset.value = String(step);
            Array.from(container.querySelectorAll('button')).forEach(btn => {
                const v = parseInt(btn.dataset.p);
                if (v === step) {
                    btn.className = 'flex-1 py-2 rounded-lg border-2 text-sm font-semibold transition-colors bg-indigo-500 border-indigo-500 text-white';
                } else {
                    btn.className = 'flex-1 py-2 rounded-lg border-2 text-sm font-semibold transition-colors bg-white border-slate-200 text-slate-600 hover:border-indigo-300';
                }
            });
        }

        window.openAddTaskModal = function() {
            document.getElementById('task-modal-title').innerHTML = '<i class="fas fa-plus-circle text-indigo-500 mr-2"></i>작업 추가';
            document.getElementById('task-edit-id').value = '';
            document.getElementById('task-name-input').value = '';
            document.getElementById('task-hospital-input').value = '';
            setProgressButton(0);
            document.getElementById('task-modal').classList.remove('hidden');
            setTimeout(() => document.getElementById('task-name-input').focus(), 50);
        }

        window.openEditTaskModal = function(id) {
            const t = __tasksCache.find(x => x.id === id);
            if (!t) return;
            document.getElementById('task-modal-title').innerHTML = '<i class="fas fa-pen text-indigo-500 mr-2"></i>작업 수정';
            document.getElementById('task-edit-id').value = String(id);
            document.getElementById('task-name-input').value = t.name || '';
            document.getElementById('task-hospital-input').value = t.hospital_id || '';
            setProgressButton(t.progress || 0);
            document.getElementById('task-modal').classList.remove('hidden');
        }

        window.closeTaskModal = function() {
            document.getElementById('task-modal').classList.add('hidden');
        }

        window.saveTask = async function() {
            const id = document.getElementById('task-edit-id').value;
            const name = document.getElementById('task-name-input').value.trim();
            const hospitalId = document.getElementById('task-hospital-input').value;
            const progress = parseInt(document.getElementById('task-progress-input').dataset.value || '0');
            if (!name) { alert('작업 이름을 입력해주세요'); return; }

            const year = parseInt(document.getElementById('calendar-year').value);
            const month = parseInt(document.getElementById('calendar-month').value);

            try {
                if (id) {
                    await axios.put(\`/api/tasks/\${id}\`, {
                        name, progress,
                        hospital_id: hospitalId ? parseInt(hospitalId) : null
                    });
                } else {
                    await axios.post('/api/tasks', {
                        name, progress, year, month,
                        hospital_id: hospitalId ? parseInt(hospitalId) : null
                    });
                }
                closeTaskModal();
                loadTasks();
            } catch (error) {
                alert('저장 실패: ' + (error.response?.data?.error || error.message));
            }
        }

        // 모달 진척률 버튼 클릭 바인딩 (body 끝 스크립트이므로 DOM이 이미 준비됨)
        (function bindProgressInput() {
            const container = document.getElementById('task-progress-input');
            if (!container) { setTimeout(bindProgressInput, 50); return; }
            container.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-p]');
                if (!btn) return;
                setProgressButton(parseInt(btn.dataset.p));
            });
        })();

        // 이벤트 클릭 핸들러 (완료 체크)
        async function handleEventClick(info) {
            const event = info.event;
            const scheduleId = event.extendedProps.scheduleId;

            if (!scheduleId) return; // 연차/휴가

            // 수정 모달 열기
            const isCompleted = event.extendedProps.isCompleted;
            document.getElementById('edit-schedule-id').value = scheduleId;
            document.getElementById('edit-schedule-id').dataset.completed = isCompleted ? '1' : '0';
            document.getElementById('edit-task-name').value = event.extendedProps.taskName || '';
            document.getElementById('edit-duration').value = event.extendedProps.durationHours || 1;
            document.getElementById('edit-start-time').value = event.extendedProps.startTime || '09:00';
            // 색상값 정규화 (rgb -> hex 변환)
            function toHex(c) {
                if (!c) return '#3b82f6';
                if (c.startsWith('#')) return c;
                const m = c.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
                if (m) {
                    return '#' + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
                }
                return '#3b82f6';
            }
            document.getElementById('edit-color').value = toHex(event.extendedProps.customColor || event.backgroundColor);

            // 완료 버튼 상태
            const btn = document.getElementById('edit-complete-btn');
            const txt = document.getElementById('edit-complete-text');
            if (isCompleted) {
                btn.className = 'text-orange-500 hover:text-orange-700 font-medium px-3 py-2';
                txt.textContent = '완료 취소';
            } else {
                btn.className = 'text-green-500 hover:text-green-700 font-medium px-3 py-2';
                txt.textContent = '완료';
            }

            document.getElementById('edit-schedule-modal').classList.remove('hidden');
        }

        window.closeEditModal = function() {
            document.getElementById('edit-schedule-modal').classList.add('hidden');
        }

        window.saveEditSchedule = async function() {
            const id = document.getElementById('edit-schedule-id').value;
            const taskName = document.getElementById('edit-task-name').value.trim();
            const duration = parseFloat(document.getElementById('edit-duration').value) || 1;
            const startTime = document.getElementById('edit-start-time').value;
            const color = document.getElementById('edit-color').value;

            if (!taskName) { alert('작업 이름을 입력해주세요'); return; }

            const startHour = parseInt(startTime.split(':')[0]);
            const endTotalMin = startHour * 60 + duration * 60;
            const endTime = String(Math.floor(endTotalMin / 60)).padStart(2, '0') + ':' + String(Math.floor(endTotalMin % 60)).padStart(2, '0');

            try {
                await axios.put(\`/api/schedules/\${id}\`, {
                    task_name: taskName,
                    task_type: taskName,
                    duration_hours: duration,
                    start_time: startTime,
                    end_time: endTime,
                    color: color
                });
                closeEditModal();
                loadCalendar();
            } catch (error) {
                alert('수정 실패: ' + (error.response?.data?.error || error.message));
            }
        }

        window.deleteFromEditModal = async function() {
            const id = document.getElementById('edit-schedule-id').value;
            if (!confirm('이 일정을 삭제하시겠습니까?')) return;
            try {
                await axios.delete(\`/api/schedules/item/\${id}\`);
                closeEditModal();
                loadCalendar();
            } catch (error) {
                alert('삭제 실패');
            }
        }

        // 수정 모달에서 완료 토글
        window.toggleCompleteFromModal = async function() {
            const id = document.getElementById('edit-schedule-id').value;
            const current = document.getElementById('edit-schedule-id').dataset.completed === '1';
            try {
                await axios.put(\`/api/schedules/\${id}/complete\`, {
                    is_completed: current ? 0 : 1
                });
                closeEditModal();
                loadCalendar();
            } catch (error) {
                alert('상태 변경 실패');
            }
        }

        // 완료 토글 (우클릭 메뉴에서 사용)
        window.toggleComplete = async function(scheduleId, currentState) {
            try {
                await axios.put(\`/api/schedules/\${scheduleId}/complete\`, {
                    is_completed: currentState ? 0 : 1
                });
                loadCalendar();
            } catch (error) {
                console.error('완료 상태 변경 실패', error);
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

            // 모달 열기
            document.getElementById('add-report-modal').classList.remove('hidden');
        }

        // 보고서 모달 닫기
        window.closeReportModal = function() {
            document.getElementById('add-report-modal').classList.add('hidden');
        }

        // 기본 일정 유형 설정
        // 일정 추가
        window.addScheduleItem = async function() {
            const dateStr = document.getElementById('report-date').value;
            const hospitalId = document.getElementById('report-hospital').value;
            const startTime = document.getElementById('report-start-time').value;

            const taskName = document.getElementById('custom-task-name-input').value.trim();
            const duration = parseFloat(document.getElementById('custom-task-duration-input').value) || 1;

            if (!taskName) {
                alert('작업 이름을 입력해주세요');
                return;
            }

            const actualType = taskName;
            const isReport = false;

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
            loadYoutubeEntries();
            initDateSelectors();
        });
    </script>
</body>
</html>
  `)
})

export default app
