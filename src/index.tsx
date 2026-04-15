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
  // 관련 작업 기록 먼저 삭제 (FK ON DELETE CASCADE가 안 걸려있는 경우 대비)
  try { await db.prepare('DELETE FROM task_logs WHERE task_id = ?').bind(id).run() } catch(e) {}
  await db.prepare('DELETE FROM tasks WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// =========================
// 작업 기록 API (각 진척률 변경 시 어떤 작업을 했는지)
// =========================

async function ensureTaskLogsTable(db: any) {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS task_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL,
        progress INTEGER NOT NULL DEFAULT 0,
        note TEXT NOT NULL DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run()
  } catch (e) {}
}

// 특정 작업의 기록 목록 (경로를 /api/task-logs/list/:taskId 로 두어
// /api/tasks/:year/:month 라우트와 충돌하지 않도록 함)
app.get('/api/task-logs/list/:taskId', async (c) => {
  const db = c.env.DB
  await ensureTaskLogsTable(db)
  const taskId = parseInt(c.req.param('taskId'))
  if (!taskId || isNaN(taskId)) return c.json({ error: 'Invalid task id' }, 400)
  const result = await db.prepare(
    'SELECT * FROM task_logs WHERE task_id = ? ORDER BY created_at DESC, id DESC'
  ).bind(taskId).all()
  return c.json(result.results)
})

// 작업 기록 추가
app.post('/api/task-logs/create/:taskId', async (c) => {
  const db = c.env.DB
  await ensureTaskLogsTable(db)
  const taskId = parseInt(c.req.param('taskId'))
  const { progress, note } = await c.req.json()
  if (!taskId || isNaN(taskId)) return c.json({ error: 'Invalid task id' }, 400)

  const p = Math.max(0, Math.min(4, parseInt(progress) || 0))
  const result = await db.prepare(
    'INSERT INTO task_logs (task_id, progress, note) VALUES (?, ?, ?)'
  ).bind(taskId, p, (note || '').toString()).run()

  return c.json({ success: true, id: result.meta.last_row_id })
})

