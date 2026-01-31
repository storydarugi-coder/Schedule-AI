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
// 루트 페이지
// =========================

app.get('/', (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>월간 업무 스케줄러</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <link href='https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.css' rel='stylesheet' />
</head>
<body class="bg-gray-50">
    <div id="app" class="max-w-7xl mx-auto p-6">
        <header class="mb-8">
            <h1 class="text-4xl font-bold text-gray-800 mb-2">
                <i class="fas fa-calendar-alt mr-3 text-blue-600"></i>
                월간 업무 스케줄러
            </h1>
            <p class="text-gray-600">병원별 마감 기한을 준수하는 스마트 스케줄 관리</p>
        </header>

        <!-- 탭 네비게이션 -->
        <div class="mb-6 border-b border-gray-200">
            <nav class="flex space-x-8">
                <button onclick="showTab('hospitals')" id="tab-hospitals" class="tab-button py-4 px-1 border-b-2 font-medium text-sm">
                    <i class="fas fa-hospital mr-2"></i>병원 관리
                </button>
                <button onclick="showTab('tasks')" id="tab-tasks" class="tab-button py-4 px-1 border-b-2 font-medium text-sm">
                    <i class="fas fa-tasks mr-2"></i>작업량 입력
                </button>
                <button onclick="showTab('calendar')" id="tab-calendar" class="tab-button py-4 px-1 border-b-2 font-medium text-sm">
                    <i class="fas fa-calendar mr-2"></i>캘린더
                </button>
            </nav>
        </div>

        <!-- 병원 관리 탭 -->
        <div id="content-hospitals" class="tab-content">
            <div class="bg-white rounded-lg shadow-md p-6 mb-6">
                <h2 class="text-2xl font-bold mb-4">병원 추가</h2>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <input type="text" id="hospital-name" placeholder="병원명" class="border rounded px-4 py-2">
                    <input type="number" id="hospital-due-day" placeholder="기본 마감일 (1-31)" min="1" max="31" class="border rounded px-4 py-2">
                    <button onclick="addHospital()" class="bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700">
                        <i class="fas fa-plus mr-2"></i>추가
                    </button>
                </div>
            </div>

            <div class="bg-white rounded-lg shadow-md p-6">
                <h2 class="text-2xl font-bold mb-4">병원 목록</h2>
                <div id="hospitals-list" class="space-y-2"></div>
            </div>
        </div>

        <!-- 작업량 입력 탭 -->
        <div id="content-tasks" class="tab-content hidden">
            <div class="bg-white rounded-lg shadow-md p-6 mb-6">
                <h2 class="text-2xl font-bold mb-4">월별 작업량 설정</h2>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <select id="task-hospital" class="border rounded px-4 py-2">
                        <option value="">병원 선택</option>
                    </select>
                    <select id="task-year" class="border rounded px-4 py-2"></select>
                    <select id="task-month" class="border rounded px-4 py-2"></select>
                </div>

                <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                    <div>
                        <label class="block text-sm font-medium mb-1">상위노출</label>
                        <input type="number" id="task-sanwi" min="0" value="0" class="border rounded px-4 py-2 w-full">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">브랜드</label>
                        <input type="number" id="task-brand" min="0" value="0" class="border rounded px-4 py-2 w-full">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">트렌드</label>
                        <input type="number" id="task-trend" min="0" value="0" class="border rounded px-4 py-2 w-full">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">언론보도 (고정 1개)</label>
                        <input type="number" id="task-eonron" value="1" readonly class="border rounded px-4 py-2 w-full bg-gray-100">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">지식인 (고정 1개)</label>
                        <input type="number" id="task-jisikin" value="1" readonly class="border rounded px-4 py-2 w-full bg-gray-100">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">마감 당김 일수</label>
                        <select id="task-pull-days" class="border rounded px-4 py-2 w-full">
                            <option value="0">0일</option>
                            <option value="1">1일</option>
                            <option value="2">2일</option>
                        </select>
                    </div>
                </div>

                <div class="flex gap-4">
                    <button onclick="saveMonthlyTask()" class="bg-green-600 text-white rounded px-6 py-2 hover:bg-green-700">
                        <i class="fas fa-save mr-2"></i>저장
                    </button>
                    <button onclick="generateSchedule()" class="bg-purple-600 text-white rounded px-6 py-2 hover:bg-purple-700">
                        <i class="fas fa-magic mr-2"></i>스케줄 생성
                    </button>
                </div>
            </div>

            <div id="schedule-error" class="hidden bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4"></div>
            <div id="schedule-success" class="hidden bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4"></div>
        </div>

        <!-- 캘린더 탭 -->
        <div id="content-calendar" class="tab-content hidden">
            <div class="bg-white rounded-lg shadow-md p-6 mb-4">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-2xl font-bold">스케줄 캘린더</h2>
                    <div class="flex gap-2">
                        <select id="calendar-year" onchange="loadCalendar()" class="border rounded px-4 py-2"></select>
                        <select id="calendar-month" onchange="loadCalendar()" class="border rounded px-4 py-2"></select>
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

        // 탭 전환
        function showTab(tab) {
            document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
            document.querySelectorAll('.tab-button').forEach(el => {
                el.classList.remove('border-blue-600', 'text-blue-600');
                el.classList.add('border-transparent', 'text-gray-500');
            });

            document.getElementById('content-' + tab).classList.remove('hidden');
            document.getElementById('tab-' + tab).classList.add('border-blue-600', 'text-blue-600');
            document.getElementById('tab-' + tab).classList.remove('border-transparent', 'text-gray-500');

            if (tab === 'calendar' && calendar === null) {
                initCalendar();
            }
        }

        // 병원 목록 로드
        async function loadHospitals() {
            try {
                const res = await axios.get('/api/hospitals');
                hospitals = res.data;
                
                const list = document.getElementById('hospitals-list');
                list.innerHTML = hospitals.map(h => \`
                    <div class="flex justify-between items-center p-4 border rounded hover:bg-gray-50">
                        <div>
                            <span class="font-medium">\${h.name}</span>
                            <span class="text-gray-500 ml-4">마감일: 매월 \${h.base_due_day}일</span>
                        </div>
                        <button onclick="deleteHospital(\${h.id})" class="text-red-600 hover:text-red-800">
                            <i class="fas fa-trash"></i>
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
                eonron_bodo: 1,
                jisikin: 1,
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
                document.getElementById('schedule-success').textContent = '스케줄이 생성되었습니다! 캘린더 탭에서 확인하세요.';
            } catch (error) {
                const errorData = error.response?.data?.error;
                document.getElementById('schedule-error').classList.remove('hidden');
                if (errorData) {
                    document.getElementById('schedule-error').innerHTML = \`
                        <strong>오류:</strong> \${errorData.message}<br>
                        <strong>병원:</strong> \${errorData.hospital_name}<br>
                        \${errorData.shortage_hours > 0 ? \`<strong>부족 시간:</strong> \${errorData.shortage_hours}시간<br>\` : ''}
                    \`;
                } else {
                    document.getElementById('schedule-error').textContent = '스케줄 생성 실패';
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
                const res = await axios.get(\`/api/schedules/\${year}/\${month}\`);
                const events = res.data.map(s => {
                    const color = s.is_report ? '#dc2626' : '#3b82f6';
                    return {
                        title: \`\${s.hospital_name} - \${s.task_name} (\${s.start_time}-\${s.end_time})\`,
                        start: s.task_date,
                        color: color,
                        extendedProps: {
                            pullDays: s.deadline_pull_days
                        }
                    };
                });

                calendar.removeAllEvents();
                calendar.addEventSource(events);
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
