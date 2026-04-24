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
  // 구버전 클라이언트 호환 — 옛날 JS가 /api/tasks/:id/logs 로 GET 요청하면
  // year=:id, month='logs' 로 파싱되므로 여기서 감지해서 로그 핸들러로 위임
  if (c.req.param('month') === 'logs') {
    const db2 = c.env.DB
    await ensureTaskLogsTable(db2)
    const tid = parseInt(c.req.param('year'))
    if (!tid || isNaN(tid)) return c.json({ error: 'Invalid task id' }, 400)
    const r = await db2.prepare(
      'SELECT * FROM task_logs WHERE task_id = ? ORDER BY created_at DESC, id DESC'
    ).bind(tid).all()
    return c.json(r.results)
  }

  const db = c.env.DB
  await ensureTasksTable(db)
  const year = parseInt(c.req.param('year'))
  const month = parseInt(c.req.param('month'))

  await ensureSubtasksTable(db)
  const result = await db.prepare(`
    SELECT t.*, h.name as hospital_name,
      (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id) AS subtask_total,
      (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id AND s.is_completed = 1) AS subtask_done
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

// 작업 순서 재정렬 — 전달받은 id 배열 순서대로 order_index 를 0,1,2... 로 기록한다.
// 작업 현황에서 진행 예정인 작업을 위/아래로 옮길 때 사용된다.
app.post('/api/tasks/reorder', async (c) => {
  const db = c.env.DB
  await ensureTasksTable(db)
  const { ids } = await c.req.json()

  if (!Array.isArray(ids) || ids.length === 0) {
    return c.json({ error: 'ids 배열 필수' }, 400)
  }

  const stmt = db.prepare('UPDATE tasks SET order_index = ? WHERE id = ?')
  const batch = ids
    .map((raw: any, idx: number) => {
      const id = parseInt(raw)
      if (!id || isNaN(id)) return null
      return stmt.bind(idx, id)
    })
    .filter((s: any) => s !== null)

  if (batch.length === 0) return c.json({ error: '유효한 id 가 없음' }, 400)

  await db.batch(batch)
  return c.json({ success: true, updated: batch.length })
})

// =========================
// 하위 작업 (subtasks) API
// 상위 작업 하나에 여러 하위 작업이 소속되며,
// 하위 작업의 완료 비율로 상위 작업의 진척률이 자동 재계산된다.
// =========================

async function ensureSubtasksTable(db: any) {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS subtasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        is_completed INTEGER NOT NULL DEFAULT 0,
        order_index INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run()
  } catch (e) {}
}

// 상위 작업의 progress(0~4)를 하위 작업의 완료 비율로 재계산
// 하위 작업이 없으면 아무것도 하지 않음(기존 수동 진척률 유지)
async function recalcTaskProgressFromSubtasks(db: any, taskId: number): Promise<number | null> {
  const row: any = await db.prepare(
    'SELECT COUNT(*) AS total, SUM(CASE WHEN is_completed = 1 THEN 1 ELSE 0 END) AS done FROM subtasks WHERE task_id = ?'
  ).bind(taskId).first()
  const total = Number(row?.total || 0)
  if (total === 0) return null
  const done = Number(row?.done || 0)
  // 완료 비율을 0~4 단계로 변환 (0% → 0, 100% → 4)
  const step = Math.max(0, Math.min(4, Math.round((done / total) * 4)))
  await db.prepare('UPDATE tasks SET progress = ? WHERE id = ?').bind(step, taskId).run()
  return step
}

// 특정 상위 작업의 하위 작업 목록
app.get('/api/subtasks/:taskId', async (c) => {
  const db = c.env.DB
  await ensureSubtasksTable(db)
  const taskId = parseInt(c.req.param('taskId'))
  if (!taskId || isNaN(taskId)) return c.json({ error: 'Invalid task id' }, 400)
  const result = await db.prepare(
    'SELECT * FROM subtasks WHERE task_id = ? ORDER BY order_index, id'
  ).bind(taskId).all()
  return c.json(result.results)
})

// 하위 작업 추가
app.post('/api/subtasks', async (c) => {
  const db = c.env.DB
  await ensureSubtasksTable(db)
  const { task_id, name, is_completed } = await c.req.json()
  const taskId = parseInt(task_id)
  if (!taskId || isNaN(taskId)) return c.json({ error: 'task_id 필수' }, 400)
  if (!name || !name.toString().trim()) return c.json({ error: 'name 필수' }, 400)

  const lastOrder: any = await db.prepare(
    'SELECT MAX(order_index) AS max_order FROM subtasks WHERE task_id = ?'
  ).bind(taskId).first()
  const orderIndex = ((lastOrder?.max_order as number) ?? -1) + 1

  const result = await db.prepare(
    'INSERT INTO subtasks (task_id, name, is_completed, order_index) VALUES (?, ?, ?, ?)'
  ).bind(taskId, name.toString().trim(), is_completed ? 1 : 0, orderIndex).run()

  const step = await recalcTaskProgressFromSubtasks(db, taskId)
  return c.json({ success: true, id: result.meta.last_row_id, task_progress: step })
})

// 하위 작업 수정 (이름 / 완료 여부)
app.put('/api/subtasks/:id', async (c) => {
  const db = c.env.DB
  await ensureSubtasksTable(db)
  const id = parseInt(c.req.param('id'))
  if (!id || isNaN(id)) return c.json({ error: 'Invalid id' }, 400)
  const data = await c.req.json()

  const fields: string[] = []
  const values: any[] = []
  if (data.name !== undefined) {
    const nm = (data.name || '').toString().trim()
    if (!nm) return c.json({ error: 'name 비어있음' }, 400)
    fields.push('name = ?'); values.push(nm)
  }
  if (data.is_completed !== undefined) {
    fields.push('is_completed = ?'); values.push(data.is_completed ? 1 : 0)
  }
  if (fields.length === 0) return c.json({ error: 'No fields to update' }, 400)

  values.push(id)
  await db.prepare(`UPDATE subtasks SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run()

  const row: any = await db.prepare('SELECT task_id FROM subtasks WHERE id = ?').bind(id).first()
  const taskId = row?.task_id as number | undefined
  const step = taskId ? await recalcTaskProgressFromSubtasks(db, taskId) : null
  return c.json({ success: true, task_id: taskId || null, task_progress: step })
})

// 하위 작업 삭제
app.delete('/api/subtasks/:id', async (c) => {
  const db = c.env.DB
  await ensureSubtasksTable(db)
  const id = parseInt(c.req.param('id'))
  if (!id || isNaN(id)) return c.json({ error: 'Invalid id' }, 400)
  const row: any = await db.prepare('SELECT task_id FROM subtasks WHERE id = ?').bind(id).first()
  const taskId = row?.task_id as number | undefined
  await db.prepare('DELETE FROM subtasks WHERE id = ?').bind(id).run()
  const step = taskId ? await recalcTaskProgressFromSubtasks(db, taskId) : null
  return c.json({ success: true, task_id: taskId || null, task_progress: step })
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
async function listTaskLogsHandler(c: any) {
  const db = c.env.DB
  await ensureTaskLogsTable(db)
  const taskId = parseInt(c.req.param('taskId') || c.req.param('id'))
  if (!taskId || isNaN(taskId)) return c.json({ error: 'Invalid task id' }, 400)
  const result = await db.prepare(
    'SELECT * FROM task_logs WHERE task_id = ? ORDER BY created_at DESC, id DESC'
  ).bind(taskId).all()
  return c.json(result.results)
}

async function createTaskLogHandler(c: any) {
  const db = c.env.DB
  await ensureTaskLogsTable(db)
  const taskId = parseInt(c.req.param('taskId') || c.req.param('id'))
  const { progress, note } = await c.req.json()
  if (!taskId || isNaN(taskId)) return c.json({ error: 'Invalid task id' }, 400)

  const p = Math.max(0, Math.min(4, parseInt(progress) || 0))
  const result = await db.prepare(
    'INSERT INTO task_logs (task_id, progress, note) VALUES (?, ?, ?)'
  ).bind(taskId, p, (note || '').toString()).run()

  return c.json({ success: true, id: result.meta.last_row_id })
}

app.get('/api/task-logs/list/:taskId', listTaskLogsHandler)
app.post('/api/task-logs/create/:taskId', createTaskLogHandler)
// 구버전 경로도 유지 (브라우저가 옛 HTML 캐시를 쥐고 있을 때를 대비)
// 주의: GET /api/tasks/:id/logs 는 /api/tasks/:year/:month 에 가려지므로
// 명시적으로 핸들러를 연결해도 월별 리스트가 먼저 매칭됨. POST만 별칭 유지.
app.post('/api/tasks/:id/logs', createTaskLogHandler)

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
        payment_type TEXT NOT NULL DEFAULT 'onetime',
        carry_over INTEGER NOT NULL DEFAULT 1,
        stop_year INTEGER,
        stop_month INTEGER,
        ai_provider TEXT,
        is_paid INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run()
  } catch (e) {}
  // 기존 배포 DB에 컬럼이 없으면 추가
  try {
    await db.prepare(`ALTER TABLE budgets ADD COLUMN payment_type TEXT NOT NULL DEFAULT 'onetime'`).run()
  } catch (e) {}
  try {
    await db.prepare(`ALTER TABLE budgets ADD COLUMN carry_over INTEGER NOT NULL DEFAULT 1`).run()
  } catch (e) {}
  try {
    await db.prepare(`ALTER TABLE budgets ADD COLUMN stop_year INTEGER`).run()
  } catch (e) {}
  try {
    await db.prepare(`ALTER TABLE budgets ADD COLUMN stop_month INTEGER`).run()
  } catch (e) {}
  try {
    await db.prepare(`ALTER TABLE budgets ADD COLUMN ai_provider TEXT`).run()
  } catch (e) {}
  try {
    await db.prepare(`ALTER TABLE budgets ADD COLUMN is_paid INTEGER NOT NULL DEFAULT 0`).run()
  } catch (e) {}
  try {
    // 대표님 결제 승인 워크플로우: 'pending' (승인 대기) / 'approved' (승인 완료)
    // DEFAULT 'approved' 로 두어, 컬럼 추가 시점에 존재하던 기존 행은 자동 승인 처리된다.
    await db.prepare(`ALTER TABLE budgets ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved'`).run()
  } catch (e) {}
  // 기존 'gemini' 데이터를 'gpt' 로 마이그레이션 (리네이밍)
  try {
    await db.prepare(`UPDATE budgets SET ai_provider = 'gpt' WHERE ai_provider = 'gemini'`).run()
  } catch (e) {}
}

function normalizePaymentType(v: any): string {
  return v === 'recurring' ? 'recurring' : 'onetime'
}

// AI 제공자 정규화: 'claude' | 'gpt' | null
// 구 데이터/구 클라이언트 호환을 위해 'gemini' 입력도 'gpt' 로 변환한다.
function normalizeAiProvider(v: any): string | null {
  if (v === null || v === undefined || v === '') return null
  const s = String(v).toLowerCase().trim()
  if (s === 'claude') return 'claude'
  if (s === 'gpt' || s === 'gemini') return 'gpt'
  return null
}

// 월별 예산 항목 조회
// 기본 동작: 정기결제/수시결제 모두 다음달부터도 자동으로 노출 (carry_over=1).
// - 원본은 (year, month) 기준이지만, 이후 달에는 '이월 항목'으로 함께 표시된다.
// - stop_year/stop_month 가 설정되면 그 달까지만 노출, 이후로는 숨김.
// - 사용자가 이월 항목을 해당 달에서 삭제하면 stop_year/month 를 직전 달로 세팅해
//   그 달부터는 더 이상 나타나지 않도록 한다 (DELETE 엔드포인트 처리).
app.get('/api/budgets/:year/:month', async (c) => {
  const db = c.env.DB
  await ensureBudgetsTable(db)
  const year = parseInt(c.req.param('year'))
  const month = parseInt(c.req.param('month'))
  const key = year * 12 + month

  const result = await db.prepare(`
    SELECT b.*, h.name as hospital_name,
      CASE WHEN b.year = ? AND b.month = ? THEN 0 ELSE 1 END AS is_carryover
    FROM budgets b
    LEFT JOIN hospitals h ON b.hospital_id = h.id
    WHERE
      (b.year = ? AND b.month = ?)
      OR (
        b.carry_over = 1
        AND (b.year * 12 + b.month) < ?
        AND (b.stop_year IS NULL OR (b.stop_year * 12 + b.stop_month) >= ?)
      )
    ORDER BY is_carryover, b.budget_date, b.id
  `).bind(year, month, year, month, key, key).all()

  return c.json(result.results)
})