// 작업 기록 수정
app.put('/api/task-logs/:id', async (c) => {
  const db = c.env.DB
  await ensureTaskLogsTable(db)
  const id = parseInt(c.req.param('id'))
  const { note, progress } = await c.req.json()
  if (!id || isNaN(id)) return c.json({ error: 'Invalid id' }, 400)

  const fields: string[] = []
  const values: any[] = []
  if (note !== undefined) { fields.push('note = ?'); values.push((note || '').toString()) }
  if (progress !== undefined) {
    const p = Math.max(0, Math.min(4, parseInt(progress) || 0))
    fields.push('progress = ?'); values.push(p)
  }
  if (fields.length === 0) return c.json({ error: 'No fields to update' }, 400)

  values.push(id)
  await db.prepare(`UPDATE task_logs SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run()
  return c.json({ success: true })
})

// 작업 기록 삭제
app.delete('/api/task-logs/:id', async (c) => {
  const db = c.env.DB
  await ensureTaskLogsTable(db)
  const id = parseInt(c.req.param('id'))
  if (!id || isNaN(id)) return c.json({ error: 'Invalid id' }, 400)
  await db.prepare('DELETE FROM task_logs WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// =========================
// 예산 관리 API
// type: 'income'(수입) / 'expense'(지출)
// =========================

async function ensureBudgetsTable(db: any) {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS budgets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        type TEXT NOT NULL DEFAULT 'expense',
        category TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        amount INTEGER NOT NULL DEFAULT 0,
        hospital_id INTEGER,
        budget_date TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run()
  } catch (e) {}
}

// 월별 예산 항목 조회
app.get('/api/budgets/:year/:month', async (c) => {
  const db = c.env.DB
  await ensureBudgetsTable(db)
  const year = parseInt(c.req.param('year'))
  const month = parseInt(c.req.param('month'))

  const result = await db.prepare(`
    SELECT b.*, h.name as hospital_name
    FROM budgets b
    LEFT JOIN hospitals h ON b.hospital_id = h.id
    WHERE b.year = ? AND b.month = ?
    ORDER BY b.budget_date, b.id
  `).bind(year, month).all()

  return c.json(result.results)
})

// 예산 항목 추가
app.post('/api/budgets', async (c) => {
  const db = c.env.DB
  await ensureBudgetsTable(db)
  const { year, month, type, category, description, amount, hospital_id, budget_date } = await c.req.json()

  if (!year || !month) {
    return c.json({ error: 'year, month 필수' }, 400)
  }
  const t = type === 'income' ? 'income' : 'expense'
  const amt = Math.max(0, parseInt(amount) || 0)

  const result = await db.prepare(`
    INSERT INTO budgets (year, month, type, category, description, amount, hospital_id, budget_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    year, month, t,
    category || '',
    description || '',
    amt,
    hospital_id || null,
    budget_date || null
  ).run()

  return c.json({ success: true, id: result.meta.last_row_id })
})

// 예산 항목 수정
app.put('/api/budgets/:id', async (c) => {
  const db = c.env.DB
  await ensureBudgetsTable(db)
  const id = parseInt(c.req.param('id'))
  const data = await c.req.json()

  const fields: string[] = []
  const values: any[] = []
  if (data.type !== undefined) {
    fields.push('type = ?')
    values.push(data.type === 'income' ? 'income' : 'expense')
  }
  if (data.category !== undefined) { fields.push('category = ?'); values.push(data.category) }
  if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description) }
  if (data.amount !== undefined) { fields.push('amount = ?'); values.push(Math.max(0, parseInt(data.amount) || 0)) }
  if (data.hospital_id !== undefined) { fields.push('hospital_id = ?'); values.push(data.hospital_id || null) }
  if (data.budget_date !== undefined) { fields.push('budget_date = ?'); values.push(data.budget_date || null) }

  if (fields.length === 0) return c.json({ error: 'No fields to update' }, 400)

  values.push(id)
  await db.prepare(`UPDATE budgets SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run()
  return c.json({ success: true })
})

// 예산 항목 삭제
app.delete('/api/budgets/:id', async (c) => {
  const db = c.env.DB
  await ensureBudgetsTable(db)
  const id = parseInt(c.req.param('id'))
  if (!id || isNaN(id)) return c.json({ error: 'Invalid id' }, 400)
  await db.prepare('DELETE FROM budgets WHERE id = ?').bind(id).run()
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
  // HTML 캐싱 금지 — 개발 중 브라우저가 옛 스크립트를 쥐고 있는 것을 방지
  c.header('Cache-Control', 'no-cache, no-store, must-revalidate')
  c.header('Pragma', 'no-cache')
  c.header('Expires', '0')
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
                <p class="text-white text-opacity-90">AI 기반 스마트 업무 스케줄 관리 시스템 <span class="text-[10px] text-white/60 ml-2">v2026.04.15-routefix</span></p>
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
                <button onclick="showTab('budget')" id="tab-budget" class="tab-button flex-1 py-3 px-4 rounded-lg font-medium text-sm transition-all">
                    <i class="fas fa-won-sign mr-2"></i>예산 관리
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

        <!-- 예산 관리 탭 -->
        <div id="content-budget" class="tab-content hidden">
            <div class="bg-white rounded-xl shadow-lg p-6 mb-4 border border-slate-200">
                <div class="flex flex-wrap justify-between items-center gap-3 mb-5">
                    <h2 class="text-2xl font-bold text-slate-800">
                        <i class="fas fa-won-sign mr-2 text-emerald-500"></i>예산 관리
                    </h2>
                    <div class="flex gap-2 items-center">
                        <select id="budget-year" onchange="loadBudgets()" class="border-2 border-emerald-200 rounded-lg px-4 py-2"></select>
                        <select id="budget-month" onchange="loadBudgets()" class="border-2 border-emerald-200 rounded-lg px-4 py-2"></select>
                        <button onclick="openAddBudgetModal()" class="bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm font-semibold shadow-sm">
                            <i class="fas fa-plus mr-1"></i>항목 추가
                        </button>
                    </div>
                </div>

                <!-- 월별 요약 카드 -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                    <div class="bg-rose-50 border border-rose-200 rounded-lg p-4">
                        <div class="text-xs text-rose-700 font-semibold mb-1">이번 달 지출</div>
                        <div id="budget-expense" class="text-2xl font-bold text-rose-700 tabular-nums">0원</div>
                    </div>
                    <div class="bg-slate-50 border border-slate-200 rounded-lg p-4">
                        <div class="text-xs text-slate-600 font-semibold mb-1">지난 달 지출 대비</div>
                        <div id="budget-compare" class="text-2xl font-bold text-slate-700 tabular-nums">—</div>
                        <div id="budget-compare-sub" class="text-[11px] text-slate-500 mt-0.5">지난달 0원</div>
                    </div>
                </div>

                <!-- 예산 항목 목록 -->
                <div class="border border-slate-200 rounded-lg overflow-hidden">
                    <div class="grid grid-cols-12 gap-2 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">
                        <div class="col-span-2">결제일</div>
                        <div class="col-span-3">카테고리</div>
                        <div class="col-span-4">내용</div>
                        <div class="col-span-2 text-right">금액</div>
                        <div class="col-span-1 text-right">관리</div>
                    </div>
                    <div id="budget-list" class="divide-y divide-slate-100"></div>
                    <div id="budget-empty" class="text-center text-slate-400 text-sm py-8 hidden">
                        등록된 예산 항목이 없습니다. 상단 "항목 추가"로 시작해보세요.
                    </div>
                </div>
            </div>

            <!-- 예산 추가/수정 모달 -->
            <div id="budget-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div class="bg-white rounded-xl shadow-2xl p-6 w-[28rem] max-w-full mx-4">
                    <h3 id="budget-modal-title" class="text-xl font-bold text-slate-800 mb-4">
                        <i class="fas fa-plus-circle text-emerald-500 mr-2"></i>예산 항목 추가
                    </h3>
                    <input type="hidden" id="budget-edit-id" value="">
                    <div class="mb-3">
                        <label class="block text-sm font-medium text-gray-700 mb-1">결제일</label>
                        <input type="date" id="budget-date-input" class="w-full border-2 border-slate-200 rounded-lg px-4 py-2 focus:border-emerald-400 focus:outline-none">
                    </div>
                    <div class="grid grid-cols-2 gap-3 mb-3">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">카테고리</label>
                            <input type="text" id="budget-category-input" placeholder="예: 광고비, 급여" class="w-full border-2 border-slate-200 rounded-lg px-4 py-2 focus:border-emerald-400 focus:outline-none">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">금액(원)</label>
                            <input type="number" id="budget-amount-input" min="0" step="1000" value="0" class="w-full border-2 border-slate-200 rounded-lg px-4 py-2 focus:border-emerald-400 focus:outline-none tabular-nums">
                        </div>
                    </div>
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-700 mb-1">내용</label>
                        <input type="text" id="budget-description-input" placeholder="상세 내용" class="w-full border-2 border-slate-200 rounded-lg px-4 py-2 focus:border-emerald-400 focus:outline-none">
                    </div>
                    <div class="flex justify-end gap-2">
                        <button onclick="closeBudgetModal()" class="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium">취소</button>
                        <button onclick="saveBudget()" class="bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg px-6 py-2 font-semibold shadow-md">저장</button>
                    </div>
                </div>
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

    <!-- 작업 상세 모달 (더블클릭 시 — 작업 정보 + 기록 작성/열람/수정/삭제) -->
    <div id="task-detail-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <!-- 헤더 -->
            <div class="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2 flex-wrap">
                        <h3 id="task-detail-name" class="text-xl font-bold text-slate-800 break-words"></h3>
                        <span id="task-detail-hospital" class="text-xs text-slate-500 bg-slate-100 rounded px-2 py-0.5 hidden"></span>
                    </div>
                    <div class="flex items-center gap-3 mt-2">
                        <div class="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div id="task-detail-progress-bar" class="h-full bg-indigo-500 rounded-full transition-all duration-300" style="width: 0%"></div>
                        </div>
                        <span id="task-detail-progress-pct" class="text-xs font-semibold text-slate-600 tabular-nums w-10 text-right">0%</span>
                    </div>
                    <div id="task-detail-dots" class="flex items-center gap-1.5 mt-2"></div>
                </div>
                <div class="flex items-start gap-1 flex-shrink-0">
                    <button onclick="openEditTaskModalFromDetail()" title="작업 수정" class="w-8 h-8 flex items-center justify-center rounded-md text-indigo-600 hover:bg-indigo-100">
                        <i class="fas fa-pen text-sm"></i>
                    </button>
                    <button onclick="deleteTaskFromDetail()" title="작업 삭제" class="w-8 h-8 flex items-center justify-center rounded-md text-rose-600 hover:bg-rose-100">
                        <i class="fas fa-trash text-sm"></i>
                    </button>
                    <button onclick="closeTaskDetailModal()" title="닫기" class="w-8 h-8 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100">
                        <i class="fas fa-times text-sm"></i>
                    </button>
                </div>
            </div>

            <!-- 작업 기록 작성 (빠른 추가) -->
            <div class="px-6 py-4 border-b border-slate-200 bg-slate-50">
                <label class="block text-sm font-semibold text-slate-700 mb-2">
                    <i class="fas fa-pen-to-square text-indigo-500 mr-1"></i>어떤 작업을 하셨나요?
                </label>
                <textarea id="task-detail-note-input" rows="3" placeholder="예: 썸네일 디자인 완료, 영상 편집 마무리..." class="w-full border-2 border-slate-200 rounded-lg px-3 py-2 focus:border-indigo-400 focus:outline-none resize-none text-sm"></textarea>
                <div class="flex items-center justify-between gap-2 mt-2">
                    <div class="flex items-center gap-2">
                        <span class="text-xs text-slate-600">기록 시점 진척률:</span>
                        <div id="task-detail-step-picker" class="flex gap-1" data-step="0">
                            <button type="button" data-step="0" class="detail-step-btn px-2 py-1 rounded text-[11px] font-semibold border-2 transition-colors">0%</button>
                            <button type="button" data-step="1" class="detail-step-btn px-2 py-1 rounded text-[11px] font-semibold border-2 transition-colors">25%</button>
                            <button type="button" data-step="2" class="detail-step-btn px-2 py-1 rounded text-[11px] font-semibold border-2 transition-colors">50%</button>
                            <button type="button" data-step="3" class="detail-step-btn px-2 py-1 rounded text-[11px] font-semibold border-2 transition-colors">75%</button>
                            <button type="button" data-step="4" class="detail-step-btn px-2 py-1 rounded text-[11px] font-semibold border-2 transition-colors">100%</button>
                        </div>
                    </div>
                    <button onclick="addTaskLogFromDetail()" class="bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg px-4 py-1.5 text-sm font-semibold shadow-sm">
                        <i class="fas fa-plus mr-1"></i>기록 추가
                    </button>
                </div>
            </div>

            <!-- 기록 히스토리 -->
            <div class="flex-1 overflow-y-auto px-6 py-4">
                <div class="flex items-center justify-between mb-3">
                    <h4 class="text-sm font-bold text-slate-700">
                        <i class="fas fa-clipboard-list text-slate-500 mr-1"></i>작업 기록
                        <span id="task-detail-log-count" class="text-xs text-slate-400 ml-1"></span>
                    </h4>
                </div>
                <div id="task-detail-log-list" class="space-y-2"></div>
            </div>
        </div>
    </div>

    <!-- 작업 기록 추가/수정 모달 (루트 레벨 — 탭 영향 받지 않음) -->
    <div id="task-log-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-xl shadow-2xl p-6 w-96 max-w-full mx-4">
            <h3 id="task-log-modal-title" class="text-xl font-bold text-slate-800 mb-2">
                <i class="fas fa-clipboard-list text-indigo-500 mr-2"></i>작업 기록
            </h3>
            <p id="task-log-subtitle" class="text-sm text-slate-500 mb-4"></p>
            <input type="hidden" id="task-log-task-id" value="">
            <input type="hidden" id="task-log-id" value="">
            <input type="hidden" id="task-log-progress" value="0">
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">어떤 작업을 하셨나요?</label>
                <textarea id="task-log-note-input" rows="4" placeholder="예: 썸네일 디자인 완료, 영상 편집 마무리..." class="w-full border-2 border-slate-200 rounded-lg px-4 py-2 focus:border-indigo-400 focus:outline-none resize-none"></textarea>
            </div>
            <div class="flex justify-end gap-2">
                <button onclick="closeTaskLogModal()" class="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium">취소</button>
                <button onclick="saveTaskLog()" class="bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg px-6 py-2 font-semibold shadow-md">저장</button>
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
            if (tab === 'budget') {
                loadBudgets();
            }
        };

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
        };

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
        };

        // ========== 유튜브 ==========
        window.openYoutubeModal = function() {
            document.getElementById('yt-url').value = '';
            document.getElementById('yt-title').value = '';
            document.getElementById('yt-upload-date').value = '';
            document.getElementById('yt-impressions').value = '0';
            document.getElementById('yt-views').value = '0';
            document.getElementById('yt-subscribers').value = '0';
            document.getElementById('youtube-modal').classList.remove('hidden');
        };
        window.closeYoutubeModal = function() { document.getElementById('youtube-modal').classList.add('hidden'); };

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
        };

        window.deleteYoutubeEntry = async function(id) {
            if (!confirm('삭제하시겠습니까?')) return;
            try { await axios.delete(\`/api/youtube/\${id}\`); loadYoutubeEntries(); } catch(e) { alert('삭제 실패'); }
        };

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
        };

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
        };
        window.closeInstagramModal = function() { document.getElementById('instagram-modal').classList.add('hidden'); };

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
        };

        window.deleteInstagramEntry = async function(id) {
            if (!confirm('삭제하시겠습니까?')) return;
            try { await axios.delete(\`/api/instagram/\${id}\`); loadInstagramEntries(); } catch(e) { alert('삭제 실패'); }
        };

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
        };

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
        };

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
        };

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

                // 5단계 도트 (클릭하면 기록 모달이 열리고, 저장 시 진척률이 해당 단계로 변경됨)
                let dots = '';
                for (let i = 0; i <= 4; i++) {
                    const active = i <= step;
                    const dotColor = active
                        ? (allDone ? 'bg-emerald-500 border-emerald-500' : 'bg-indigo-500 border-indigo-500')
                        : 'bg-white border-slate-300 hover:border-indigo-400';
                    dots += \`<button data-action="setprog" data-id="\${t.id}" data-step="\${i}" title="\${PROGRESS_PCT[i]}% — 작업 기록 추가" class="w-5 h-5 rounded-full border-2 \${dotColor} transition-all"></button>\`;
                }

                const logCount = (t.__logs || []).length;
                const expanded = __expandedTaskIds.has(t.id);

                html += \`
                    <div class="group border \${rowClasses} rounded-lg p-3 transition-all cursor-pointer" data-task-card="\${t.id}" title="더블클릭하면 상세보기">
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
                            <button data-action="togglelogs" data-id="\${t.id}" class="text-[11px] text-slate-500 hover:text-indigo-600 flex items-center gap-1">
                                <i class="fas fa-clipboard-list"></i>
                                작업 기록 \${logCount > 0 ? '('+logCount+')' : ''}
                                <i class="fas fa-chevron-\${expanded ? 'up' : 'down'} text-[9px]"></i>
                            </button>
                        </div>
                        <div data-task-logs="\${t.id}" class="\${expanded ? '' : 'hidden'} mt-3 border-t border-slate-200 pt-2 space-y-1.5">
                            \${renderTaskLogs(t)}
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
                    try {
                        const id = parseInt(btn.dataset.id);
                        const action = btn.dataset.action;
                        console.log('[task action]', action, 'id=', id, 'step=', btn.dataset.step);
                        if (action === 'setprog') {
                            const step = parseInt(btn.dataset.step);
                            if (typeof openTaskLogModal !== 'function') {
                                alert('작업 기록 기능이 로드되지 않았습니다. 페이지를 강력 새로고침(Ctrl+Shift+R) 해주세요.');
                                return;
                            }
                            openTaskLogModal(id, step);
                        } else if (action === 'edit') {
                            openEditTaskModal(id);
                        } else if (action === 'delete') {
                            deleteTask(id);
                        } else if (action === 'togglelogs') {
                            toggleTaskLogs(id);
                        } else if (action === 'editlog') {
                            const logId = parseInt(btn.dataset.logId);
                            openEditTaskLogModal(id, logId);
                        } else if (action === 'deletelog') {
                            const logId = parseInt(btn.dataset.logId);
                            deleteTaskLog(id, logId);
                        }
                    } catch (err) {
                        console.error('작업 버튼 처리 오류:', err);
                        alert('오류: ' + (err.message || err));
                    }
                });
                // 카드 단일 클릭 → 상세 모달 열기 (버튼/액션 요소는 제외)
                statsGrid.addEventListener('click', function(e) {
                    if (e.target.closest('button')) return;
                    if (e.target.closest('[data-action]')) return;
                    const card = e.target.closest('[data-task-card]');
                    if (!card) return;
                    const id = parseInt(card.dataset.taskCard);
                    openTaskDetailModal(id);
                });
                statsGrid.__tasksBound = true;
            }
        }
        window.renderTasks = renderTasks;

        function renderTaskLogs(t) {
            const logs = t.__logs;
            if (logs === undefined) {
                return '<div class="text-[11px] text-slate-400 italic">불러오는 중...</div>';
            }
            if (logs.length === 0) {
                return '<div class="text-[11px] text-slate-400 italic">아직 기록이 없습니다. 진척률 점을 눌러 작업 기록을 남겨보세요.</div>';
            }
            function escText(str) {
                return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            }
            function fmtDate(s) {
                if (!s) return '';
                const d = new Date(s.replace(' ', 'T') + 'Z');
                if (isNaN(d.getTime())) return s;
                // KST 변환
                const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
                const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
                const dd = String(kst.getUTCDate()).padStart(2, '0');
                const hh = String(kst.getUTCHours()).padStart(2, '0');
                const mi = String(kst.getUTCMinutes()).padStart(2, '0');
                return \`\${mm}/\${dd} \${hh}:\${mi}\`;
            }
            let out = '';
            for (const log of logs) {
                const p = PROGRESS_PCT[log.progress || 0];
                out += \`
                    <div class="flex items-start gap-2 text-xs bg-slate-50 rounded-md px-2 py-1.5 group/log">
                        <span class="inline-block text-[10px] font-bold text-indigo-600 bg-indigo-50 rounded px-1.5 py-0.5 tabular-nums flex-shrink-0 mt-0.5">\${p}%</span>
                        <div class="flex-1 min-w-0">
                            <div class="text-slate-700 break-words whitespace-pre-wrap">\${escText(log.note) || '<span class="italic text-slate-400">(내용 없음)</span>'}</div>
                            <div class="text-[10px] text-slate-400 mt-0.5 tabular-nums">\${fmtDate(log.created_at)}</div>
                        </div>
                        <div class="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover/log:opacity-100 transition-opacity">
                            <button data-action="editlog" data-id="\${t.id}" data-log-id="\${log.id}" title="기록 수정" class="w-6 h-6 flex items-center justify-center rounded text-indigo-600 hover:bg-indigo-100">
                                <i class="fas fa-pen text-[10px]"></i>
                            </button>
                            <button data-action="deletelog" data-id="\${t.id}" data-log-id="\${log.id}" title="기록 삭제" class="w-6 h-6 flex items-center justify-center rounded text-rose-600 hover:bg-rose-100">
                                <i class="fas fa-trash text-[10px]"></i>
                            </button>
                        </div>
                    </div>
                \`;
            }
            return out;
        }

        // 작업 기록 영역 토글 (펼치기/접기)
        const __expandedTaskIds = new Set();
        async function toggleTaskLogs(taskId) {
            if (__expandedTaskIds.has(taskId)) {
                __expandedTaskIds.delete(taskId);
            } else {
                __expandedTaskIds.add(taskId);
                await ensureTaskLogsLoaded(taskId);
            }
            renderTasks();
        }

        async function ensureTaskLogsLoaded(taskId) {
            const t = __tasksCache.find(x => x.id === taskId);
            if (!t) return;
            if (t.__logs !== undefined) return;
            try {
                const res = await axios.get(\`/api/task-logs/list/\${taskId}\`);
                t.__logs = res.data || [];
            } catch (e) {
                t.__logs = [];
            }
        }

        // 기록 모달: taskId와 새 진척률(step) 또는 기존 logId를 받음
        window.openTaskLogModal = async function(taskId, step) {
            const t = __tasksCache.find(x => x.id === taskId);
            if (!t) return;
            document.getElementById('task-log-task-id').value = String(taskId);
            document.getElementById('task-log-id').value = '';
            document.getElementById('task-log-progress').value = String(step);
            document.getElementById('task-log-note-input').value = '';
            document.getElementById('task-log-modal-title').innerHTML =
                '<i class="fas fa-clipboard-list text-indigo-500 mr-2"></i>작업 기록 추가';
            document.getElementById('task-log-subtitle').textContent =
                \`'\${t.name}' · 진척률을 \${PROGRESS_PCT[step]}%로 변경합니다\`;
            document.getElementById('task-log-modal').classList.remove('hidden');
            setTimeout(() => document.getElementById('task-log-note-input').focus(), 50);
        };

        window.openEditTaskLogModal = function(taskId, logId) {
            const t = __tasksCache.find(x => x.id === taskId);
            if (!t || !t.__logs) return;
            const log = t.__logs.find(l => l.id === logId);
            if (!log) return;
            document.getElementById('task-log-task-id').value = String(taskId);
            document.getElementById('task-log-id').value = String(logId);
            document.getElementById('task-log-progress').value = String(log.progress || 0);
            document.getElementById('task-log-note-input').value = log.note || '';
            document.getElementById('task-log-modal-title').innerHTML =
                '<i class="fas fa-pen text-indigo-500 mr-2"></i>작업 기록 수정';
            document.getElementById('task-log-subtitle').textContent =
                \`'\${t.name}' · \${PROGRESS_PCT[log.progress || 0]}% 시점 기록\`;
            document.getElementById('task-log-modal').classList.remove('hidden');
            setTimeout(() => document.getElementById('task-log-note-input').focus(), 50);
        };

        window.closeTaskLogModal = function() {
            document.getElementById('task-log-modal').classList.add('hidden');
        };

        window.saveTaskLog = async function() {
            const taskId = parseInt(document.getElementById('task-log-task-id').value);
            const logId = document.getElementById('task-log-id').value;
            const progress = parseInt(document.getElementById('task-log-progress').value);
            const note = document.getElementById('task-log-note-input').value.trim();
            if (!taskId) return;
            try {
                if (logId) {
                    // 기록 수정만
                    await axios.put(\`/api/task-logs/\${logId}\`, { note });
                } else {
                    // 새 기록 + 진척률 변경
                    await axios.post(\`/api/task-logs/create/\${taskId}\`, { progress, note });
                    await axios.put(\`/api/tasks/\${taskId}\`, { progress });
                    // 로컬 업데이트
                    const t = __tasksCache.find(x => x.id === taskId);
                    if (t) t.progress = progress;
                    __expandedTaskIds.add(taskId);
                }
                // 해당 작업의 로그 캐시 무효화 후 재로드
                const t = __tasksCache.find(x => x.id === taskId);
                if (t) t.__logs = undefined;
                await ensureTaskLogsLoaded(taskId);
                closeTaskLogModal();
                renderTasks();
            } catch (error) {
                alert('저장 실패: ' + (error.response?.data?.error || error.message));
            }
        };

        async function deleteTaskLog(taskId, logId) {
            if (!confirm('이 작업 기록을 삭제하시겠습니까?')) return;
            try {
                await axios.delete(\`/api/task-logs/\${logId}\`);
                const t = __tasksCache.find(x => x.id === taskId);
                if (t) t.__logs = undefined;
                await ensureTaskLogsLoaded(taskId);
                renderTasks();
                // 상세 모달이 열려있으면 동기화
                if (__detailTaskId === taskId) renderTaskDetail();
            } catch (error) {
                alert('삭제 실패: ' + (error.response?.data?.error || error.message));
            }
        }

        // =========================
        // 작업 상세 모달 (더블클릭 진입)
        // =========================
        let __detailTaskId = null;
        let __detailStep = 0;

        function setDetailStepButton(step) {
            __detailStep = step;
            const container = document.getElementById('task-detail-step-picker');
            if (container) container.dataset.step = String(step);
            document.querySelectorAll('.detail-step-btn').forEach(btn => {
                const v = parseInt(btn.dataset.step);
                if (v === step) {
                    btn.className = 'detail-step-btn px-2 py-1 rounded text-[11px] font-semibold border-2 transition-colors bg-indigo-500 border-indigo-500 text-white';
                } else {
                    btn.className = 'detail-step-btn px-2 py-1 rounded text-[11px] font-semibold border-2 transition-colors bg-white border-slate-200 text-slate-600 hover:border-indigo-300';
                }
            });
        }

        window.openTaskDetailModal = async function(taskId) {
            const t = __tasksCache.find(x => x.id === taskId);
            if (!t) return;
            __detailTaskId = taskId;
            // 단계 버튼 클릭 바인딩 (최초 1회)
            const stepPicker = document.getElementById('task-detail-step-picker');
            if (stepPicker && !stepPicker.__detailStepBound) {
                stepPicker.addEventListener('click', function(e) {
                    const btn = e.target.closest('button[data-step]');
                    if (!btn) return;
                    setDetailStepButton(parseInt(btn.dataset.step));
                });
                stepPicker.__detailStepBound = true;
            }
            await ensureTaskLogsLoaded(taskId);
            renderTaskDetail();
            document.getElementById('task-detail-modal').classList.remove('hidden');
            setTimeout(() => document.getElementById('task-detail-note-input').focus(), 50);
        };

        window.closeTaskDetailModal = function() {
            document.getElementById('task-detail-modal').classList.add('hidden');
            __detailTaskId = null;
        };

        function renderTaskDetail() {
            if (__detailTaskId === null) return;
            const t = __tasksCache.find(x => x.id === __detailTaskId);
            if (!t) return;

            const step = Math.max(0, Math.min(4, t.progress || 0));
            const pct = PROGRESS_PCT[step];
            const allDone = step >= 4;

            document.getElementById('task-detail-name').textContent = t.name || '';
            const hospEl = document.getElementById('task-detail-hospital');
            if (t.hospital_name) {
                hospEl.textContent = t.hospital_name;
                hospEl.classList.remove('hidden');
            } else {
                hospEl.classList.add('hidden');
            }

            const bar = document.getElementById('task-detail-progress-bar');
            bar.style.width = pct + '%';
            bar.className = 'h-full rounded-full transition-all duration-300 ' + progressBarColor(step);
            document.getElementById('task-detail-progress-pct').textContent = pct + '%';

            // 상단 도트 (간단 표시용 · 클릭하면 기록 모달 열림)
            const dotsEl = document.getElementById('task-detail-dots');
            let dotsHtml = '';
            for (let i = 0; i <= 4; i++) {
                const active = i <= step;
                const dotColor = active
                    ? (allDone ? 'bg-emerald-500 border-emerald-500' : 'bg-indigo-500 border-indigo-500')
                    : 'bg-white border-slate-300 hover:border-indigo-400';
                dotsHtml += \`<button data-detail-dot="\${i}" title="\${PROGRESS_PCT[i]}% — 기록 작성 시점으로 사용" class="w-4 h-4 rounded-full border-2 \${dotColor} transition-all"></button>\`;
            }
            dotsEl.innerHTML = dotsHtml;
            // 상단 도트 클릭: 하단 작성 영역의 진척률 선택을 변경
            if (!dotsEl.__detailBound) {
                dotsEl.addEventListener('click', function(e) {
                    const btn = e.target.closest('button[data-detail-dot]');
                    if (!btn) return;
                    setDetailStepButton(parseInt(btn.dataset.detailDot));
                });
                dotsEl.__detailBound = true;
            }

            // 현재 진척률로 기본 선택
            setDetailStepButton(step);

            // 로그 리스트
            const logs = t.__logs || [];
            document.getElementById('task-detail-log-count').textContent = logs.length ? '(' + logs.length + ')' : '';
            const listEl = document.getElementById('task-detail-log-list');
            if (logs.length === 0) {
                listEl.innerHTML = '<div class="text-sm text-slate-400 italic text-center py-6">아직 기록이 없습니다. 위 입력창에 뭐 했는지 적고 \\'기록 추가\\'를 눌러보세요.</div>';
            } else {
                function escText(str) {
                    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                }
                function fmtDate(s) {
                    if (!s) return '';
                    const d = new Date(s.replace(' ', 'T') + 'Z');
                    if (isNaN(d.getTime())) return s;
                    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
                    const yy = kst.getUTCFullYear();
                    const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
                    const dd = String(kst.getUTCDate()).padStart(2, '0');
                    const hh = String(kst.getUTCHours()).padStart(2, '0');
                    const mi = String(kst.getUTCMinutes()).padStart(2, '0');
                    return \`\${yy}/\${mm}/\${dd} \${hh}:\${mi}\`;
                }
                let html = '';
                for (const log of logs) {
                    const p = PROGRESS_PCT[log.progress || 0];
                    html += \`
                        <div class="flex items-start gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2.5 group/dlog">
                            <span class="inline-block text-[11px] font-bold text-indigo-600 bg-indigo-50 rounded px-2 py-0.5 tabular-nums flex-shrink-0 mt-0.5">\${p}%</span>
                            <div class="flex-1 min-w-0">
                                <div class="text-sm text-slate-700 break-words whitespace-pre-wrap">\${escText(log.note) || '<span class="italic text-slate-400">(내용 없음)</span>'}</div>
                                <div class="text-[11px] text-slate-400 mt-1 tabular-nums">\${fmtDate(log.created_at)}</div>
                            </div>
                            <div class="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover/dlog:opacity-100 transition-opacity">
                                <button data-detail-action="editlog" data-log-id="\${log.id}" title="수정" class="w-7 h-7 flex items-center justify-center rounded text-indigo-600 hover:bg-indigo-100">
                                    <i class="fas fa-pen text-xs"></i>
                                </button>
                                <button data-detail-action="deletelog" data-log-id="\${log.id}" title="삭제" class="w-7 h-7 flex items-center justify-center rounded text-rose-600 hover:bg-rose-100">
                                    <i class="fas fa-trash text-xs"></i>
                                </button>
                            </div>
                        </div>
                    \`;
                }
                listEl.innerHTML = html;
            }

            // 로그 리스트 액션 이벤트 위임
            if (!listEl.__detailLogBound) {
                listEl.addEventListener('click', function(e) {
                    const btn = e.target.closest('button[data-detail-action]');
                    if (!btn) return;
                    const logId = parseInt(btn.dataset.logId);
                    const action = btn.dataset.detailAction;
                    if (action === 'editlog') {
                        openEditTaskLogModal(__detailTaskId, logId);
                    } else if (action === 'deletelog') {
                        deleteTaskLog(__detailTaskId, logId);
                    }
                });
                listEl.__detailLogBound = true;
            }
        }

        // 모달 하단 "기록 추가" — 입력창 내용으로 기록 생성 + 진척률 변경
        window.addTaskLogFromDetail = async function() {
            console.log('[addTaskLogFromDetail] taskId=', __detailTaskId, 'step=', __detailStep);
            if (__detailTaskId === null) {
                alert('작업이 선택되지 않았습니다. 모달을 닫고 다시 열어주세요.');
                return;
            }
            const noteEl = document.getElementById('task-detail-note-input');
            const note = noteEl ? noteEl.value.trim() : '';
            const step = __detailStep;
            if (!note) {
                if (!confirm('내용이 비어 있습니다. 그대로 기록할까요?')) return;
            }
            try {
                const postRes = await axios.post(\`/api/task-logs/create/\${__detailTaskId}\`, { progress: step, note });
                console.log('[addTaskLogFromDetail] log created', postRes.data);
                // 진척률이 바뀌었으면 작업의 progress도 같이 업데이트
                const t = __tasksCache.find(x => x.id === __detailTaskId);
                if (t && (t.progress || 0) !== step) {
                    await axios.put(\`/api/tasks/\${__detailTaskId}\`, { progress: step });
                    t.progress = step;
                }
                if (t) t.__logs = undefined;
                await ensureTaskLogsLoaded(__detailTaskId);
                if (noteEl) noteEl.value = '';
                renderTaskDetail();
                renderTasks();
            } catch (error) {
                console.error('[addTaskLogFromDetail] error', error);
                alert('기록 추가 실패: ' + (error.response?.data?.error || error.message));
            }
        };

        // 상세 모달에서 작업 자체 수정/삭제
        window.openEditTaskModalFromDetail = function() {
            if (__detailTaskId === null) return;
            const id = __detailTaskId;
            closeTaskDetailModal();
            openEditTaskModal(id);
        };

        window.deleteTaskFromDetail = async function() {
            if (__detailTaskId === null) return;
            const id = __detailTaskId;
            const t = __tasksCache.find(x => x.id === id);
            if (!confirm(\`'\${t ? t.name : '작업'}'을(를) 삭제하시겠습니까?\\n관련 작업 기록도 모두 삭제됩니다.\`)) return;
            try {
                await axios.delete(\`/api/tasks/\${id}\`);
                closeTaskDetailModal();
                loadTasks();
            } catch (error) {
                alert('삭제 실패: ' + (error.response?.data?.error || error.message));
            }
        };

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
        };

        window.openEditTaskModal = function(id) {
            const t = __tasksCache.find(x => x.id === id);
            if (!t) return;
            document.getElementById('task-modal-title').innerHTML = '<i class="fas fa-pen text-indigo-500 mr-2"></i>작업 수정';
            document.getElementById('task-edit-id').value = String(id);
            document.getElementById('task-name-input').value = t.name || '';
            document.getElementById('task-hospital-input').value = t.hospital_id || '';
            setProgressButton(t.progress || 0);
            document.getElementById('task-modal').classList.remove('hidden');
        };

        window.closeTaskModal = function() {
            document.getElementById('task-modal').classList.add('hidden');
        };

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
        };

        // 모달 진척률 버튼 클릭 바인딩 (body 끝 스크립트이므로 DOM이 이미 준비됨)
        function bindProgressInput() {
            const container = document.getElementById('task-progress-input');
            if (!container) { setTimeout(bindProgressInput, 50); return; }
            container.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-p]');
                if (!btn) return;
                setProgressButton(parseInt(btn.dataset.p));
            });
        }
        bindProgressInput();

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
        };

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
        };

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
        };

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
        };

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
        };

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
        };

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
        };

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
        };

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
        };

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
        };

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

            // 예산 관리 탭
            const budgetYear = document.getElementById('budget-year');
            const budgetMonth = document.getElementById('budget-month');
            if (budgetYear && budgetMonth) {
                for (let y = currentYear - 1; y <= currentYear + 2; y++) {
                    budgetYear.innerHTML += \`<option value="\${y}" \${y === currentYear ? 'selected' : ''}>\${y}년</option>\`;
                }
                for (let m = 1; m <= 12; m++) {
                    budgetMonth.innerHTML += \`<option value="\${m}" \${m === currentMonth ? 'selected' : ''}>\${m}월</option>\`;
                }
            }
        }

        // =========================
        // 예산 관리
        // =========================
        let __budgetCache = [];

        function formatWon(n) {
            return (n || 0).toLocaleString('ko-KR') + '원';
        }

        async function loadBudgets() {
            const year = parseInt(document.getElementById('budget-year').value);
            const month = parseInt(document.getElementById('budget-month').value);
            if (!year || !month) return;
            try {
                // 당월 + 전월 조회 (전월 대비 비교용)
                const [curRes, prevRes] = await Promise.all([
                    axios.get(\`/api/budgets/\${year}/\${month}\`),
                    (function() {
                        let py = year, pm = month - 1;
                        if (pm < 1) { pm = 12; py = year - 1; }
                        return axios.get(\`/api/budgets/\${py}/\${pm}\`);
                    })()
                ]);
                __budgetCache = curRes.data || [];
                const prev = prevRes.data || [];

                renderBudgetSummary(__budgetCache, prev);
                renderBudgetList(__budgetCache);
            } catch (error) {
                console.error('예산 로드 실패', error);
            }
        }
        window.loadBudgets = loadBudgets;

        function renderBudgetSummary(cur, prev) {
            // 지출만 집계 (수입 개념은 사용하지 않음)
            const expense = cur.reduce((acc, b) => acc + (b.amount || 0), 0);
            const prevExpense = prev.reduce((acc, b) => acc + (b.amount || 0), 0);

            document.getElementById('budget-expense').textContent = formatWon(expense);

            const compareEl = document.getElementById('budget-compare');
            const compareSub = document.getElementById('budget-compare-sub');
            const diff = expense - prevExpense;
            compareSub.textContent = \`지난달 \${formatWon(prevExpense)}\`;
            if (prevExpense === 0 && expense === 0) {
                compareEl.textContent = '—';
                compareEl.className = 'text-2xl font-bold tabular-nums text-slate-500';
            } else if (diff > 0) {
                compareEl.textContent = '+' + formatWon(diff) + ' 더 나감';
                compareEl.className = 'text-2xl font-bold tabular-nums text-rose-600';
            } else if (diff < 0) {
                compareEl.textContent = formatWon(Math.abs(diff)) + ' 덜 나감';
                compareEl.className = 'text-2xl font-bold tabular-nums text-emerald-600';
            } else {
                compareEl.textContent = '동일';
                compareEl.className = 'text-2xl font-bold tabular-nums text-slate-500';
            }
        }

        function renderBudgetList(items) {
            const list = document.getElementById('budget-list');
            const empty = document.getElementById('budget-empty');
            if (!items || items.length === 0) {
                list.innerHTML = '';
                empty.classList.remove('hidden');
                return;
            }
            empty.classList.add('hidden');

            // 결제일 오름차순
            const sorted = [...items].sort((a, b) => {
                const da = a.budget_date || '9999-12-31';
                const db = b.budget_date || '9999-12-31';
                return da.localeCompare(db);
            });

            function esc(s) {
                return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            }

            let html = '';
            for (const b of sorted) {
                const dateStr = b.budget_date ? b.budget_date.slice(5).replace('-', '/') : '—';
                html += \`
                    <div class="grid grid-cols-12 gap-2 px-4 py-3 items-center text-sm hover:bg-slate-50">
                        <div class="col-span-2 text-slate-700 tabular-nums">\${dateStr}</div>
                        <div class="col-span-3 text-slate-700 truncate" title="\${esc(b.category)}">\${esc(b.category) || '—'}</div>
                        <div class="col-span-4 text-slate-700 truncate" title="\${esc(b.description)}">\${esc(b.description) || '—'}</div>
                        <div class="col-span-2 text-right font-bold tabular-nums text-rose-700">-\${formatWon(b.amount)}</div>
                        <div class="col-span-1 flex justify-end gap-1">
                            <button data-action="edit" data-id="\${b.id}" title="수정" class="w-7 h-7 flex items-center justify-center rounded-md text-indigo-600 hover:bg-indigo-100">
                                <i class="fas fa-pen text-xs"></i>
                            </button>
                            <button data-action="delete" data-id="\${b.id}" title="삭제" class="w-7 h-7 flex items-center justify-center rounded-md text-rose-600 hover:bg-rose-100">
                                <i class="fas fa-trash text-xs"></i>
                            </button>
                        </div>
                    </div>
                \`;
            }
            list.innerHTML = html;

            if (!list.__budgetBound) {
                list.addEventListener('click', function(e) {
                    const btn = e.target.closest('button[data-action]');
                    if (!btn) return;
                    const id = parseInt(btn.dataset.id);
                    if (btn.dataset.action === 'edit') openEditBudgetModal(id);
                    else if (btn.dataset.action === 'delete') deleteBudget(id);
                });
                list.__budgetBound = true;
            }
        }

        async function deleteBudget(id) {
            const item = __budgetCache.find(x => x.id === id);
            const label = item ? (item.description || item.category || '항목') : '항목';
            if (!confirm(\`'\${label}'을(를) 삭제하시겠습니까?\`)) return;
            try {
                await axios.delete(\`/api/budgets/\${id}\`);
                loadBudgets();
            } catch (error) {
                alert('삭제 실패: ' + (error.response?.data?.error || error.message));
            }
        }

        window.openAddBudgetModal = function() {
            document.getElementById('budget-modal-title').innerHTML = '<i class="fas fa-plus-circle text-emerald-500 mr-2"></i>예산 항목 추가';
            document.getElementById('budget-edit-id').value = '';
            document.getElementById('budget-category-input').value = '';
            document.getElementById('budget-description-input').value = '';
            document.getElementById('budget-amount-input').value = '0';
            // 기본 결제일 = 선택된 년/월의 오늘 일자
            const y = document.getElementById('budget-year').value;
            const m = document.getElementById('budget-month').value;
            const now = new Date();
            const day = String(now.getDate()).padStart(2, '0');
            document.getElementById('budget-date-input').value = \`\${y}-\${String(m).padStart(2, '0')}-\${day}\`;
            document.getElementById('budget-modal').classList.remove('hidden');
            setTimeout(() => document.getElementById('budget-category-input').focus(), 50);
        };

        window.openEditBudgetModal = function(id) {
            const b = __budgetCache.find(x => x.id === id);
            if (!b) return;
            document.getElementById('budget-modal-title').innerHTML = '<i class="fas fa-pen text-emerald-500 mr-2"></i>예산 항목 수정';
            document.getElementById('budget-edit-id').value = String(id);
            document.getElementById('budget-category-input').value = b.category || '';
            document.getElementById('budget-description-input').value = b.description || '';
            document.getElementById('budget-amount-input').value = String(b.amount || 0);
            document.getElementById('budget-date-input').value = b.budget_date || '';
            document.getElementById('budget-modal').classList.remove('hidden');
        };

        window.closeBudgetModal = function() {
            document.getElementById('budget-modal').classList.add('hidden');
        };

        window.saveBudget = async function() {
            const id = document.getElementById('budget-edit-id').value;
            const category = document.getElementById('budget-category-input').value.trim();
            const description = document.getElementById('budget-description-input').value.trim();
            const amount = parseInt(document.getElementById('budget-amount-input').value) || 0;
            const budgetDate = document.getElementById('budget-date-input').value;

            if (!category && !description) {
                alert('카테고리나 내용 중 하나는 입력해주세요');
                return;
            }
            if (amount <= 0) {
                alert('금액을 입력해주세요');
                return;
            }

            // 결제일이 있으면 그 달로 귀속, 없으면 탭에서 선택한 달로
            let year, month;
            if (budgetDate) {
                const [y, m] = budgetDate.split('-');
                year = parseInt(y);
                month = parseInt(m);
            } else {
                year = parseInt(document.getElementById('budget-year').value);
                month = parseInt(document.getElementById('budget-month').value);
            }

            try {
                if (id) {
                    await axios.put(\`/api/budgets/\${id}\`, {
                        type: 'expense', category, description, amount,
                        budget_date: budgetDate || null
                    });
                } else {
                    await axios.post('/api/budgets', {
                        year, month, type: 'expense', category, description, amount,
                        budget_date: budgetDate || null
                    });
                }
                closeBudgetModal();
                // 연/월이 변경됐을 수 있으므로 탭 셀렉터 동기화 후 reload
                if (year && month) {
                    document.getElementById('budget-year').value = String(year);
                    document.getElementById('budget-month').value = String(month);
                }
                loadBudgets();
            } catch (error) {
                alert('저장 실패: ' + (error.response?.data?.error || error.message));
            }
        };

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
