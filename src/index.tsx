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
  const { name, base_due_day } = await c.req.json()

  if (!name || !base_due_day) {
    return c.json({ error: '병원명과 기본 마감일을 입력해주세요' }, 400)
  }

  try {
    const result = await db.prepare(
      'INSERT INTO hospitals (name, base_due_day) VALUES (?, ?)'
    ).bind(name, base_due_day).run()

    return c.json({ id: result.meta.last_row_id, name, base_due_day })
  } catch (error) {
    return c.json({ error: '병원 추가 실패 (중복된 이름일 수 있습니다)' }, 400)
  }
})

// 병원 수정
app.put('/api/hospitals/:id', async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')
  const { name, base_due_day } = await c.req.json()

  await db.prepare(
    'UPDATE hospitals SET name = ?, base_due_day = ? WHERE id = ?'
  ).bind(name, base_due_day, id).run()

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
    deadline_pull_days
  } = data

  // 기존 데이터 확인
  const existing = await db.prepare(`
    SELECT id FROM monthly_tasks WHERE hospital_id = ? AND year = ? AND month = ?
  `).bind(hospital_id, year, month).first()

  if (existing) {
    // 업데이트
    await db.prepare(`
      UPDATE monthly_tasks
      SET sanwi_nosul = ?, brand = ?, trend = ?, eonron_bodo = ?, jisikin = ?, deadline_pull_days = ?
      WHERE hospital_id = ? AND year = ? AND month = ?
    `).bind(sanwi_nosul, brand, trend, eonron_bodo, jisikin, deadline_pull_days, hospital_id, year, month).run()
  } else {
    // 삽입
    await db.prepare(`
      INSERT INTO monthly_tasks (hospital_id, year, month, sanwi_nosul, brand, trend, eonron_bodo, jisikin, deadline_pull_days)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(hospital_id, year, month, sanwi_nosul, brand, trend, eonron_bodo, jisikin, deadline_pull_days).run()
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
    ORDER BY s.task_date, s.start_time
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
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <link href='https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.css' rel='stylesheet' />
    <style>
        .primary-gradient { background: linear-gradient(135deg, #787FFF 0%, #FFF787 100%); }
        .primary-color { color: #787FFF; }
        .secondary-color { color: #FFF787; }
        .btn-primary { background: linear-gradient(135deg, #787FFF 0%, #A89FFF 100%); }
        .btn-primary:hover { background: linear-gradient(135deg, #6A70FF 0%, #9890FF 100%); }
        .btn-secondary { background: linear-gradient(135deg, #FFF787 0%, #FFE066 100%); }
        .btn-secondary:hover { background: linear-gradient(135deg, #FFE066 0%, #FFD34D 100%); }
    </style>
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
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <input type="text" id="hospital-name" placeholder="병원명" class="border-2 border-purple-200 rounded-lg px-4 py-3 focus:border-purple-400 focus:outline-none">
                    <input type="number" id="hospital-due-day" placeholder="기본 마감일 (1-31)" min="1" max="31" class="border-2 border-purple-200 rounded-lg px-4 py-3 focus:border-purple-400 focus:outline-none">
                    <button onclick="addHospital()" class="btn-primary text-white rounded-lg px-6 py-3 font-semibold shadow-md hover:shadow-lg transition-all">
                        <i class="fas fa-plus mr-2"></i>추가
                    </button>
                </div>
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
                    <select id="task-hospital" class="border-2 border-purple-200 rounded-lg px-4 py-3 focus:border-purple-400 focus:outline-none">
                        <option value="">병원 선택</option>
                    </select>
                    <select id="task-year" class="border-2 border-purple-200 rounded-lg px-4 py-3 focus:border-purple-400 focus:outline-none"></select>
                    <select id="task-month" class="border-2 border-purple-200 rounded-lg px-4 py-3 focus:border-purple-400 focus:outline-none"></select>
                </div>

                <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                    <div>
                        <label class="block text-sm font-semibold mb-2 primary-color">상위노출</label>
                        <input type="number" id="task-sanwi" min="0" value="0" class="border-2 border-purple-200 rounded-lg px-4 py-3 w-full focus:border-purple-400 focus:outline-none">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold mb-2 primary-color">브랜드</label>
                        <input type="number" id="task-brand" min="0" value="0" class="border-2 border-purple-200 rounded-lg px-4 py-3 w-full focus:border-purple-400 focus:outline-none">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold mb-2 primary-color">트렌드</label>
                        <input type="number" id="task-trend" min="0" value="0" class="border-2 border-purple-200 rounded-lg px-4 py-3 w-full focus:border-purple-400 focus:outline-none">
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
                        <label class="block text-sm font-semibold mb-2 primary-color">마감 당김 일수</label>
                        <select id="task-pull-days" class="border-2 border-purple-200 rounded-lg px-4 py-3 w-full focus:border-purple-400 focus:outline-none">
                            <option value="0">0일</option>
                            <option value="1">1일</option>
                            <option value="2">2일</option>
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
            <div class="bg-white rounded-xl shadow-lg p-6 mb-4 border-2 border-purple-100">
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-2xl font-bold primary-color">
                        <i class="fas fa-calendar-alt mr-2"></i>스케줄 캘린더
                    </h2>
                    <div class="flex gap-2">
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
        const vacationTypes = {
            annual: { label: '연차', color: '#f59e0b' },
            summer: { label: '여름휴가', color: '#10b981' },
            winter: { label: '겨울휴가', color: '#3b82f6' },
            sick: { label: '병가', color: '#ef4444' },
            other: { label: '기타', color: '#6b7280' }
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
                
                const list = document.getElementById('hospitals-list');
                list.innerHTML = hospitals.map(h => \`
                    <div class="flex justify-between items-center p-5 border-2 border-purple-100 rounded-xl hover:border-purple-300 transition-all bg-gradient-to-r from-purple-50 to-white shadow-sm hover:shadow-md">
                        <div class="flex items-center space-x-4">
                            <div class="bg-gradient-to-br from-purple-400 to-purple-600 text-white rounded-lg p-3">
                                <i class="fas fa-hospital text-2xl"></i>
                            </div>
                            <div>
                                <span class="font-bold text-lg text-gray-800">\${h.name}</span>
                                <div class="flex items-center mt-1">
                                    <i class="fas fa-calendar-day text-purple-500 mr-2"></i>
                                    <span class="text-purple-600 font-semibold">마감일: 매월 \${h.base_due_day}일</span>
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

            if (!name || !baseDueDay) {
                alert('병원명과 기본 마감일을 입력해주세요');
                return;
            }

            try {
                await axios.post('/api/hospitals', { name, base_due_day: parseInt(baseDueDay) });
                document.getElementById('hospital-name').value = '';
                document.getElementById('hospital-due-day').value = '';
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
                    return \`
                        <div class="flex justify-between items-center p-4 border-2 border-yellow-100 rounded-xl hover:border-yellow-300 transition-all bg-gradient-to-r from-yellow-50 to-white shadow-sm hover:shadow-md">
                            <div class="flex items-center space-x-4">
                                <div class="rounded-lg p-3" style="background-color: \${vType.color}20;">
                                    <i class="fas fa-umbrella-beach text-2xl" style="color: \${vType.color};"></i>
                                </div>
                                <div>
                                    <span class="font-bold text-lg text-gray-800">\${v.vacation_date}</span>
                                    <div class="flex items-center mt-1 space-x-2">
                                        <span class="px-3 py-1 rounded-full text-sm font-semibold text-white" style="background-color: \${vType.color};">
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
                sanwi_nosul: parseInt(document.getElementById('task-sanwi').value),
                brand: parseInt(document.getElementById('task-brand').value),
                trend: parseInt(document.getElementById('task-trend').value),
                eonron_bodo: parseInt(document.getElementById('task-eonron').value),
                jisikin: parseInt(document.getElementById('task-jisikin').value),
                deadline_pull_days: parseInt(document.getElementById('task-pull-days').value)
            };

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
                    document.getElementById('schedule-error').innerHTML = \`
                        <strong><i class="fas fa-exclamation-triangle mr-2"></i>오류:</strong> \${errorData.message}<br>
                        <strong>병원:</strong> \${errorData.hospital_name}<br>
                        \${errorData.shortage_hours > 0 ? \`<strong>부족 시간:</strong> \${errorData.shortage_hours}시간<br>\` : ''}
                        <div class="mt-2 text-sm">
                            💡 <strong>해결 방법:</strong> 작업량을 줄이거나 마감 당김 일수를 조정하세요.
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
                events: []
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
                    const color = s.is_report ? '#dc2626' : '#787FFF';
                    return {
                        title: \`\${s.hospital_name} - \${s.task_name} (\${s.start_time}-\${s.end_time})\`,
                        start: s.task_date,
                        color: color,
                        textColor: '#ffffff',
                        extendedProps: {
                            pullDays: s.deadline_pull_days
                        }
                    };
                });

                // 연차/휴가 가져오기
                const vacationRes = await axios.get(\`/api/vacations/\${year}/\${month}\`);
                const vacationEvents = vacationRes.data.map(v => {
                    const vType = vacationTypes[v.vacation_type] || vacationTypes.other;
                    return {
                        title: \`🏖️ \${vType.label}\${v.description ? ': ' + v.description : ''}\`,
                        start: v.vacation_date,
                        color: vType.color,
                        textColor: '#ffffff',
                        allDay: true
                    };
                });

                calendar.removeAllEvents();
                calendar.addEventSource(events.concat(vacationEvents));
                calendar.gotoDate(\`\${year}-\${month.padStart(2, '0')}-01\`);
            } catch (error) {
                console.error('캘린더 로드 실패', error);
            }
        }

        // 년도/월 선택 초기화
        function initDateSelectors() {
            const currentYear = new Date().getFullYear();
            const currentMonth = new Date().getMonth() + 1;

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