// 예산 항목 추가
// carry_over (기본 1): 1이면 다음 달부터도 자동으로 목록에 표시된다.
// 정기결제/수시결제 구분 없이 둘 다 기본값은 이월(=다음달 자동 표시)이다.
app.post('/api/budgets', async (c) => {
  const db = c.env.DB
  await ensureBudgetsTable(db)
  const { year, month, type, category, description, amount, hospital_id, budget_date, payment_type, carry_over, ai_provider, is_paid, approval_status } = await c.req.json()

  if (!year || !month) {
    return c.json({ error: 'year, month 필수' }, 400)
  }
  const t = type === 'income' ? 'income' : 'expense'
  const amt = parseMoneyAmount(amount)
  const pt = normalizePaymentType(payment_type)
  const co = carry_over === 0 || carry_over === false ? 0 : 1
  const ap = normalizeAiProvider(ai_provider)
  const paid = is_paid === 1 || is_paid === true ? 1 : 0
  // 승인 상태: 명시적으로 지정되면 그 값을 사용, 아니면 결제 완료는 'approved', 그 외엔 'pending'
  // (결제가 이미 완료된 항목은 당연히 승인된 것으로 간주)
  const approval = approval_status === 'approved' || approval_status === 'pending'
    ? approval_status
    : (paid ? 'approved' : 'pending')

  const result = await db.prepare(`
    INSERT INTO budgets (year, month, type, category, description, amount, hospital_id, budget_date, payment_type, carry_over, ai_provider, is_paid, approval_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    year, month, t,
    category || '',
    description || '',
    amt,
    hospital_id || null,
    budget_date || null,
    pt,
    co,
    ap,
    paid,
    approval
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
  if (data.amount !== undefined) { fields.push('amount = ?'); values.push(parseMoneyAmount(data.amount)) }
  if (data.hospital_id !== undefined) { fields.push('hospital_id = ?'); values.push(data.hospital_id || null) }
  if (data.budget_date !== undefined) { fields.push('budget_date = ?'); values.push(data.budget_date || null) }
  if (data.payment_type !== undefined) { fields.push('payment_type = ?'); values.push(normalizePaymentType(data.payment_type)) }
  if (data.carry_over !== undefined) { fields.push('carry_over = ?'); values.push(data.carry_over ? 1 : 0) }
  if (data.stop_year !== undefined) { fields.push('stop_year = ?'); values.push(data.stop_year === null ? null : parseInt(data.stop_year)) }
  if (data.stop_month !== undefined) { fields.push('stop_month = ?'); values.push(data.stop_month === null ? null : parseInt(data.stop_month)) }
  if (data.ai_provider !== undefined) { fields.push('ai_provider = ?'); values.push(normalizeAiProvider(data.ai_provider)) }
  if (data.is_paid !== undefined) {
    const paid = data.is_paid === 1 || data.is_paid === true ? 1 : 0
    fields.push('is_paid = ?'); values.push(paid)
    // 결제 완료로 바뀌면 승인 상태도 자동 'approved' 로 동기화 (명시적 승인 지정이 없을 때만)
    if (paid === 1 && data.approval_status === undefined) {
      fields.push('approval_status = ?'); values.push('approved')
    }
  }
  if (data.approval_status !== undefined) {
    const v = data.approval_status === 'approved' ? 'approved' : 'pending'
    fields.push('approval_status = ?'); values.push(v)
  }

  if (fields.length === 0) return c.json({ error: 'No fields to update' }, 400)

  values.push(id)
  await db.prepare(`UPDATE budgets SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run()
  return c.json({ success: true })
})

// 예산 항목 삭제
// 쿼리 파라미터 ?viewed_year=&viewed_month= 가 주어지면, 해당 월 기준으로 판단:
// - 원본 행의 달 == 보고있는 달 → 하드 삭제
// - 보고있는 달이 원본보다 뒤 (이월 항목을 삭제) → 원본의 stop_year/month 를
//   보고있는 달의 직전 달로 세팅해 앞으로 더 이상 이월되지 않게 함 (원본은 보존)
app.delete('/api/budgets/:id', async (c) => {
  const db = c.env.DB
  await ensureBudgetsTable(db)
  const id = parseInt(c.req.param('id'))
  if (!id || isNaN(id)) return c.json({ error: 'Invalid id' }, 400)

  const vy = parseInt(c.req.query('viewed_year') || '')
  const vm = parseInt(c.req.query('viewed_month') || '')

  const row: any = await db.prepare('SELECT year, month FROM budgets WHERE id = ?').bind(id).first()
  if (!row) return c.json({ error: 'Not found' }, 404)

  const rowKey = (row.year as number) * 12 + (row.month as number)
  const viewKey = vy && vm ? vy * 12 + vm : rowKey

  if (viewKey > rowKey) {
    // 이월 항목을 특정 달에서 '여기서부터 그만' 처리
    let sy = vy
    let sm = vm - 1
    if (sm < 1) { sm = 12; sy = vy - 1 }
    await db.prepare('UPDATE budgets SET stop_year = ?, stop_month = ? WHERE id = ?')
      .bind(sy, sm, id).run()
    return c.json({ success: true, mode: 'stopped', stop_year: sy, stop_month: sm })
  }

  await db.prepare('DELETE FROM budgets WHERE id = ?').bind(id).run()
  return c.json({ success: true, mode: 'deleted' })
})

// =========================
// AI 사용량 API (Claude / GPT 일자별 실사용 기록)
// 충전(budgets.수시결제)과 별도로 실제 소비량만 기록한다.
// =========================

async function ensureAiUsageTable(db: any) {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS ai_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usage_date TEXT NOT NULL,
        provider TEXT NOT NULL,
        amount REAL NOT NULL DEFAULT 0,
        note TEXT NOT NULL DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run()
  } catch (e) {}
}

function normalizeAiUsageProvider(v: any): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).toLowerCase().trim()
  if (s === 'claude') return 'claude'
  if (s === 'gpt' || s === 'gemini') return 'gpt'
  return null
}

// USD 금액 정규화 — 음수 방지 + 소수점 2자리까지
function parseMoneyAmount(v: any): number {
  const n = parseFloat(v)
  if (!isFinite(n) || n < 0) return 0
  return Math.round(n * 100) / 100
}

// 월별 AI 사용 내역 조회
app.get('/api/ai-usage/:year/:month', async (c) => {
  const db = c.env.DB
  await ensureAiUsageTable(db)
  const year = parseInt(c.req.param('year'))
  const month = parseInt(c.req.param('month'))
  if (!year || !month) return c.json({ error: 'year/month 필수' }, 400)

  const yStr = String(year)
  const mStr = String(month).padStart(2, '0')

  const result = await db.prepare(`
    SELECT * FROM ai_usage
    WHERE substr(usage_date, 1, 4) = ? AND substr(usage_date, 6, 2) = ?
    ORDER BY usage_date, id
  `).bind(yStr, mStr).all()

  return c.json(result.results)
})

// AI 사용 내역 추가
app.post('/api/ai-usage', async (c) => {
  const db = c.env.DB
  await ensureAiUsageTable(db)
  const { usage_date, provider, amount, note } = await c.req.json()

  if (!usage_date) return c.json({ error: 'usage_date 필수 (YYYY-MM-DD)' }, 400)
  const prov = normalizeAiUsageProvider(provider)
  if (!prov) return c.json({ error: "provider 는 'claude' 또는 'gpt'" }, 400)
  const amt = parseMoneyAmount(amount)

  const result = await db.prepare(
    'INSERT INTO ai_usage (usage_date, provider, amount, note) VALUES (?, ?, ?, ?)'
  ).bind(usage_date, prov, amt, (note || '').toString()).run()

  return c.json({ success: true, id: result.meta.last_row_id })
})

