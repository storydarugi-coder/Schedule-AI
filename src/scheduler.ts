import type { Bindings, MonthlyTask, TASK_DEFINITIONS, ScheduleError } from './types'
import { 
  getWorkdays, 
  calculateDueDate, 
  getContentDeadline, 
  formatDate, 
  formatTime, 
  addHours, 
  getAvailableHours,
  isMonday
} from './utils'

interface Task {
  hospitalId: number
  hospitalName: string
  type: string
  label: string
  duration: number
  deadline: Date
}

interface DaySchedule {
  date: Date
  availableHours: number
  usedHours: number
  tasks: Array<{
    hospitalId: number
    hospitalName: string
    type: string
    label: string
    startTime: string
    endTime: string
    duration: number
    isReport: boolean
  }>
}

/**
 * 스케줄 생성 메인 로직
 */
export async function generateSchedule(
  db: D1Database,
  hospitalId: number,
  year: number,
  month: number,
  monthlyTask: MonthlyTask
): Promise<DaySchedule[] | ScheduleError> {
  // 0. 연차/휴가 목록 조회
  const vacationsResult = await db.prepare(`
    SELECT vacation_date FROM vacations
    WHERE strftime('%Y', vacation_date) = ? AND strftime('%m', vacation_date) = ?
  `).bind(year.toString(), month.toString().padStart(2, '0')).all()
  
  const vacations = vacationsResult.results.map((v: any) => v.vacation_date)

  // 1. 병원 정보 조회
  const hospital = await db.prepare('SELECT * FROM hospitals WHERE id = ?')
    .bind(hospitalId)
    .first()
  
  if (!hospital) {
    throw new Error('병원을 찾을 수 없습니다')
  }

  const hospitalName = hospital.name as string
  const baseDueDay = hospital.base_due_day as number

  // 2. 마감일 계산
  let dueDate: Date
  try {
    dueDate = calculateDueDate(year, month, baseDueDay, monthlyTask.deadline_pull_days, vacations)
  } catch (error) {
    return {
      hospital_name: hospitalName,
      shortage_hours: 0,
      tasks: [],
      message: (error as Error).message
    }
  }

  // 3. 콘텐츠 완료 기한 계산
  const contentDeadline = getContentDeadline(dueDate, vacations)

  // 4. 근무일 목록 생성
  const workdays = getWorkdays(year, month, vacations)

  // 5. 일별 스케줄 초기화
  const daySchedules: DaySchedule[] = workdays.map(date => ({
    date,
    availableHours: getAvailableHours(date),
    usedHours: 0,
    tasks: []
  }))

  // 6. 보고서 작업 고정 (마감일 당일 10:00~12:00)
  const reportDayIndex = daySchedules.findIndex(
    d => formatDate(d.date) === formatDate(dueDate)
  )

  if (reportDayIndex === -1) {
    return {
      hospital_name: hospitalName,
      shortage_hours: 0,
      tasks: ['보고서'],
      message: `마감일 ${formatDate(dueDate)}이 근무일이 아닙니다`
    }
  }

  // 보고서 작업 배치
  daySchedules[reportDayIndex].tasks.push({
    hospitalId,
    hospitalName,
    type: 'report',
    label: '보고서',
    startTime: '10:00',
    endTime: '12:00',
    duration: 2,
    isReport: true
  })
  daySchedules[reportDayIndex].usedHours += 2

  // 7. 상위노출 일자 먼저 가져오기 (병원 관리에서 설정한 여러 날짜)
  let sanwiNosolDays: number[] = []
  if (hospital.sanwi_nosul_days) {
    try {
      sanwiNosolDays = JSON.parse(hospital.sanwi_nosul_days as string)
    } catch (e) {
      // JSON 파싱 실패 시 빈 배열
      sanwiNosolDays = []
    }
  }

  // 8. 콘텐츠 작업 목록 생성 (브랜드/트렌드 교차 배치)
  const tasks: Task[] = []
  
  // 작업 순서 파싱 (기본값: 'brand,trend')
  const taskOrder = (monthlyTask.task_order || 'brand,trend').split(',')
  
  // 브랜드와 트렌드를 교차로 배치
  const brandCount = monthlyTask.brand
  const trendCount = monthlyTask.trend
  const maxCount = Math.max(brandCount, trendCount)
  
  for (let i = 0; i < maxCount; i++) {
    for (const taskType of taskOrder) {
      if (taskType === 'brand' && i < brandCount) {
        tasks.push({
          hospitalId,
          hospitalName,
          type: 'brand',
          label: '브랜드',
          duration: 3.5,
          deadline: contentDeadline
        })
      } else if (taskType === 'trend' && i < trendCount) {
        tasks.push({
          hospitalId,
          hospitalName,
          type: 'trend',
          label: '트렌드',
          duration: 1.5,
          deadline: contentDeadline
        })
      }
    }
  }
  
  // 상위노출, 언론보도, 지식인 추가
  // 상위노출 개수는 병원 관리에서 설정한 날짜 개수로 자동 결정
  const sanwiCount = sanwiNosolDays.length > 0 ? sanwiNosolDays.length : monthlyTask.sanwi_nosul
  
  const otherTaskDefs = [
    { type: 'sanwi_nosul', count: sanwiCount, duration: 3.5, label: '상위노출' },
    { type: 'eonron_bodo', count: monthlyTask.eonron_bodo, duration: 0.5, label: '언론보도' },
    { type: 'jisikin', count: monthlyTask.jisikin, duration: 0.5, label: '지식인' }
  ]
  
  for (const taskDef of otherTaskDefs) {
    for (let i = 0; i < taskDef.count; i++) {
      tasks.push({
        hospitalId,
        hospitalName,
        type: taskDef.type,
        label: taskDef.label,
        duration: taskDef.duration,
        deadline: contentDeadline
      })
    }
  }

  // 9. 상위노출 작업과 일반 작업 분리
  const sanwiTasks = tasks.filter(t => t.type === 'sanwi_nosul')
  const normalTasks = tasks.filter(t => t.type !== 'sanwi_nosul')
  
  // 10. 콘텐츠 작업 배치 (마감일 이전 근무일에만)
  const contentDaySchedules = daySchedules.filter(
    d => d.date <= contentDeadline
  )

  // 총 필요 시간 계산
  const totalRequiredHours = tasks.reduce((sum, t) => sum + t.duration, 0)
  const totalAvailableHours = contentDaySchedules.reduce(
    (sum, d) => sum + (d.availableHours - d.usedHours), 0
  )

  if (totalRequiredHours > totalAvailableHours) {
    return {
      hospital_name: hospitalName,
      shortage_hours: totalRequiredHours - totalAvailableHours,
      tasks: tasks.map(t => t.label),
      message: `콘텐츠 작업 시간 부족: 필요 ${totalRequiredHours}시간, 가능 ${totalAvailableHours}시간`
    }
  }

  // 11. 상위노출 작업 먼저 배치 (지정된 날짜들에만)
  if (sanwiNosolDays.length > 0 && sanwiTasks.length > 0) {
    for (const daySchedule of contentDaySchedules) {
      const dayOfMonth = daySchedule.date.getDate()
      
      // 상위노출 일자 중 하나인 경우에만 배치
      if (sanwiNosolDays.includes(dayOfMonth) && sanwiTasks.length > 0) {
        const task = sanwiTasks.shift()
        if (!task) continue
        
        const remainingHours = daySchedule.availableHours - daySchedule.usedHours
        
        if (task.duration <= remainingHours) {
          const dayStartHour = isMonday(daySchedule.date) ? 10 : 9
          const startHourOffset = dayStartHour + daySchedule.usedHours
          const { hour: endHour, minute: endMinute } = addHours(startHourOffset, task.duration)

          daySchedule.tasks.push({
            hospitalId: task.hospitalId,
            hospitalName: task.hospitalName,
            type: task.type,
            label: task.label,
            startTime: formatTime(Math.floor(startHourOffset), 0),
            endTime: formatTime(endHour, endMinute),
            duration: task.duration,
            isReport: false
          })

          daySchedule.usedHours += task.duration
        } else {
          // 시간 부족하면 다시 넣기
          sanwiTasks.unshift(task)
        }
      }
    }
  }
  
  // 남은 상위노출 작업이 있으면 일반 작업 목록에 추가 (날짜 지정 안된 경우)
  normalTasks.push(...sanwiTasks)

  // 12. 일반 작업 배치 (메인 블로그는 하루 최대 2개 포스팅)
  let taskIndex = 0
  const maxBlogPostsPerDay = 2  // 메인 블로그 하루 최대 2개 포스팅

  for (const daySchedule of contentDaySchedules) {
    if (taskIndex >= normalTasks.length) break

    while (taskIndex < normalTasks.length) {
      const task = normalTasks[taskIndex]
      const remainingHours = daySchedule.availableHours - daySchedule.usedHours
      
      // 메인 블로그 작업(브랜드, 트렌드) 개수 계산
      const mainBlogTaskCount = daySchedule.tasks.filter(t => 
        !t.isReport && (t.type === 'brand' || t.type === 'trend') && t.hospitalId === hospitalId
      ).length
      
      // 메인 블로그 작업이면 2개 제한 확인
      const isMainBlogTask = (task.type === 'brand' || task.type === 'trend')
      if (isMainBlogTask && mainBlogTaskCount >= maxBlogPostsPerDay) {
        break  // 메인 블로그 작업이 이미 2개면 다음 날로
      }

      // 시간이 충분한 경우에만 배치
      if (task.duration <= remainingHours) {
        // 시작 시간 계산 (월요일은 10시부터, 나머지는 9시부터)
        const dayStartHour = isMonday(daySchedule.date) ? 10 : 9
        const startHourOffset = dayStartHour + daySchedule.usedHours
        const { hour: endHour, minute: endMinute } = addHours(startHourOffset, task.duration)

        daySchedule.tasks.push({
          hospitalId: task.hospitalId,
          hospitalName: task.hospitalName,
          type: task.type,
          label: task.label,
          startTime: formatTime(Math.floor(startHourOffset), 0),
          endTime: formatTime(endHour, endMinute),
          duration: task.duration,
          isReport: false
        })

        daySchedule.usedHours += task.duration
        taskIndex++
      } else {
        // 시간 부족 시 다음 날로 이동
        break
      }
    }
  }

  return daySchedules
}

/**
 * 스케줄을 데이터베이스에 저장
 */
export async function saveSchedule(
  db: D1Database,
  hospitalId: number,
  year: number,
  month: number,
  daySchedules: DaySchedule[]
): Promise<void> {
  // 기존 스케줄 삭제
  await db.prepare('DELETE FROM schedules WHERE hospital_id = ? AND year = ? AND month = ?')
    .bind(hospitalId, year, month)
    .run()

  // 새 스케줄 저장
  for (const daySchedule of daySchedules) {
    for (const task of daySchedule.tasks) {
      await db.prepare(`
        INSERT INTO schedules (
          hospital_id, year, month, task_date, task_type, task_name,
          start_time, end_time, duration_hours, is_report
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        task.hospitalId,
        year,
        month,
        formatDate(daySchedule.date),
        task.type,
        task.label,
        task.startTime,
        task.endTime,
        task.duration,
        task.isReport ? 1 : 0
      ).run()
    }
  }
}