// AI 사용 내역 수정
app.put('/api/ai-usage/:id', async (c) => {
  const db = c.env.DB
  await ensureAiUsageTable(db)
  const id = parseInt(c.req.param('id'))
  if (!id || isNaN(id)) return c.json({ error: 'Invalid id' }, 400)
  const data = await c.req.json()

  const fields: string[] = []
  const values: any[] = []
  if (data.usage_date !== undefined) { fields.push('usage_date = ?'); values.push(String(data.usage_date)) }
  if (data.provider !== undefined) {
    const prov = normalizeAiUsageProvider(data.provider)
    if (!prov) return c.json({ error: "provider 는 'claude' 또는 'gpt'" }, 400)
    fields.push('provider = ?'); values.push(prov)
  }
  if (data.amount !== undefined) { fields.push('amount = ?'); values.push(parseMoneyAmount(data.amount)) }
  if (data.note !== undefined) { fields.push('note = ?'); values.push((data.note || '').toString()) }

  if (fields.length === 0) return c.json({ error: 'No fields to update' }, 400)

  values.push(id)
  await db.prepare(`UPDATE ai_usage SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run()
  return c.json({ success: true })
})

// AI 사용 내역 삭제
app.delete('/api/ai-usage/:id', async (c) => {
  const db = c.env.DB
  await ensureAiUsageTable(db)
  const id = parseInt(c.req.param('id'))
  if (!id || isNaN(id)) return c.json({ error: 'Invalid id' }, 400)
  await db.prepare('DELETE FROM ai_usage WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// Claude / GPT 전체 누적 잔액 — (충전 총합) - (사용 총합)
// 충전: budgets.ai_provider = 'claude' | 'gpt' (수시결제, 이월 등 무관하게 원본 1회만 집계)
// 사용: ai_usage.provider = 'claude' | 'gpt'
// 구버전 'gemini' 데이터도 함께 집계한다 (마이그레이션 중 잔존분 대비).
app.get('/api/ai-balance', async (c) => {
  const db = c.env.DB
  await ensureBudgetsTable(db)
  await ensureAiUsageTable(db)

  const row: any = await db.prepare(`
    SELECT
      (SELECT COALESCE(SUM(amount), 0) FROM budgets WHERE ai_provider = 'claude')              AS claude_topup,
      (SELECT COALESCE(SUM(amount), 0) FROM ai_usage WHERE provider = 'claude')                AS claude_usage,
      (SELECT COALESCE(SUM(amount), 0) FROM budgets WHERE ai_provider IN ('gpt','gemini'))     AS gpt_topup,
      (SELECT COALESCE(SUM(amount), 0) FROM ai_usage WHERE provider IN ('gpt','gemini'))       AS gpt_usage
  `).first()

  const ct = Number(row?.claude_topup || 0)
  const cu = Number(row?.claude_usage || 0)
  const gt = Number(row?.gpt_topup || 0)
  const gu = Number(row?.gpt_usage || 0)
  const round = (n: number) => Math.round(n * 100) / 100

  return c.json({
    claude: { topup: round(ct), usage: round(cu), balance: round(ct - cu) },
    gpt:    { topup: round(gt), usage: round(gu), balance: round(gt - gu) }
  })
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
                <p class="text-white text-opacity-90">AI 기반 스마트 업무 스케줄 관리 시스템 <span class="text-[10px] text-white/60 ml-2">v2026.04.23-unpaid-panel</span></p>
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
                        <i class="fas fa-dollar-sign mr-2 text-emerald-500"></i>예산 관리
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
                <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                    <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <div class="text-xs text-blue-700 font-semibold mb-1"><i class="fas fa-sync-alt mr-1"></i>정기결제</div>
                        <div id="budget-recurring" class="text-xl font-bold text-blue-700 tabular-nums">$0</div>
                    </div>
                    <div class="bg-amber-50 border border-amber-200 rounded-lg p-4">
                        <div class="text-xs text-amber-700 font-semibold mb-1"><i class="fas fa-credit-card mr-1"></i>수시결제</div>
                        <div id="budget-onetime" class="text-xl font-bold text-amber-700 tabular-nums">$0</div>
                    </div>
                    <div class="bg-rose-50 border border-rose-200 rounded-lg p-4">
                        <div class="text-xs text-rose-700 font-semibold mb-1"><i class="fas fa-coins mr-1"></i>이번 달 합계</div>
                        <div id="budget-expense" class="text-xl font-bold text-rose-700 tabular-nums">$0</div>
                    </div>
                    <button type="button" id="budget-unpaid-card"
                        class="text-left bg-red-50 border border-red-200 rounded-lg p-4 hover:bg-red-100 hover:border-red-300 transition-colors"
                        title="결제 승인 전 패널로 이동">
                        <div class="text-xs text-red-700 font-semibold mb-1"><i class="fas fa-hourglass-half mr-1"></i>결제 승인 전
                            <span id="budget-unpaid-count" class="ml-1 text-[10px] font-bold text-white bg-red-500 rounded-full px-1.5 py-0.5">0</span>
                        </div>
                        <div id="budget-unpaid" class="text-xl font-bold text-red-700 tabular-nums">$0</div>
                    </button>
                    <div class="bg-slate-50 border border-slate-200 rounded-lg p-4">
                        <div class="text-xs text-slate-600 font-semibold mb-1"><i class="fas fa-chart-line mr-1"></i>지난 달 대비</div>
                        <div id="budget-compare" class="text-xl font-bold text-slate-700 tabular-nums">—</div>
                        <div id="budget-compare-sub" class="text-[11px] text-slate-500 mt-0.5">지난달 $0</div>
                    </div>
                </div>

                <!-- AI 사용 현황 (Claude / GPT 일자별 실사용량 — 충전과 별개) -->
                <div id="budget-ai-usage" class="mb-4 bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-200 rounded-xl p-4">
                    <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
                        <h3 class="text-sm font-bold text-slate-800">
                            <i class="fas fa-chart-line mr-1.5 text-indigo-600"></i>AI 사용 현황
                            <span class="text-[11px] text-slate-500 font-medium ml-1">(일자별 실사용량 · 충전과 별개)</span>
                        </h3>
                        <div class="flex items-center gap-3 text-xs">
                            <span class="inline-flex items-center gap-1 text-slate-700">
                                <span class="w-2.5 h-2.5 rounded-full bg-orange-500"></span>
                                Claude <span class="text-[11px] text-slate-500">이번 달</span> <span id="budget-ai-claude-total" class="font-bold tabular-nums">$0.00</span>
                            </span>
                            <span class="inline-flex items-center gap-1 text-slate-700">
                                <span class="w-2.5 h-2.5 rounded-full bg-sky-500"></span>
                                GPT <span class="text-[11px] text-slate-500">이번 달</span> <span id="budget-ai-gpt-total" class="font-bold tabular-nums">$0.00</span>
                            </span>
                        </div>
                    </div>

                    <!-- 누적 충전 / 사용 / 잔액 요약 -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                        <div class="bg-white border border-orange-200 rounded-lg px-3 py-2">
                            <div class="flex items-center justify-between gap-2">
                                <div class="text-[11px] font-semibold text-orange-700">
                                    <i class="fas fa-robot mr-1"></i>Claude <span class="text-slate-400 font-normal">누적</span>
                                </div>
                                <div class="text-sm">
                                    잔액 <span id="ai-balance-claude-remain" class="tabular-nums font-bold text-emerald-600">$0.00</span>
                                </div>
                            </div>
                            <div class="text-[11px] text-slate-500 mt-0.5">
                                충전 <span id="ai-balance-claude-topup" class="tabular-nums font-semibold text-slate-700">$0.00</span>
                                <span class="mx-1 text-slate-300">·</span>
                                사용 <span id="ai-balance-claude-usage" class="tabular-nums font-semibold text-orange-700">$0.00</span>
                            </div>
                        </div>
                        <div class="bg-white border border-sky-200 rounded-lg px-3 py-2">
                            <div class="flex items-center justify-between gap-2">
                                <div class="text-[11px] font-semibold text-sky-700">
                                    <i class="fas fa-bolt mr-1"></i>GPT <span class="text-slate-400 font-normal">누적</span>
                                </div>
                                <div class="text-sm">
                                    잔액 <span id="ai-balance-gpt-remain" class="tabular-nums font-bold text-emerald-600">$0.00</span>
                                </div>
                            </div>
                            <div class="text-[11px] text-slate-500 mt-0.5">
                                충전 <span id="ai-balance-gpt-topup" class="tabular-nums font-semibold text-slate-700">$0.00</span>
                                <span class="mx-1 text-slate-300">·</span>
                                사용 <span id="ai-balance-gpt-usage" class="tabular-nums font-semibold text-sky-700">$0.00</span>
                            </div>
                        </div>
                    </div>

                    <div class="border border-indigo-100 rounded-lg overflow-hidden bg-white">
                        <div class="grid grid-cols-12 gap-2 bg-indigo-50/60 px-3 py-1.5 text-[11px] font-semibold text-slate-600">
                            <div class="col-span-3">날짜</div>
                            <div class="col-span-3 text-right">Claude</div>
                            <div class="col-span-3 text-right">GPT</div>
                            <div class="col-span-2 text-right">합계</div>
                            <div class="col-span-1 text-right">관리</div>
                        </div>
                        <!-- 신규 입력 행 -->
                        <div class="grid grid-cols-12 gap-2 px-3 py-2 items-center bg-amber-50/40 border-b border-amber-100">
                            <div class="col-span-3">
                                <input type="date" id="ai-add-date" class="w-full border border-slate-200 rounded px-2 py-1 text-xs focus:border-indigo-400 focus:outline-none">
                            </div>
                            <div class="col-span-3">
                                <input type="number" id="ai-add-claude" min="0" step="0.01" placeholder="Claude $" class="w-full border border-slate-200 rounded px-2 py-1 text-xs text-right focus:border-orange-400 focus:outline-none tabular-nums">
                            </div>
                            <div class="col-span-3">
                                <input type="number" id="ai-add-gpt" min="0" step="0.01" placeholder="GPT $" class="w-full border border-slate-200 rounded px-2 py-1 text-xs text-right focus:border-sky-400 focus:outline-none tabular-nums">
                            </div>
                            <div class="col-span-2"></div>
                            <div class="col-span-1 flex justify-end">
                                <button id="ai-add-btn" class="text-[11px] font-semibold bg-indigo-500 hover:bg-indigo-600 text-white rounded px-2 py-1 shadow-sm">
                                    <i class="fas fa-plus mr-0.5"></i>추가
                                </button>
                            </div>
                        </div>
                        <div id="budget-ai-usage-list" class="divide-y divide-indigo-50 text-xs tabular-nums"></div>
                        <div id="budget-ai-usage-empty" class="text-center text-slate-400 text-xs py-4 hidden">
                            아직 입력된 AI 사용 내역이 없습니다. 위 입력창에서 날짜와 금액을 적어주세요.
                        </div>
                    </div>
                </div>

                <!-- 결제 승인 전 (is_paid = 0 인 항목)
                     · 대표님 승인 대기: "승인" 버튼 — 눌러야 결제 허락이 떨어진 것
                     · 승인 완료 & 미결제: "완료" 버튼 — 결제 후 체크 -->
                <div id="budget-unpaid-panel" class="mb-4 bg-gradient-to-br from-red-50 to-orange-50 border border-red-200 rounded-xl p-4">
                    <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
                        <h3 class="text-sm font-bold text-slate-800">
                            <i class="fas fa-hourglass-half mr-1.5 text-red-600"></i>결제 승인 전
                            <span class="text-[11px] text-slate-500 font-medium ml-1">(대표님 "승인" → 결제 후 "완료")</span>
                        </h3>
                        <div class="flex items-center gap-3 text-xs">
                            <span class="inline-flex items-center gap-1 text-slate-700">
                                <span class="w-2.5 h-2.5 rounded-full bg-yellow-400"></span>
                                승인 대기 <span id="budget-unpaid-pending-count" class="font-bold tabular-nums">0</span>건
                            </span>
                            <span class="inline-flex items-center gap-1 text-slate-700">
                                <span class="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                                승인 완료 <span id="budget-unpaid-approved-count" class="font-bold tabular-nums">0</span>건
                            </span>
                            <span class="inline-flex items-center gap-1 text-slate-700">
                                합계 <span id="budget-unpaid-panel-sum" class="font-bold tabular-nums text-red-700">$0.00</span>
                            </span>
                        </div>
                    </div>

                    <div class="border border-red-100 rounded-lg overflow-hidden bg-white">
                        <div class="grid grid-cols-12 gap-2 bg-red-50/60 px-3 py-1.5 text-[11px] font-semibold text-slate-600">
                            <div class="col-span-2">결제일</div>
                            <div class="col-span-2">카테고리</div>
                            <div class="col-span-4">내용</div>
                            <div class="col-span-2 text-right">금액</div>
                            <div class="col-span-2 text-right">관리</div>
                        </div>
                        <!-- 신규 결제 요청 입력 행 (직원이 등록 → 승인 대기 상태로 들어감) -->
                        <div class="grid grid-cols-12 gap-2 px-3 py-2 items-center bg-amber-50/40 border-b border-amber-100">
                            <div class="col-span-2">
                                <input type="date" id="unpaid-add-date" class="w-full border border-slate-200 rounded px-2 py-1 text-xs focus:border-red-400 focus:outline-none">
                            </div>
                            <div class="col-span-2">
                                <input type="text" id="unpaid-add-category" placeholder="카테고리" class="w-full border border-slate-200 rounded px-2 py-1 text-xs focus:border-red-400 focus:outline-none">
                            </div>
                            <div class="col-span-4">
                                <input type="text" id="unpaid-add-description" placeholder="상세 내용" class="w-full border border-slate-200 rounded px-2 py-1 text-xs focus:border-red-400 focus:outline-none">
                            </div>
                            <div class="col-span-2">
                                <input type="number" id="unpaid-add-amount" min="0" step="0.01" placeholder="$" class="w-full border border-slate-200 rounded px-2 py-1 text-xs text-right focus:border-red-400 focus:outline-none tabular-nums">
                            </div>
                            <div class="col-span-2 flex justify-end">
                                <button id="unpaid-add-btn" class="text-[11px] font-semibold bg-red-500 hover:bg-red-600 text-white rounded px-2 py-1 shadow-sm">
                                    <i class="fas fa-plus mr-0.5"></i>추가
                                </button>
                            </div>
                        </div>
                        <div id="budget-unpaid-list" class="divide-y divide-red-50 text-xs"></div>
                        <div id="budget-unpaid-empty" class="text-center text-slate-400 text-xs py-4 hidden">
                            승인 전·결제 전 항목이 없습니다. 위 입력창에서 새 결제 요청을 등록해주세요.
                        </div>
                    </div>
                </div>

                <!-- 필터 탭 -->
                <div class="flex gap-1 mb-3 border-b border-slate-200">
                    <button data-budget-filter="all" class="budget-filter-tab px-4 py-2 text-sm font-semibold border-b-2 border-emerald-500 text-emerald-700">전체</button>
                    <button data-budget-filter="recurring" class="budget-filter-tab px-4 py-2 text-sm font-semibold border-b-2 border-transparent text-slate-500 hover:text-blue-600"><i class="fas fa-sync-alt mr-1"></i>정기결제</button>
                    <button data-budget-filter="onetime" class="budget-filter-tab px-4 py-2 text-sm font-semibold border-b-2 border-transparent text-slate-500 hover:text-amber-600"><i class="fas fa-credit-card mr-1"></i>수시결제</button>
                </div>

                <!-- 예산 항목 목록 -->
                <div class="border border-slate-200 rounded-lg overflow-hidden">
                    <div class="grid grid-cols-12 gap-2 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">
                        <div class="col-span-2">결제일</div>
                        <div class="col-span-2">유형</div>
                        <div class="col-span-2">카테고리</div>
                        <div class="col-span-3">내용</div>
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
                        <label class="block text-sm font-medium text-gray-700 mb-2">결제 유형</label>
                        <div id="budget-payment-type-input" class="flex gap-2" data-value="onetime">
                            <button type="button" data-pt="recurring" class="flex-1 py-2 rounded-lg border-2 text-sm font-semibold transition-colors">
                                <i class="fas fa-sync-alt mr-1.5"></i>정기결제
                            </button>
                            <button type="button" data-pt="onetime" class="flex-1 py-2 rounded-lg border-2 text-sm font-semibold transition-colors">
                                <i class="fas fa-credit-card mr-1.5"></i>수시결제
                            </button>
                        </div>
                        <div class="text-[11px] text-slate-500 mt-1">정기결제: 매월 자동 결제 / 수시결제: 크레딧·일회성 결제 · 두 유형 모두 기본으로 다음 달에도 자동 표시됩니다.</div>
                    </div>
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
                            <label class="block text-sm font-medium text-gray-700 mb-1">금액 ($)</label>
                            <input type="number" id="budget-amount-input" min="0" step="0.01" value="0" class="w-full border-2 border-slate-200 rounded-lg px-4 py-2 focus:border-emerald-400 focus:outline-none tabular-nums">
                        </div>
                    </div>
                    <div class="mb-3">
                        <label class="block text-sm font-medium text-gray-700 mb-1">내용</label>
                        <input type="text" id="budget-description-input" placeholder="상세 내용" class="w-full border-2 border-slate-200 rounded-lg px-4 py-2 focus:border-emerald-400 focus:outline-none">
                    </div>
                    <div class="mb-3">
                        <label class="block text-sm font-medium text-gray-700 mb-2">AI 충전 구분 (선택)</label>
                        <div id="budget-ai-provider-input" class="flex gap-2" data-value="">
                            <button type="button" data-ap="" class="flex-1 py-2 rounded-lg border-2 text-xs font-semibold transition-colors">
                                <i class="fas fa-ban mr-1"></i>해당 없음
                            </button>
                            <button type="button" data-ap="claude" class="flex-1 py-2 rounded-lg border-2 text-xs font-semibold transition-colors">
                                <i class="fas fa-robot mr-1"></i>Claude 충전
                            </button>
                            <button type="button" data-ap="gpt" class="flex-1 py-2 rounded-lg border-2 text-xs font-semibold transition-colors">
                                <i class="fas fa-bolt mr-1"></i>GPT 충전
                            </button>
                        </div>
                        <div class="text-[11px] text-slate-500 mt-1">Claude/GPT 크레딧 충전 내역을 구분할 때 사용. 실제 일자별 사용량은 상단 "AI 사용 현황"에서 별도로 기록합니다.</div>
                    </div>
                    <div class="mb-3">
                        <label class="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                            <input type="checkbox" id="budget-carry-over-input" checked class="w-4 h-4 accent-emerald-500">
                            <span>다음 달부터도 자동 표시 (이월)</span>
                        </label>
                        <div class="text-[11px] text-slate-500 mt-1 pl-6">체크를 해제하면 이 달에만 표시됩니다.</div>
                    </div>
                    <div class="mb-4">
                        <label class="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                            <input type="checkbox" id="budget-is-paid-input" class="w-4 h-4 accent-green-500">
                            <span>결제 완료</span>
                        </label>
                        <div class="text-[11px] text-slate-500 mt-1 pl-6">체크하지 않으면 "결제 승인 전" 목록에 올라옵니다.</div>
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
                        <label class="block text-sm font-medium text-gray-700 mb-2">상태</label>
                        <div id="task-progress-input" class="flex gap-2" data-value="0">
                            <button type="button" data-p="0" class="flex-1 py-2 rounded-lg border-2 text-sm font-semibold transition-colors"><i class="far fa-circle mr-1.5"></i>진행 예정</button>
                            <button type="button" data-p="4" class="flex-1 py-2 rounded-lg border-2 text-sm font-semibold transition-colors"><i class="fas fa-check-circle mr-1.5"></i>완료</button>
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

            <!-- 하위 작업 (예정 목록 / 완료 체크 / 수정 / 삭제) -->
            <div class="flex-1 overflow-y-auto px-6 py-4">
                <div class="flex items-center justify-between mb-2">
                    <h4 class="text-sm font-bold text-slate-700">
                        <i class="fas fa-list-check text-slate-500 mr-1"></i>하위 작업
                        <span id="task-detail-subtask-count" class="text-xs text-slate-400 ml-1"></span>
                    </h4>
                </div>
                <div class="flex gap-2 mb-2">
                    <input type="text" id="task-detail-subtask-input" placeholder="예정된 하위 작업을 입력하고 Enter"
                        class="flex-1 border-2 border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none">
                    <button id="task-detail-subtask-add" class="bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-semibold shadow-sm">
                        <i class="fas fa-plus mr-1"></i>추가
                    </button>
                </div>
                <div id="task-detail-subtask-list" class="space-y-1.5"></div>
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

            // 작업의 표시 퍼센트 — 하위 작업이 있으면 그 완료 비율 우선
            function taskDisplayPct(t) {
                const sTotal = Number(t.subtask_total || 0);
                if (sTotal > 0) {
                    const sDone = Number(t.subtask_done || 0);
                    return Math.round((sDone / sTotal) * 100);
                }
                return PROGRESS_PCT[t.progress || 0];
            }

            // 전체 평균 진척률
            const total = filtered.length;
            const sumPct = filtered.reduce((acc, t) => acc + taskDisplayPct(t), 0);
            const overall = total > 0 ? Math.round(sumPct / total) : 0;
            const doneCount = filtered.filter(t => {
                const sTotal = Number(t.subtask_total || 0);
                if (sTotal > 0) return Number(t.subtask_done || 0) >= sTotal;
                return (t.progress || 0) >= 4;
            }).length;
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

            // 작업 상태 분류 — 진행 예정(0) / 진행 중(1) / 완료됨(2)
            function taskStatusBucket(t) {
                const sTotal = Number(t.subtask_total || 0);
                if (sTotal > 0) {
                    const sDone = Number(t.subtask_done || 0);
                    if (sDone >= sTotal) return 2; // 완료
                    if (sDone > 0) return 1; // 진행 중
                    return 0; // 하위 작업은 있지만 아직 시작 안 함 → 진행 예정
                }
                if ((t.progress || 0) >= 4) return 2;
                if ((t.progress || 0) > 0) return 1;
                return 0;
            }

            // 정렬:
            // 1) 진행 예정/진행 중 먼저, 완료됨은 아래로
            // 2) 같은 그룹 내에서는 order_index 기준 (사용자가 정한 순서 유지)
            const sorted = [...filtered].sort((a, b) => {
                const ba = taskStatusBucket(a);
                const bb = taskStatusBucket(b);
                if (ba !== bb) return ba - bb;
                const oa = Number(a.order_index ?? 0);
                const ob = Number(b.order_index ?? 0);
                if (oa !== ob) return oa - ob;
                return (a.id || 0) - (b.id || 0);
            });

            // 같은 상태 그룹 내에서의 첫/마지막 여부 — 화살표 버튼 비활성화용
            const bucketFirstIndex = new Map();
            const bucketLastIndex = new Map();
            sorted.forEach((t, idx) => {
                const bkt = taskStatusBucket(t);
                if (!bucketFirstIndex.has(bkt)) bucketFirstIndex.set(bkt, idx);
                bucketLastIndex.set(bkt, idx);
            });

            let html = '';
            for (let idx = 0; idx < sorted.length; idx++) {
                const t = sorted[idx];
                const step = Math.max(0, Math.min(4, t.progress || 0));
                const pct = taskDisplayPct(t);
                const sTotal = Number(t.subtask_total || 0);
                const sDone = Number(t.subtask_done || 0);
                const hasSubtasks = sTotal > 0;
                const allDone = hasSubtasks ? (sDone >= sTotal) : (step >= 4);
                const rowClasses = allDone
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-white border-slate-200 hover:border-indigo-300';
                const nameClass = allDone ? 'text-slate-500 line-through' : 'text-slate-800';
                const hospitalLabel = t.hospital_name ? \`<span class="text-[11px] text-slate-500 bg-slate-100 rounded px-1.5 py-0.5 ml-1">\${escText(t.hospital_name)}</span>\` : '';

                // 순서 이동 버튼 (완료된 작업은 숨김 — 주로 "진행 예정" 작업의 순서 조정에 사용)
                const bkt = taskStatusBucket(t);
                const isFirstInBucket = bucketFirstIndex.get(bkt) === idx;
                const isLastInBucket = bucketLastIndex.get(bkt) === idx;
                const reorderBtns = allDone ? '' : \`
                    <button data-action="moveup" data-id="\${t.id}" title="위로 이동" \${isFirstInBucket ? 'disabled' : ''} class="w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent">
                        <i class="fas fa-arrow-up text-xs"></i>
                    </button>
                    <button data-action="movedown" data-id="\${t.id}" title="아래로 이동" \${isLastInBucket ? 'disabled' : ''} class="w-7 h-7 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent">
                        <i class="fas fa-arrow-down text-xs"></i>
                    </button>
                \`;

                // 완료 토글 버튼 (완료: 기록 모달 열어서 100% 처리 / 완료됨: 확인 후 0%로 되돌림)
                // 하위 작업이 있으면 수동 완료 버튼 대신 하위 작업 열기 버튼을 보여준다 (진척률 자동 계산)
                let toggleBtn;
                if (hasSubtasks) {
                    toggleBtn = \`<button data-action="opensubtasks" data-id="\${t.id}" title="하위 작업 열기 (진척률은 하위 작업 완료 비율로 자동 계산)" class="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md bg-white border border-indigo-300 text-indigo-600 hover:bg-indigo-500 hover:border-indigo-500 hover:text-white transition-colors">
                            <i class="fas fa-list-check"></i>하위 작업
                       </button>\`;
                } else if (allDone) {
                    toggleBtn = \`<button data-action="uncomplete" data-id="\${t.id}" title="진행 예정으로 되돌리기" class="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white transition-colors">
                            <i class="fas fa-check-circle"></i>완료됨
                       </button>\`;
                } else {
                    toggleBtn = \`<button data-action="complete" data-id="\${t.id}" title="완료 처리 — 기록 입력" class="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md bg-white border border-indigo-300 text-indigo-600 hover:bg-indigo-500 hover:border-indigo-500 hover:text-white transition-colors">
                            <i class="far fa-circle"></i>완료
                       </button>\`;
                }
                const statusLabel = allDone
                    ? '<span class="text-[11px] font-semibold text-emerald-600"><i class="fas fa-check mr-1"></i>완료됨</span>'
                    : (hasSubtasks
                        ? \`<span class="text-[11px] font-medium text-slate-500">진행 중 · \${pct}%</span>\`
                        : '<span class="text-[11px] font-medium text-slate-500">진행 예정</span>');

                const subtaskBadge = hasSubtasks
                    ? \`<span class="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 rounded-full px-2 py-0.5 ml-1" title="하위 작업 \${sDone}/\${sTotal} 완료">
                            <i class="fas fa-list-check text-[10px]"></i>\${sDone}/\${sTotal}
                       </span>\`
                    : '';

                const subtaskBar = hasSubtasks
                    ? \`<div class="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div class="h-full \${progressBarColor(step)} transition-all duration-300" style="width: \${pct}%"></div>
                       </div>\`
                    : '';

                html += \`
                    <div class="group border \${rowClasses} rounded-lg p-3 transition-all cursor-pointer" data-task-card="\${t.id}" title="클릭하면 상세보기 (하위 작업 관리)">
                        <div class="flex items-center justify-between gap-2 mb-2">
                            <div class="flex items-center gap-2 min-w-0 flex-1">
                                \${allDone ? '<i class="fas fa-check-circle text-emerald-500 text-sm flex-shrink-0"></i>' : ''}
                                <span class="text-sm font-semibold truncate \${nameClass}" title="\${escAttr(t.name)}">\${escText(t.name)}</span>
                                \${hospitalLabel}
                                \${subtaskBadge}
                            </div>
                            <div class="flex items-center gap-1 flex-shrink-0">
                                \${reorderBtns}
                                <button data-action="edit" data-id="\${t.id}" title="수정" class="w-7 h-7 flex items-center justify-center rounded-md text-indigo-600 hover:bg-indigo-100 transition-colors">
                                    <i class="fas fa-pen text-xs"></i>
                                </button>
                                <button data-action="delete" data-id="\${t.id}" title="삭제" class="w-7 h-7 flex items-center justify-center rounded-md text-rose-600 hover:bg-rose-100 transition-colors">
                                    <i class="fas fa-trash text-xs"></i>
                                </button>
                            </div>
                        </div>
                        <div class="flex items-center justify-between gap-2 mt-1">
                            <div class="flex items-center gap-2">
                                \${toggleBtn}
                                \${statusLabel}
                            </div>
                        </div>
                        \${subtaskBar}
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
                        if (action === 'complete') {
                            completeTaskDirect(id);
                        } else if (action === 'uncomplete') {
                            uncompleteTask(id);
                        } else if (action === 'opensubtasks') {
                            openTaskDetailModal(id);
                        } else if (action === 'edit') {
                            openEditTaskModal(id);
                        } else if (action === 'delete') {
                            deleteTask(id);
                        } else if (action === 'moveup') {
                            moveTask(id, -1);
                        } else if (action === 'movedown') {
                            moveTask(id, 1);
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

        // =========================
        // 작업 상세 모달 (카드 클릭 — 하위 작업 관리)
        // =========================
        let __detailTaskId = null;

        window.openTaskDetailModal = async function(taskId) {
            const t = __tasksCache.find(x => x.id === taskId);
            if (!t) return;
            __detailTaskId = taskId;
            await ensureSubtasksLoaded(taskId);
            renderTaskDetail();
            document.getElementById('task-detail-modal').classList.remove('hidden');
            bindSubtaskInputOnce();
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
            const sTotal = Number(t.subtask_total || 0);
            const sDone = Number(t.subtask_done || 0);
            const hasSubtasks = sTotal > 0;
            const pct = hasSubtasks
                ? Math.round((sDone / sTotal) * 100)
                : PROGRESS_PCT[step];
            const allDone = hasSubtasks ? (sDone >= sTotal) : (step >= 4);

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

            // 하위 작업
            renderSubtaskList(t);
        }

        // =========================
        // 하위 작업 (subtasks)
        // 추가/완료 토글/수정/삭제 가능. 변경 시 상위 작업 진척률이 자동 재계산된다.
        // =========================
        async function ensureSubtasksLoaded(taskId) {
            const t = __tasksCache.find(x => x.id === taskId);
            if (!t) return;
            if (t.__subtasks !== undefined) return;
            try {
                const res = await axios.get(\`/api/subtasks/\${taskId}\`);
                t.__subtasks = res.data || [];
            } catch (e) {
                t.__subtasks = [];
            }
        }

        // 상위 작업 정보(진척률/카운트)를 서버 응답으로 갱신
        function applySubtaskResultToTask(taskId, result) {
            const t = __tasksCache.find(x => x.id === taskId);
            if (!t) return;
            if (result && typeof result.task_progress === 'number') {
                t.progress = result.task_progress;
            }
            // 카운트 재계산 (로컬 __subtasks 기반)
            const list = t.__subtasks || [];
            t.subtask_total = list.length;
            t.subtask_done = list.filter(s => s.is_completed).length;
        }

        function renderSubtaskList(t) {
            const listEl = document.getElementById('task-detail-subtask-list');
            const countEl = document.getElementById('task-detail-subtask-count');
            if (!listEl || !countEl) return;

            const subs = t.__subtasks;
            if (subs === undefined) {
                listEl.innerHTML = '<div class="text-sm text-slate-400 italic text-center py-3">불러오는 중...</div>';
                countEl.textContent = '';
                return;
            }

            const doneCount = subs.filter(s => s.is_completed).length;
            const total = subs.length;
            countEl.textContent = total > 0
                ? \`(\${doneCount}/\${total} · \${Math.round((doneCount / total) * 100)}%)\`
                : '';

            if (total === 0) {
                listEl.innerHTML = '<div class="text-sm text-slate-400 italic text-center py-4">아직 하위 작업이 없습니다. 위 입력창에 예정된 작업을 추가해보세요.</div>';
            } else {
                function escText(str) {
                    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                }
                function escAttr(str) {
                    return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                }
                let html = '';
                for (const s of subs) {
                    const done = !!s.is_completed;
                    const checkIcon = done
                        ? '<i class="fas fa-check-circle text-emerald-500"></i>'
                        : '<i class="far fa-circle text-slate-400"></i>';
                    const nameCls = done ? 'text-slate-400 line-through' : 'text-slate-700';
                    html += \`
                        <div class="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 group/sub hover:border-indigo-300 transition-colors">
                            <button data-sub-action="toggle" data-sub-id="\${s.id}" title="\${done ? '완료 해제' : '완료 처리'}"
                                class="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md hover:bg-slate-100">
                                \${checkIcon}
                            </button>
                            <span class="flex-1 text-sm \${nameCls} break-words" title="\${escAttr(s.name)}">\${escText(s.name)}</span>
                            <div class="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover/sub:opacity-100 transition-opacity">
                                <button data-sub-action="edit" data-sub-id="\${s.id}" title="이름 수정"
                                    class="w-7 h-7 flex items-center justify-center rounded text-indigo-600 hover:bg-indigo-100">
                                    <i class="fas fa-pen text-xs"></i>
                                </button>
                                <button data-sub-action="delete" data-sub-id="\${s.id}" title="삭제"
                                    class="w-7 h-7 flex items-center justify-center rounded text-rose-600 hover:bg-rose-100">
                                    <i class="fas fa-trash text-xs"></i>
                                </button>
                            </div>
                        </div>
                    \`;
                }
                listEl.innerHTML = html;
            }

            if (!listEl.__subBound) {
                listEl.addEventListener('click', async function(e) {
                    const btn = e.target.closest('button[data-sub-action]');
                    if (!btn) return;
                    const subId = parseInt(btn.dataset.subId);
                    const action = btn.dataset.subAction;
                    if (action === 'toggle') {
                        await toggleSubtask(subId);
                    } else if (action === 'edit') {
                        await renameSubtask(subId);
                    } else if (action === 'delete') {
                        await deleteSubtask(subId);
                    }
                });
                listEl.__subBound = true;
            }
        }

        async function addSubtaskFromInput() {
            if (__detailTaskId === null) return;
            const taskId = __detailTaskId;
            const input = document.getElementById('task-detail-subtask-input');
            const name = (input.value || '').trim();
            if (!name) return;
            try {
                const res = await axios.post('/api/subtasks', { task_id: taskId, name });
                const t = __tasksCache.find(x => x.id === taskId);
                if (t) {
                    if (!Array.isArray(t.__subtasks)) t.__subtasks = [];
                    t.__subtasks.push({
                        id: res.data?.id,
                        task_id: taskId,
                        name,
                        is_completed: 0,
                        order_index: t.__subtasks.length,
                    });
                    applySubtaskResultToTask(taskId, res.data);
                }
                input.value = '';
                renderTaskDetail();
                renderTasks();
            } catch (error) {
                alert('하위 작업 추가 실패: ' + (error.response?.data?.error || error.message));
            }
        }

        async function toggleSubtask(subId) {
            if (__detailTaskId === null) return;
            const taskId = __detailTaskId;
            const t = __tasksCache.find(x => x.id === taskId);
            if (!t || !Array.isArray(t.__subtasks)) return;
            const s = t.__subtasks.find(x => x.id === subId);
            if (!s) return;
            const next = s.is_completed ? 0 : 1;
            try {
                const res = await axios.put(\`/api/subtasks/\${subId}\`, { is_completed: next });
                s.is_completed = next;
                applySubtaskResultToTask(taskId, res.data);
                renderTaskDetail();
                renderTasks();
            } catch (error) {
                alert('하위 작업 상태 변경 실패: ' + (error.response?.data?.error || error.message));
            }
        }

        async function renameSubtask(subId) {
            if (__detailTaskId === null) return;
            const taskId = __detailTaskId;
            const t = __tasksCache.find(x => x.id === taskId);
            if (!t || !Array.isArray(t.__subtasks)) return;
            const s = t.__subtasks.find(x => x.id === subId);
            if (!s) return;
            const next = prompt('하위 작업 이름을 수정하세요', s.name);
            if (next === null) return;
            const trimmed = next.trim();
            if (!trimmed || trimmed === s.name) return;
            try {
                await axios.put(\`/api/subtasks/\${subId}\`, { name: trimmed });
                s.name = trimmed;
                renderTaskDetail();
            } catch (error) {
                alert('하위 작업 수정 실패: ' + (error.response?.data?.error || error.message));
            }
        }

        async function deleteSubtask(subId) {
            if (__detailTaskId === null) return;
            const taskId = __detailTaskId;
            const t = __tasksCache.find(x => x.id === taskId);
            if (!t || !Array.isArray(t.__subtasks)) return;
            const s = t.__subtasks.find(x => x.id === subId);
            if (!s) return;
            if (!confirm(\`하위 작업 '\${s.name}'을(를) 삭제하시겠습니까?\`)) return;
            try {
                const res = await axios.delete(\`/api/subtasks/\${subId}\`);
                t.__subtasks = t.__subtasks.filter(x => x.id !== subId);
                applySubtaskResultToTask(taskId, res.data);
                renderTaskDetail();
                renderTasks();
            } catch (error) {
                alert('하위 작업 삭제 실패: ' + (error.response?.data?.error || error.message));
            }
        }

        let __subtaskInputBound = false;
        function bindSubtaskInputOnce() {
            if (__subtaskInputBound) return;
            const addBtn = document.getElementById('task-detail-subtask-add');
            const input = document.getElementById('task-detail-subtask-input');
            if (!addBtn || !input) return;
            addBtn.addEventListener('click', addSubtaskFromInput);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    addSubtaskFromInput();
                }
            });
            __subtaskInputBound = true;
        }

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

        async function completeTaskDirect(id) {
            const t = __tasksCache.find(x => x.id === id);
            if (!t) return;
            try {
                await axios.put(\`/api/tasks/\${id}\`, { progress: 4 });
                t.progress = 4;
                renderTasks();
                if (__detailTaskId === id) renderTaskDetail();
            } catch (error) {
                alert('완료 처리 실패: ' + (error.response?.data?.error || error.message));
            }
        }
        window.completeTaskDirect = completeTaskDirect;

        // 같은 상태 그룹(진행 예정/진행 중/완료됨) 안에서 작업 순서를 위/아래로 이동
        // dir: -1(위) / +1(아래). 현재 화면에 보이는 정렬 순서 기준으로 교환한다.
        async function moveTask(id, dir) {
            const selectedHospital = document.getElementById('stats-hospital').value;
            const filtered = selectedHospital === 'all'
                ? __tasksCache
                : __tasksCache.filter(t => String(t.hospital_id) === String(selectedHospital));

            function bucketOf(t) {
                const sTotal = Number(t.subtask_total || 0);
                if (sTotal > 0) {
                    const sDone = Number(t.subtask_done || 0);
                    if (sDone >= sTotal) return 2;
                    if (sDone > 0) return 1;
                    return 0;
                }
                if ((t.progress || 0) >= 4) return 2;
                if ((t.progress || 0) > 0) return 1;
                return 0;
            }

            const sorted = [...filtered].sort((a, b) => {
                const ba = bucketOf(a);
                const bb = bucketOf(b);
                if (ba !== bb) return ba - bb;
                const oa = Number(a.order_index ?? 0);
                const ob = Number(b.order_index ?? 0);
                if (oa !== ob) return oa - ob;
                return (a.id || 0) - (b.id || 0);
            });

            const curIdx = sorted.findIndex(x => x.id === id);
            if (curIdx < 0) return;
            const targetIdx = curIdx + dir;
            if (targetIdx < 0 || targetIdx >= sorted.length) return;
            if (bucketOf(sorted[curIdx]) !== bucketOf(sorted[targetIdx])) return;

            // 표시 순서 교환
            const tmp = sorted[curIdx];
            sorted[curIdx] = sorted[targetIdx];
            sorted[targetIdx] = tmp;

            // 전체 캐시 기준으로 새 order_index 를 배정 — 화면에 보이지 않는 항목은
            // 기존 순서대로 뒤에 붙인다.
            const visibleIds = new Set(sorted.map(x => x.id));
            const visibleOrder = sorted.map(x => x.id);
            const invisibleSorted = [...__tasksCache]
                .filter(x => !visibleIds.has(x.id))
                .sort((a, b) => Number(a.order_index ?? 0) - Number(b.order_index ?? 0));
            const newOrderIds = [...visibleOrder, ...invisibleSorted.map(x => x.id)];

            // 낙관적 UI — 먼저 캐시의 order_index 를 갱신하고 렌더
            newOrderIds.forEach((tid, i) => {
                const t = __tasksCache.find(x => x.id === tid);
                if (t) t.order_index = i;
            });
            renderTasks();

            try {
                await axios.post('/api/tasks/reorder', { ids: newOrderIds });
            } catch (error) {
                console.error('작업 순서 변경 실패', error);
                alert('순서 변경 실패: ' + (error.response?.data?.error || error.message));
                // 실패 시 서버 기준 재로드
                loadTasks();
            }
        }
        window.moveTask = moveTask;

        async function uncompleteTask(id) {
            const t = __tasksCache.find(x => x.id === id);
            const label = t ? t.name : '작업';
            if (!confirm(\`'\${label}'을(를) 진행 예정으로 되돌릴까요?\n(작업 기록은 그대로 남습니다)\`)) return;
            try {
                await axios.put(\`/api/tasks/\${id}\`, { progress: 0 });
                if (t) t.progress = 0;
                renderTasks();
                if (__detailTaskId === id) renderTaskDetail();
            } catch (error) {
                alert('변경 실패: ' + (error.response?.data?.error || error.message));
            }
        }
        window.uncompleteTask = uncompleteTask;

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
            // 진척률은 진행 예정(0) / 완료(4) 둘 중 하나로 정규화
            setProgressButton((t.progress || 0) >= 4 ? 4 : 0);
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
        let __budgetFilter = 'all'; // 'all' | 'recurring' | 'onetime'

        // 금액 포맷 — USD ($) · 소수점 2자리 (ex: $16.50, $4.70)
        function formatMoney(n) {
            const v = Number(n) || 0;
            const sign = v < 0 ? '-$' : '$';
            const abs = Math.abs(v);
            return sign + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
        // 사용자가 입력한 금액 문자열을 2자리 소수점으로 반올림한 숫자로 변환
        function parseMoneyInput(v) {
            const n = parseFloat(v);
            if (!isFinite(n) || n < 0) return 0;
            return Math.round(n * 100) / 100;
        }
        // 구버전 호환용 별칭
        function formatWon(n) { return formatMoney(n); }

        function budgetPaymentType(b) {
            return b && b.payment_type === 'recurring' ? 'recurring' : 'onetime';
        }

        // 결제 완료 여부 — 1 또는 true 면 결제 완료로 간주
        function isBudgetPaid(b) {
            if (!b) return false;
            return b.is_paid === 1 || b.is_paid === true;
        }

        // 승인 상태 — 'approved' 외에는 모두 '승인 대기' 로 간주한다.
        // (과거에 DB 마이그레이션 전에 쓰던 NULL/undefined 도 표시상 안전하게 처리)
        function isBudgetApproved(b) {
            if (!b) return false;
            return b.approval_status === 'approved';
        }

        async function loadBudgets() {
            const year = parseInt(document.getElementById('budget-year').value);
            const month = parseInt(document.getElementById('budget-month').value);
            if (!year || !month) return;
            try {
                // 당월 + 전월 예산 + 당월 AI 사용량 + 누적 AI 잔액
                const [curRes, prevRes, aiRes, balRes] = await Promise.all([
                    axios.get(\`/api/budgets/\${year}/\${month}\`),
                    (function() {
                        let py = year, pm = month - 1;
                        if (pm < 1) { pm = 12; py = year - 1; }
                        return axios.get(\`/api/budgets/\${py}/\${pm}\`);
                    })(),
                    axios.get(\`/api/ai-usage/\${year}/\${month}\`).catch(() => ({ data: [] })),
                    axios.get('/api/ai-balance').catch(() => ({ data: null }))
                ]);
                __budgetCache = curRes.data || [];
                const prev = prevRes.data || [];
                const aiUsage = aiRes.data || [];

                renderBudgetSummary(__budgetCache, prev);
                renderAiUsage(aiUsage, year, month);
                renderAiBalance(balRes.data);
                renderUnpaidPanel(__budgetCache, year, month);
                renderBudgetList(__budgetCache);
            } catch (error) {
                console.error('예산 로드 실패', error);
            }
        }
        window.loadBudgets = loadBudgets;

        // 누적 Claude / GPT 충전·사용·잔액 표시
        function renderAiBalance(data) {
            const safeNum = (x) => Number(x) || 0;
            const c = (data && data.claude) || { topup: 0, usage: 0, balance: 0 };
            // 구버전 'gemini' 응답도 GPT 로 취급 (점진적 마이그레이션 호환)
            const g = (data && (data.gpt || data.gemini)) || { topup: 0, usage: 0, balance: 0 };

            const claudeTopupEl = document.getElementById('ai-balance-claude-topup');
            const claudeUsageEl = document.getElementById('ai-balance-claude-usage');
            const claudeRemainEl = document.getElementById('ai-balance-claude-remain');
            const gptTopupEl = document.getElementById('ai-balance-gpt-topup');
            const gptUsageEl = document.getElementById('ai-balance-gpt-usage');
            const gptRemainEl = document.getElementById('ai-balance-gpt-remain');

            if (claudeTopupEl) claudeTopupEl.textContent = formatMoney(safeNum(c.topup));
            if (claudeUsageEl) claudeUsageEl.textContent = formatMoney(safeNum(c.usage));
            if (claudeRemainEl) {
                const bal = safeNum(c.balance);
                claudeRemainEl.textContent = formatMoney(bal);
                claudeRemainEl.className = 'tabular-nums font-bold ' + (bal < 0 ? 'text-rose-600' : 'text-emerald-600');
            }
            if (gptTopupEl) gptTopupEl.textContent = formatMoney(safeNum(g.topup));
            if (gptUsageEl) gptUsageEl.textContent = formatMoney(safeNum(g.usage));
            if (gptRemainEl) {
                const bal = safeNum(g.balance);
                gptRemainEl.textContent = formatMoney(bal);
                gptRemainEl.className = 'tabular-nums font-bold ' + (bal < 0 ? 'text-rose-600' : 'text-emerald-600');
            }
        }

        // 결제 승인 전 패널 — is_paid = 0 인 항목 전부를 표시한다.
        // 한 패널 안에서 두 단계를 관리:
        //   1) 대표님 승인 대기 (approval_status !== 'approved') — 노란 배경 · "승인" 버튼
        //   2) 승인 완료 & 미결제 — 기본 배경 · "완료" 버튼
        // 승인 대기 항목이 먼저 오도록 정렬, 그 안에서는 결제일 오름차순.
        function renderUnpaidPanel(items, year, month) {
            const listEl = document.getElementById('budget-unpaid-list');
            const emptyEl = document.getElementById('budget-unpaid-empty');
            const sumEl = document.getElementById('budget-unpaid-panel-sum');
            const approvedCntEl = document.getElementById('budget-unpaid-approved-count');
            const pendingCntEl = document.getElementById('budget-unpaid-pending-count');
            if (!listEl) return;

            const unpaid = (items || []).filter(b => !isBudgetPaid(b));
            const pendingCount = unpaid.filter(b => !isBudgetApproved(b)).length;
            const approvedCount = unpaid.length - pendingCount;
            const sorted = [...unpaid].sort((a, b) => {
                const pa = isBudgetApproved(a) ? 1 : 0;
                const pb = isBudgetApproved(b) ? 1 : 0;
                if (pa !== pb) return pa - pb; // 승인 대기 먼저
                const da = a.budget_date || '9999-12-31';
                const db = b.budget_date || '9999-12-31';
                return da.localeCompare(db);
            });
            const total = unpaid.reduce((acc, b) => acc + (b.amount || 0), 0);
            if (sumEl) sumEl.textContent = formatMoney(total);
            if (pendingCntEl) pendingCntEl.textContent = String(pendingCount);
            if (approvedCntEl) approvedCntEl.textContent = String(approvedCount);

            // 입력 행 기본 날짜 = 현재 선택된 월의 오늘
            const addDateEl = document.getElementById('unpaid-add-date');
            const ymStr = \`\${year}-\${String(month).padStart(2, '0')}\`;
            if (addDateEl) {
                const cur = addDateEl.value || '';
                const curYm = cur.slice(0, 7);
                if (!cur || curYm !== ymStr) {
                    const now = new Date();
                    const today = now.getDate();
                    const lastDay = new Date(year, month, 0).getDate();
                    const day = String(Math.min(today, lastDay)).padStart(2, '0');
                    addDateEl.value = \`\${ymStr}-\${day}\`;
                }
            }

            if (sorted.length === 0) {
                listEl.innerHTML = '';
                if (emptyEl) emptyEl.classList.remove('hidden');
                return;
            }
            if (emptyEl) emptyEl.classList.add('hidden');

            function esc(s) {
                return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            }

            let html = '';
            for (const b of sorted) {
                const dateStr = b.budget_date ? b.budget_date.slice(5).replace('-', '/') : '—';
                const pt = budgetPaymentType(b);
                const typeBadge = pt === 'recurring'
                    ? '<span class="inline-flex items-center gap-1 text-[10px] font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded px-1 py-0.5 ml-1" title="정기결제"><i class="fas fa-sync-alt"></i></span>'
                    : '';
                const approved = isBudgetApproved(b);
                const rowBg = approved ? 'hover:bg-red-50/40' : 'bg-yellow-50/60 hover:bg-yellow-100/60';
                const pendingBadge = approved
                    ? ''
                    : '<span class="inline-flex items-center gap-1 text-[10px] font-semibold text-yellow-800 bg-yellow-100 border border-yellow-300 rounded px-1.5 py-0.5 ml-1" title="대표님 승인 대기 중"><i class="fas fa-user-clock"></i>승인 대기</span>';
                const amountColor = approved ? 'text-red-700' : 'text-yellow-800';
                const actionBtn = approved
                    ? \`<button data-unpaid-action="pay" data-id="\${b.id}" title="결제 완료로 표시"
                           class="inline-flex items-center gap-1 text-[11px] font-semibold text-white bg-green-500 hover:bg-green-600 rounded px-2 py-1 shadow-sm">
                           <i class="fas fa-check"></i>완료
                       </button>
                       <button data-unpaid-action="unapprove" data-id="\${b.id}" title="승인 취소 — 승인 대기 상태로 되돌리기"
                           class="w-7 h-7 flex items-center justify-center rounded-md text-amber-700 hover:bg-amber-100">
                           <i class="fas fa-rotate-left text-xs"></i>
                       </button>\`
                    : \`<button data-unpaid-action="approve" data-id="\${b.id}" title="대표님 승인 — 결제 허가"
                           class="inline-flex items-center gap-1 text-[11px] font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded px-2 py-1 shadow-sm">
                           <i class="fas fa-user-check"></i>승인
                       </button>\`;
                html += \`
                    <div class="grid grid-cols-12 gap-2 px-3 py-2 items-center \${rowBg}">
                        <div class="col-span-2 text-slate-700 tabular-nums">\${dateStr}</div>
                        <div class="col-span-2 text-slate-700 truncate" title="\${esc(b.category)}">\${esc(b.category) || '—'}\${typeBadge}</div>
                        <div class="col-span-4 text-slate-700 truncate" title="\${esc(b.description)}">\${esc(b.description) || '—'}\${pendingBadge}</div>
                        <div class="col-span-2 text-right font-bold tabular-nums \${amountColor}">\${formatMoney(b.amount)}</div>
                        <div class="col-span-2 flex justify-end gap-1">
                            \${actionBtn}
                            <button data-unpaid-action="edit" data-id="\${b.id}" title="수정"
                                class="w-7 h-7 flex items-center justify-center rounded-md text-indigo-600 hover:bg-indigo-100">
                                <i class="fas fa-pen text-xs"></i>
                            </button>
                        </div>
                    </div>
                \`;
            }
            listEl.innerHTML = html;
        }

        // 결제 필요 항목 → 결제 완료 처리
        async function markBudgetPaid(id) {
            try {
                await axios.put(\`/api/budgets/\${id}\`, { is_paid: 1 });
                const item = __budgetCache.find(x => x.id === id);
                if (item) item.is_paid = 1;
                await loadBudgets();
            } catch (error) {
                alert('결제 완료 처리 실패: ' + (error.response?.data?.error || error.message));
            }
        }

        // 승인 대기 항목 → 대표님 승인 처리 (같은 패널에서 버튼이 "완료"로 바뀜)
        async function markBudgetApproved(id) {
            try {
                await axios.put(\`/api/budgets/\${id}\`, { approval_status: 'approved' });
                const item = __budgetCache.find(x => x.id === id);
                if (item) item.approval_status = 'approved';
                await loadBudgets();
            } catch (error) {
                alert('승인 처리 실패: ' + (error.response?.data?.error || error.message));
            }
        }

        // 승인 완료 항목 → 승인 대기 상태로 되돌리기 (실수로 승인한 경우 복구용)
        async function markBudgetPending(id) {
            const item = __budgetCache.find(x => x.id === id);
            const label = item ? (item.category || item.description || '해당 항목') : '해당 항목';
            if (!confirm(\`"\${label}"을(를) 승인 대기 상태로 되돌릴까요?\`)) return;
            try {
                await axios.put(\`/api/budgets/\${id}\`, { approval_status: 'pending' });
                if (item) item.approval_status = 'pending';
                await loadBudgets();
            } catch (error) {
                alert('승인 취소 실패: ' + (error.response?.data?.error || error.message));
            }
        }

        // 신규 결제 요청 등록 — 수시결제 · is_paid=0 · approval_status='pending' (승인 대기) · 이월 off
        async function addUnpaidEntry() {
            const date = document.getElementById('unpaid-add-date').value;
            const category = document.getElementById('unpaid-add-category').value.trim();
            const description = document.getElementById('unpaid-add-description').value.trim();
            const amount = parseMoneyInput(document.getElementById('unpaid-add-amount').value);
            if (!date) { alert('결제일을 선택해주세요'); return; }
            if (!category && !description) { alert('카테고리 또는 내용 중 하나는 입력해주세요'); return; }
            if (amount <= 0) { alert('금액을 입력해주세요'); return; }

            const [y, m] = date.split('-');
            const year = parseInt(y);
            const month = parseInt(m);
            try {
                await axios.post('/api/budgets', {
                    year, month, type: 'expense',
                    category, description, amount,
                    budget_date: date,
                    payment_type: 'onetime',
                    carry_over: 0,
                    is_paid: 0,
                    approval_status: 'pending',
                    ai_provider: null
                });
                document.getElementById('unpaid-add-category').value = '';
                document.getElementById('unpaid-add-description').value = '';
                document.getElementById('unpaid-add-amount').value = '';
                document.getElementById('budget-year').value = String(year);
                document.getElementById('budget-month').value = String(month);
                await loadBudgets();
            } catch (error) {
                alert('추가 실패: ' + (error.response?.data?.error || error.message));
            }
        }

        function bindUnpaidPanel() {
            const panel = document.getElementById('budget-unpaid-panel');
            const addBtn = document.getElementById('unpaid-add-btn');
            if (!panel || !addBtn) { setTimeout(bindUnpaidPanel, 100); return; }
            if (panel.__bound) return;
            panel.__bound = true;

            addBtn.addEventListener('click', addUnpaidEntry);
            ['unpaid-add-date', 'unpaid-add-category', 'unpaid-add-description', 'unpaid-add-amount'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') { e.preventDefault(); addUnpaidEntry(); }
                });
            });

            panel.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-unpaid-action]');
                if (!btn) return;
                const id = parseInt(btn.dataset.id);
                const action = btn.dataset.unpaidAction;
                if (action === 'pay') markBudgetPaid(id);
                else if (action === 'approve') markBudgetApproved(id);
                else if (action === 'unapprove') markBudgetPending(id);
                else if (action === 'edit') openEditBudgetModal(id);
            });
        }
        bindUnpaidPanel();

        // AI 사용 현황 — 예산(충전)과 별개, 일자별 실사용량만 기록
        // __aiUsageByDate: { 'YYYY-MM-DD': { claude: { total, ids }, gpt: { total, ids } } }
        let __aiUsageByDate = {};
        let __aiUsageYear = 0, __aiUsageMonth = 0;

        // 구버전 'gemini' 데이터를 GPT 로 취급해 단일 키로 통일한다.
        function normalizeUsageProvider(p) {
            const s = (p || '').toLowerCase();
            if (s === 'claude') return 'claude';
            if (s === 'gpt' || s === 'gemini') return 'gpt';
            return '';
        }

        function renderAiUsage(items, year, month) {
            const listEl = document.getElementById('budget-ai-usage-list');
            const emptyEl = document.getElementById('budget-ai-usage-empty');
            const claudeTotEl = document.getElementById('budget-ai-claude-total');
            const gptTotEl = document.getElementById('budget-ai-gpt-total');
            if (!listEl) return;

            __aiUsageYear = year;
            __aiUsageMonth = month;

            const byDate = {};
            let claudeTotal = 0, gptTotal = 0;
            for (const u of (items || [])) {
                const prov = normalizeUsageProvider(u.provider);
                if (!prov) continue;
                const amount = Number(u.amount || 0);
                const dateKey = u.usage_date;
                if (!dateKey) continue;
                if (!byDate[dateKey]) byDate[dateKey] = {
                    claude: { total: 0, ids: [] },
                    gpt: { total: 0, ids: [] }
                };
                byDate[dateKey][prov].total += amount;
                byDate[dateKey][prov].ids.push(u.id);
                if (prov === 'claude') claudeTotal += amount;
                else gptTotal += amount;
            }
            __aiUsageByDate = byDate;

            claudeTotEl.textContent = formatMoney(claudeTotal);
            gptTotEl.textContent = formatMoney(gptTotal);

            // 신규 입력 행 기본 날짜 = 현재 선택된 월의 오늘 (없으면 해당 월 1일)
            const addDateEl = document.getElementById('ai-add-date');
            const ymStr = \`\${year}-\${String(month).padStart(2, '0')}\`;
            if (addDateEl) {
                const cur = addDateEl.value || '';
                const curYm = cur.slice(0, 7);
                if (!cur || curYm !== ymStr) {
                    const now = new Date();
                    const today = now.getDate();
                    const lastDay = new Date(year, month, 0).getDate();
                    const day = String(Math.min(today, lastDay)).padStart(2, '0');
                    addDateEl.value = \`\${ymStr}-\${day}\`;
                }
            }

            const sortedDates = Object.keys(byDate).sort();
            if (sortedDates.length === 0) {
                listEl.innerHTML = '';
                if (emptyEl) emptyEl.classList.remove('hidden');
                return;
            }
            if (emptyEl) emptyEl.classList.add('hidden');

            let html = '';
            for (const d of sortedDates) {
                const v = byDate[d];
                const sum = (v.claude.total || 0) + (v.gpt.total || 0);
                const dateLabel = d.slice(5).replace('-', '/');
                const claudeVal = v.claude.total > 0 ? v.claude.total : '';
                const gptVal = v.gpt.total > 0 ? v.gpt.total : '';
                html += \`
                    <div class="grid grid-cols-12 gap-2 px-3 py-1.5 items-center hover:bg-indigo-50/40" data-ai-row="\${d}">
                        <div class="col-span-3 text-slate-700">\${dateLabel}</div>
                        <div class="col-span-3">
                            <input type="number" min="0" step="0.01" value="\${claudeVal}"
                                data-ai-prov="claude" data-ai-date="\${d}"
                                class="w-full border border-transparent hover:border-orange-200 focus:border-orange-400 rounded px-2 py-0.5 text-right text-orange-700 font-semibold focus:outline-none bg-transparent tabular-nums"
                                placeholder="—">
                        </div>
                        <div class="col-span-3">
                            <input type="number" min="0" step="0.01" value="\${gptVal}"
                                data-ai-prov="gpt" data-ai-date="\${d}"
                                class="w-full border border-transparent hover:border-sky-200 focus:border-sky-400 rounded px-2 py-0.5 text-right text-sky-700 font-semibold focus:outline-none bg-transparent tabular-nums"
                                placeholder="—">
                        </div>
                        <div class="col-span-2 text-right font-bold text-slate-800">\${formatMoney(sum)}</div>
                        <div class="col-span-1 flex justify-end">
                            <button data-ai-action="delete" data-ai-date="\${d}" title="이 날짜 삭제"
                                class="w-6 h-6 flex items-center justify-center rounded text-rose-500 hover:bg-rose-100">
                                <i class="fas fa-times text-xs"></i>
                            </button>
                        </div>
                    </div>
                \`;
            }
            // 합계 행
            html += \`
                <div class="grid grid-cols-12 gap-2 px-3 py-1.5 items-center bg-indigo-50/70 font-bold">
                    <div class="col-span-3 text-slate-700">합계</div>
                    <div class="col-span-3 text-right text-orange-700">\${formatMoney(claudeTotal)}</div>
                    <div class="col-span-3 text-right text-sky-700">\${formatMoney(gptTotal)}</div>
                    <div class="col-span-2 text-right text-slate-800">\${formatMoney(claudeTotal + gptTotal)}</div>
                    <div class="col-span-1"></div>
                </div>
            \`;
            listEl.innerHTML = html;
        }

        // 특정 (날짜, 제공자) 의 사용량 갱신 — 기존 N건은 합쳐서 1건으로 재저장, 0이면 삭제
        async function upsertAiUsageCell(date, provider, amount) {
            if (!date || (provider !== 'claude' && provider !== 'gpt')) return;
            const amt = parseMoneyInput(amount);
            const bucket = __aiUsageByDate[date];
            const existingIds = bucket && bucket[provider] ? [...bucket[provider].ids] : [];

            try {
                if (existingIds.length === 0 && amt === 0) return;
                if (existingIds.length > 0 && amt > 0) {
                    const [keepId, ...restIds] = existingIds;
                    await axios.put(\`/api/ai-usage/\${keepId}\`, {
                        usage_date: date, provider, amount: amt
                    });
                    for (const rid of restIds) {
                        await axios.delete(\`/api/ai-usage/\${rid}\`);
                    }
                } else if (existingIds.length === 0 && amt > 0) {
                    await axios.post('/api/ai-usage', {
                        usage_date: date, provider, amount: amt
                    });
                } else if (existingIds.length > 0 && amt === 0) {
                    for (const rid of existingIds) {
                        await axios.delete(\`/api/ai-usage/\${rid}\`);
                    }
                }
                await loadBudgets();
            } catch (error) {
                alert('저장 실패: ' + (error.response?.data?.error || error.message));
                await loadBudgets();
            }
        }

        // 특정 날짜 행 전체 삭제 (Claude + GPT 모두)
        async function deleteAiUsageRow(date) {
            const bucket = __aiUsageByDate[date];
            if (!bucket) return;
            const allIds = [...(bucket.claude.ids || []), ...(bucket.gpt.ids || [])];
            if (allIds.length === 0) return;
            const label = date.slice(5).replace('-', '/');
            if (!confirm(\`\${label} 의 AI 사용 내역을 모두 삭제하시겠습니까?\`)) return;
            try {
                for (const rid of allIds) {
                    await axios.delete(\`/api/ai-usage/\${rid}\`);
                }
                await loadBudgets();
            } catch (error) {
                alert('삭제 실패: ' + (error.response?.data?.error || error.message));
                await loadBudgets();
            }
        }

        // 신규 AI 사용 입력 — 날짜 + Claude/GPT 금액
        async function addAiUsageEntry() {
            const date = document.getElementById('ai-add-date').value;
            const claude = parseMoneyInput(document.getElementById('ai-add-claude').value);
            const gpt = parseMoneyInput(document.getElementById('ai-add-gpt').value);
            if (!date) { alert('날짜를 선택해주세요'); return; }
            if (claude <= 0 && gpt <= 0) { alert('Claude 또는 GPT 사용 금액을 입력해주세요'); return; }

            const [y, m] = date.split('-');
            const year = parseInt(y);
            const month = parseInt(m);
            try {
                // 같은 날짜에 이미 기록이 있으면 더하는 게 아니라 기존 것과 합쳐서 업데이트 — upsert 사용
                // 먼저 이번 달 기록을 다시 가져와 bucket 을 최신으로 만든 뒤 업서트
                const latest = await axios.get(\`/api/ai-usage/\${year}/\${month}\`);
                const items = latest.data || [];
                const bucket = { claude: { total: 0, ids: [] }, gpt: { total: 0, ids: [] } };
                for (const u of items) {
                    if (u.usage_date !== date) continue;
                    const p = normalizeUsageProvider(u.provider);
                    if (!p) continue;
                    bucket[p].total += Number(u.amount || 0);
                    bucket[p].ids.push(u.id);
                }
                __aiUsageByDate[date] = bucket;

                if (claude > 0) {
                    await upsertAiUsageCell(date, 'claude', bucket.claude.total + claude);
                }
                if (gpt > 0) {
                    await upsertAiUsageCell(date, 'gpt', bucket.gpt.total + gpt);
                }

                document.getElementById('ai-add-claude').value = '';
                document.getElementById('ai-add-gpt').value = '';

                // 입력한 날짜의 월로 탭 이동 (현재 보고 있는 달과 다를 수 있음)
                document.getElementById('budget-year').value = String(year);
                document.getElementById('budget-month').value = String(month);
                await loadBudgets();
            } catch (error) {
                alert('추가 실패: ' + (error.response?.data?.error || error.message));
            }
        }

        // AI 사용 패널 이벤트 바인딩 (1회만)
        function bindAiUsagePanel() {
            const panel = document.getElementById('budget-ai-usage');
            const addBtn = document.getElementById('ai-add-btn');
            if (!panel || !addBtn) { setTimeout(bindAiUsagePanel, 100); return; }

            addBtn.addEventListener('click', addAiUsageEntry);
            ['ai-add-date', 'ai-add-claude', 'ai-add-gpt'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') { e.preventDefault(); addAiUsageEntry(); }
                });
            });

            // 기존 행의 셀 편집 — blur 에 저장
            panel.addEventListener('blur', (e) => {
                const input = e.target;
                if (!(input instanceof HTMLInputElement)) return;
                if (!input.dataset.aiProv || !input.dataset.aiDate) return;
                const date = input.dataset.aiDate;
                const prov = input.dataset.aiProv;
                const newAmt = parseMoneyInput(input.value);
                const bucket = __aiUsageByDate[date];
                const prevAmt = bucket && bucket[prov] ? bucket[prov].total : 0;
                if (Math.abs(newAmt - prevAmt) < 0.005) return;
                upsertAiUsageCell(date, prov, newAmt);
            }, true);

            panel.addEventListener('keydown', (e) => {
                const input = e.target;
                if (!(input instanceof HTMLInputElement)) return;
                if (!input.dataset.aiProv) return;
                if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
            });

            panel.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-ai-action]');
                if (!btn) return;
                if (btn.dataset.aiAction === 'delete') {
                    deleteAiUsageRow(btn.dataset.aiDate);
                }
            });
        }
        bindAiUsagePanel();

        function renderBudgetSummary(cur, prev) {
            // 지출만 집계 (수입 개념은 사용하지 않음)
            const expense = cur.reduce((acc, b) => acc + (b.amount || 0), 0);
            const prevExpense = prev.reduce((acc, b) => acc + (b.amount || 0), 0);
            const recurring = cur.filter(b => budgetPaymentType(b) === 'recurring').reduce((acc, b) => acc + (b.amount || 0), 0);
            const onetime = cur.filter(b => budgetPaymentType(b) === 'onetime').reduce((acc, b) => acc + (b.amount || 0), 0);
            // 결제 필요 = 미결제 항목 전체 (승인 대기 + 승인 완료) — 한 패널에서 관리
            const unpaidItems = cur.filter(b => !isBudgetPaid(b));
            const unpaid = unpaidItems.reduce((acc, b) => acc + (b.amount || 0), 0);

            document.getElementById('budget-recurring').textContent = formatMoney(recurring);
            document.getElementById('budget-onetime').textContent = formatMoney(onetime);
            document.getElementById('budget-expense').textContent = formatMoney(expense);
            document.getElementById('budget-unpaid').textContent = formatMoney(unpaid);
            document.getElementById('budget-unpaid-count').textContent = String(unpaidItems.length);

            const compareEl = document.getElementById('budget-compare');
            const compareSub = document.getElementById('budget-compare-sub');
            const diff = expense - prevExpense;
            compareSub.textContent = \`지난달 \${formatMoney(prevExpense)}\`;
            if (prevExpense === 0 && expense === 0) {
                compareEl.textContent = '—';
                compareEl.className = 'text-2xl font-bold tabular-nums text-slate-500';
            } else if (diff > 0) {
                compareEl.textContent = '+' + formatMoney(diff) + ' 더 나감';
                compareEl.className = 'text-2xl font-bold tabular-nums text-rose-600';
            } else if (diff < 0) {
                compareEl.textContent = formatMoney(Math.abs(diff)) + ' 덜 나감';
                compareEl.className = 'text-2xl font-bold tabular-nums text-emerald-600';
            } else {
                compareEl.textContent = '동일';
                compareEl.className = 'text-2xl font-bold tabular-nums text-slate-500';
            }
        }

        function renderBudgetList(items) {
            const list = document.getElementById('budget-list');
            const empty = document.getElementById('budget-empty');

            // 결제 완료된 항목만 — 아직 결제 안 한 건 위 "결제 승인 전" 패널에서 별도 관리
            const filtered = (items || []).filter(b => {
                if (!isBudgetPaid(b)) return false;
                if (__budgetFilter === 'all') return true;
                return budgetPaymentType(b) === __budgetFilter;
            });

            if (filtered.length === 0) {
                list.innerHTML = '';
                empty.classList.remove('hidden');
                empty.textContent = __budgetFilter === 'all'
                    ? '결제 완료된 항목이 없습니다. "결제 승인 전" 패널에서 결제가 끝나면 이곳에 기록됩니다.'
                    : (__budgetFilter === 'recurring' ? '결제 완료된 정기결제가 없습니다.' : '결제 완료된 수시결제가 없습니다.');
                return;
            }
            empty.classList.add('hidden');

            // 결제일 오름차순
            const sorted = [...filtered].sort((a, b) => {
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
                const pt = budgetPaymentType(b);
                const badge = pt === 'recurring'
                    ? '<span class="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-0.5"><i class="fas fa-sync-alt"></i>정기</span>'
                    : '<span class="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5"><i class="fas fa-credit-card"></i>수시</span>';
                const carryBadge = b.is_carryover
                    ? \`<span class="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 ml-1" title="\${b.year}/\${String(b.month).padStart(2,'0')} 항목에서 자동 이월"><i class="fas fa-angles-right"></i>이월</span>\`
                    : '';
                const ap = (b.ai_provider || '').toLowerCase();
                const aiBadge = ap === 'claude'
                    ? '<span class="inline-flex items-center gap-1 text-[10px] font-semibold text-orange-700 bg-orange-50 border border-orange-200 rounded px-1.5 py-0.5 ml-1" title="Claude 충전"><i class="fas fa-robot"></i>Claude</span>'
                    : ((ap === 'gpt' || ap === 'gemini')
                        ? '<span class="inline-flex items-center gap-1 text-[10px] font-semibold text-sky-700 bg-sky-50 border border-sky-200 rounded px-1.5 py-0.5 ml-1" title="GPT 충전"><i class="fas fa-bolt"></i>GPT</span>'
                        : '');
                html += \`
                    <div class="grid grid-cols-12 gap-2 px-4 py-3 items-center text-sm hover:bg-slate-50">
                        <div class="col-span-2 text-slate-700 tabular-nums">\${dateStr}</div>
                        <div class="col-span-2">\${badge}\${carryBadge}</div>
                        <div class="col-span-2 text-slate-700 truncate" title="\${esc(b.category)}">\${esc(b.category) || '—'}\${aiBadge}</div>
                        <div class="col-span-3 text-slate-700 truncate" title="\${esc(b.description)}">\${esc(b.description) || '—'}</div>
                        <div class="col-span-2 text-right font-bold tabular-nums text-rose-700">-\${formatMoney(b.amount)}</div>
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

        // 결제 필요 요약 카드 클릭 → 결제 필요 패널로 스크롤
        function bindUnpaidCard() {
            const card = document.getElementById('budget-unpaid-card');
            if (!card) { setTimeout(bindUnpaidCard, 100); return; }
            if (card.__bound) return;
            card.__bound = true;
            card.addEventListener('click', () => {
                const panel = document.getElementById('budget-unpaid-panel');
                if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        }
        bindUnpaidCard();

        // 결제 유형 필터 탭 바인딩
        function bindBudgetFilterTabs() {
            const tabs = document.querySelectorAll('[data-budget-filter]');
            if (!tabs || tabs.length === 0) { setTimeout(bindBudgetFilterTabs, 100); return; }
            tabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    __budgetFilter = tab.dataset.budgetFilter;
                    // 탭 스타일 갱신
                    tabs.forEach(t => {
                        const f = t.dataset.budgetFilter;
                        const active = f === __budgetFilter;
                        const color = f === 'recurring' ? 'blue' : (f === 'onetime' ? 'amber' : 'emerald');
                        if (active) {
                            t.className = \`budget-filter-tab px-4 py-2 text-sm font-semibold border-b-2 border-\${color}-500 text-\${color}-700\`;
                        } else {
                            t.className = \`budget-filter-tab px-4 py-2 text-sm font-semibold border-b-2 border-transparent text-slate-500 hover:text-\${color}-600\`;
                        }
                    });
                    renderBudgetList(__budgetCache);
                });
            });
        }
        bindBudgetFilterTabs();

        // 결제 유형 선택 버튼 (모달)
        function setBudgetPaymentTypeButton(pt) {
            const container = document.getElementById('budget-payment-type-input');
            if (!container) return;
            const val = pt === 'recurring' ? 'recurring' : 'onetime';
            container.dataset.value = val;
            Array.from(container.querySelectorAll('button')).forEach(btn => {
                const v = btn.dataset.pt;
                const active = v === val;
                const color = v === 'recurring' ? 'blue' : 'amber';
                if (active) {
                    btn.className = \`flex-1 py-2 rounded-lg border-2 text-sm font-semibold transition-colors bg-\${color}-500 border-\${color}-500 text-white\`;
                } else {
                    btn.className = 'flex-1 py-2 rounded-lg border-2 text-sm font-semibold transition-colors bg-white border-slate-200 text-slate-600 hover:border-slate-300';
                }
            });
        }

        function bindBudgetPaymentTypeInput() {
            const container = document.getElementById('budget-payment-type-input');
            if (!container) { setTimeout(bindBudgetPaymentTypeInput, 100); return; }
            container.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-pt]');
                if (!btn) return;
                setBudgetPaymentTypeButton(btn.dataset.pt);
            });
        }
        bindBudgetPaymentTypeInput();

        // AI 제공자 선택 버튼 (모달)
        function setBudgetAiProviderButton(ap) {
            const container = document.getElementById('budget-ai-provider-input');
            if (!container) return;
            // 'gemini' 는 레거시 값 — GPT 로 정규화
            const norm = (ap === 'gemini' ? 'gpt' : ap);
            const val = (norm === 'claude' || norm === 'gpt') ? norm : '';
            container.dataset.value = val;
            Array.from(container.querySelectorAll('button')).forEach(btn => {
                const v = btn.dataset.ap || '';
                const active = v === val;
                const color = v === 'claude' ? 'orange' : (v === 'gpt' ? 'sky' : 'slate');
                if (active) {
                    btn.className = \`flex-1 py-2 rounded-lg border-2 text-xs font-semibold transition-colors bg-\${color}-500 border-\${color}-500 text-white\`;
                } else {
                    btn.className = 'flex-1 py-2 rounded-lg border-2 text-xs font-semibold transition-colors bg-white border-slate-200 text-slate-600 hover:border-slate-300';
                }
            });
        }

        function bindBudgetAiProviderInput() {
            const container = document.getElementById('budget-ai-provider-input');
            if (!container) { setTimeout(bindBudgetAiProviderInput, 100); return; }
            container.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-ap]');
                if (!btn) return;
                setBudgetAiProviderButton(btn.dataset.ap || '');
            });
        }
        bindBudgetAiProviderInput();

        async function deleteBudget(id) {
            const item = __budgetCache.find(x => x.id === id);
            const label = item ? (item.description || item.category || '항목') : '항목';
            const isCarry = !!(item && item.is_carryover);
            const msg = isCarry
                ? \`'\${label}' 을(를) 이번 달부터 더 이상 자동 이월되지 않도록 할까요?\n(원본 항목은 보존됩니다)\`
                : \`'\${label}'을(를) 삭제하시겠습니까?\`;
            if (!confirm(msg)) return;
            const vy = parseInt(document.getElementById('budget-year').value);
            const vm = parseInt(document.getElementById('budget-month').value);
            try {
                await axios.delete(\`/api/budgets/\${id}\`, {
                    params: { viewed_year: vy, viewed_month: vm }
                });
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
            // 두 유형 모두 기본으로 다음달 자동 이월
            document.getElementById('budget-carry-over-input').checked = true;
            // 새 항목은 기본 "결제 필요" (미결제) 상태
            document.getElementById('budget-is-paid-input').checked = false;
            // 현재 필터에 맞춰 기본 유형 설정 (전체/결제필요일 땐 수시결제 기본)
            setBudgetPaymentTypeButton(__budgetFilter === 'recurring' ? 'recurring' : 'onetime');
            // AI 제공자 기본값 — 미지정
            setBudgetAiProviderButton('');
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
            document.getElementById('budget-carry-over-input').checked = b.carry_over === 0 || b.carry_over === false ? false : true;
            document.getElementById('budget-is-paid-input').checked = isBudgetPaid(b);
            setBudgetPaymentTypeButton(budgetPaymentType(b));
            setBudgetAiProviderButton((b.ai_provider || '').toLowerCase());
            document.getElementById('budget-modal').classList.remove('hidden');
        };

        window.closeBudgetModal = function() {
            document.getElementById('budget-modal').classList.add('hidden');
        };

        window.saveBudget = async function() {
            const id = document.getElementById('budget-edit-id').value;
            const category = document.getElementById('budget-category-input').value.trim();
            const description = document.getElementById('budget-description-input').value.trim();
            const amount = parseMoneyInput(document.getElementById('budget-amount-input').value);
            const budgetDate = document.getElementById('budget-date-input').value;
            const paymentType = document.getElementById('budget-payment-type-input').dataset.value || 'onetime';
            const carryOver = document.getElementById('budget-carry-over-input').checked ? 1 : 0;
            const isPaid = document.getElementById('budget-is-paid-input').checked ? 1 : 0;
            const aiProviderRaw = document.getElementById('budget-ai-provider-input').dataset.value || '';
            const aiProvider = (aiProviderRaw === 'claude' || aiProviderRaw === 'gpt') ? aiProviderRaw : null;

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
                    // 편집 대상이 '이월 항목'이면 원본 행(id) 을 수정 — 원본의 carry_over/금액 등도 함께 반영
                    await axios.put(\`/api/budgets/\${id}\`, {
                        type: 'expense', category, description, amount,
                        budget_date: budgetDate || null,
                        payment_type: paymentType,
                        carry_over: carryOver,
                        is_paid: isPaid,
                        ai_provider: aiProvider,
                        // carry_over 재활성화 시 stop 해제
                        stop_year: carryOver ? null : undefined,
                        stop_month: carryOver ? null : undefined
                    });
                } else {
                    await axios.post('/api/budgets', {
                        year, month, type: 'expense', category, description, amount,
                        budget_date: budgetDate || null,
                        payment_type: paymentType,
                        carry_over: carryOver,
                        is_paid: isPaid,
                        ai_provider: aiProvider
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
