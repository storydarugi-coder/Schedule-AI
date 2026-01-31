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
  
  console.log(`[DEBUG] 연차/휴가 목록 (${year}-${month}):`, vacations)

  // 1. 병원 정보 조회
  const hospital = await db.prepare('SELECT * FROM hospitals WHERE id = ?')
    .bind(hospitalId)
    .first()
  
  if (!hospital) {
    throw new Error('병원을 찾을 수 없습니다')
  }

  const hospitalName = hospital.name as string
  const baseDueDay = hospital.base_due_day as number
  
  console.log(`[DEBUG] 병원: ${hospitalName}, 기본 마감일: ${baseDueDay}, 당김: ${monthlyTask.deadline_pull_days}일`)

  // 2. 마감일 및 작업 기간 계산
  let dueDate: Date
  let workStartDate: Date | null = null
  let workEndDate: Date | null = null

  // 작업 기간이 설정되어 있으면 우선 사용
  if (monthlyTask.work_start_date && monthlyTask.work_end_date) {
    workStartDate = new Date(monthlyTask.work_start_date)
    workEndDate = new Date(monthlyTask.work_end_date)
    dueDate = workEndDate
    console.log(`[DEBUG] 사용자 지정 작업 기간: ${monthlyTask.work_start_date} ~ ${monthlyTask.work_end_date}`)
  } else {
    // 기존 로직: 마감일 기준으로 계산
    try {
      dueDate = calculateDueDate(year, month, baseDueDay, monthlyTask.deadline_pull_days, vacations)
      console.log(`[DEBUG] 계산된 마감일: ${formatDate(dueDate)}`)
    } catch (error) {
      console.error(`[DEBUG] 마감일 계산 실패:`, error)
      return {
        hospital_name: hospitalName,
      shortage_hours: 0,
      tasks: [],
      message: (error as Error).message
    }
  }
  }

  // 3. 콘텐츠 완료 기한 계산
  const contentDeadline = getContentDeadline(dueDate, vacations)

  // 4. 근무일 목록 생성
  let workdays = getWorkdays(year, month, vacations)
  
  // 작업 기간이 설정되어 있으면 필터링
  if (workStartDate && workEndDate) {
    workdays = workdays.filter(d => d >= workStartDate && d <= workEndDate)
    console.log(`[DEBUG] 작업 기간 필터링 후 근무일 개수: ${workdays.length}일`)
    console.log(`[DEBUG] 근무일 범위: ${formatDate(workdays[0])} ~ ${formatDate(workdays[workdays.length - 1])}`)
  } else {
    console.log(`[DEBUG] 근무일 개수: ${workdays.length}일`)
    console.log(`[DEBUG] 근무일 목록 (처음 5개):`, workdays.slice(0, 5).map(d => formatDate(d)))
  }

  // 5. 해당 월의 모든 스케줄 조회 (다른 병원 작업 시간 고려)
  const allSchedules = await db.prepare(`
    SELECT task_date, SUM(duration_hours) as total_hours
    FROM schedules
    WHERE year = ? AND month = ? AND is_report = 0
    GROUP BY task_date
  `).bind(year, month).all()
  
  const existingHoursPerDay = new Map<string, number>()
  for (const row of allSchedules.results) {
    existingHoursPerDay.set((row as any).task_date, (row as any).total_hours || 0)
  }

  // 6. 일별 스케줄 초기화 (기존 작업 시간 반영)
  const daySchedules: DaySchedule[] = workdays.map(date => {
    const dateStr = formatDate(date)
    const existingHours = existingHoursPerDay.get(dateStr) || 0
    return {
      date,
      availableHours: getAvailableHours(date),
      usedHours: existingHours,  // 다른 병원 작업 시간 반영
      tasks: []
    }
  })

  // 7. 보고서 작업 고정 (마감일 당일 10:00~12:00)
  const reportDayIndex = daySchedules.findIndex(
    d => formatDate(d.date) === formatDate(dueDate)
  )
  
  console.log(`[DEBUG] 마감일 근무일 목록에서 인덱스: ${reportDayIndex}`)

  if (reportDayIndex === -1) {
    console.error(`[DEBUG] 근무일 목록에 마감일이 없음!`)
    console.error(`[DEBUG] 마감일: ${formatDate(dueDate)}`)
    console.error(`[DEBUG] 근무일 목록:`, daySchedules.map(d => formatDate(d.date)))
    return {
      hospital_name: hospitalName,
      shortage_hours: 0,
      tasks: ['보고서'],
      message: `마감일 ${formatDate(dueDate)}이 근무일이 아닙니다`
    }
  }

  // 보고서는 나중에 배치 (마지막에 추가)

  // 8. 상위노출 일자 먼저 가져오기 (병원 관리에서 설정한 여러 날짜)
  let sanwiNosolDays: number[] = []
  if (hospital.sanwi_nosul_days) {
    try {
      sanwiNosolDays = JSON.parse(hospital.sanwi_nosul_days as string)
    } catch (e) {
      // JSON 파싱 실패 시 빈 배열
      sanwiNosolDays = []
    }
  }

  // 9. 콘텐츠 작업 목록 생성 (브랜드/트렌드를 순서대로 하나씩)
  const tasks: Task[] = []
  
  // 브랜드와 트렌드를 순서대로 하나씩 배치 (하루에 하나만!)
  const brandCount = monthlyTask.brand
  const trendCount = monthlyTask.trend
  const totalBrandTrendCount = brandCount + trendCount
  
  // 게시 순서 결정 (brand_order, trend_order 사용)
  const brandOrder = monthlyTask.brand_order || 1
  const trendOrder = monthlyTask.trend_order || 2
  
  // 브랜드가 먼저인지, 트렌드가 먼저인지 결정
  const brandFirst = brandOrder < trendOrder
  
  let brandAdded = 0
  let trendAdded = 0
  
  // 총 개수만큼 순서대로 추가 (하루에 하나씩)
  for (let i = 0; i < totalBrandTrendCount; i++) {
    // 브랜드가 먼저면 브랜드부터, 트렌드가 먼저면 트렌드부터
    if (brandFirst) {
      // 브랜드 → 트렌드 → 브랜드 → 트렌드 ...
      if (i % 2 === 0 && brandAdded < brandCount) {
        tasks.push({
          hospitalId,
          hospitalName,
          type: 'brand',
          label: '브랜드',
          duration: 3.5,
          deadline: dueDate
        })
        brandAdded++
      } else if (i % 2 === 1 && trendAdded < trendCount) {
        tasks.push({
          hospitalId,
          hospitalName,
          type: 'trend',
          label: '트렌드',
          duration: 1.5,
          deadline: dueDate
        })
        trendAdded++
      } else if (brandAdded < brandCount) {
        // 트렌드가 다 찬 경우 나머지 브랜드 추가
        tasks.push({
          hospitalId,
          hospitalName,
          type: 'brand',
          label: '브랜드',
          duration: 3.5,
          deadline: dueDate
        })
        brandAdded++
      } else if (trendAdded < trendCount) {
        // 브랜드가 다 찬 경우 나머지 트렌드 추가
        tasks.push({
          hospitalId,
          hospitalName,
          type: 'trend',
          label: '트렌드',
          duration: 1.5,
          deadline: dueDate
        })
        trendAdded++
      }
    } else {
      // 트렌드 → 브랜드 → 트렌드 → 브랜드 ...
      if (i % 2 === 0 && trendAdded < trendCount) {
        tasks.push({
          hospitalId,
          hospitalName,
          type: 'trend',
          label: '트렌드',
          duration: 1.5,
          deadline: dueDate
        })
        trendAdded++
      } else if (i % 2 === 1 && brandAdded < brandCount) {
        tasks.push({
          hospitalId,
          hospitalName,
          type: 'brand',
          label: '브랜드',
          duration: 3.5,
          deadline: dueDate
        })
        brandAdded++
      } else if (trendAdded < trendCount) {
        // 브랜드가 다 찬 경우 나머지 트렌드 추가
        tasks.push({
          hospitalId,
          hospitalName,
          type: 'trend',
          label: '트렌드',
          duration: 1.5,
          deadline: dueDate
        })
        trendAdded++
      } else if (brandAdded < brandCount) {
        // 트렌드가 다 찬 경우 나머지 브랜드 추가
        tasks.push({
          hospitalId,
          hospitalName,
          type: 'brand',
          label: '브랜드',
          duration: 3.5,
          deadline: dueDate
        })
        brandAdded++
      }
    }
  }
  
  // 상위노출, 언론보도, 지식인 추가
  // 상위노출 개수는 병원 관리에서 설정한 날짜 개수로 자동 결정
  const sanwiCount = sanwiNosolDays.length > 0 ? sanwiNosolDays.length : monthlyTask.sanwi_nosul
  
  const otherTaskDefs = [
    { type: 'sanwi_nosul', count: sanwiCount, duration: 3.5, label: '상위노출' },
    { type: 'eonron_bodo', count: monthlyTask.eonron_bodo, duration: 0.5, label: '언론보도' },
    { type: 'jisikin', count: monthlyTask.jisikin, duration: 0.5, label: '지식인' },
    { type: 'cafe_posting', count: monthlyTask.cafe || 0, duration: 0.5, label: '카페 포스팅' }
  ]
  
  for (const taskDef of otherTaskDefs) {
    for (let i = 0; i < taskDef.count; i++) {
      tasks.push({
        hospitalId,
        hospitalName,
        type: taskDef.type,
        label: taskDef.label,
        duration: taskDef.duration,
        deadline: dueDate
      })
    }
  }

  // 10. 상위노출 작업과 일반 작업 분리
  const sanwiTasks = tasks.filter(t => t.type === 'sanwi_nosul')
  const normalTasks = tasks.filter(t => t.type !== 'sanwi_nosul')
  
  // 11. 콘텐츠 작업 배치 (마감일 당일까지 가능)
  const contentDaySchedules = daySchedules.filter(
    d => d.date <= dueDate
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

  // 12. 상위노출 작업 먼저 배치 (지정된 날짜들에만)
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
  
  // 13. 일반 작업 배치 개선 (브랜드/트렌드 골고루 분산)
  const maxBlogPostsPerDay = 1  // 메인 블로그 하루 1개 포스팅
  const maxHoursPerHospitalPerDay = 6  // 한 병원당 하루 최대 6시간

  // 브랜드/트렌드와 기타 작업 분리
  const blogTasks = normalTasks.filter(t => t.type === 'brand' || t.type === 'trend')
  const otherTasks = normalTasks.filter(t => t.type !== 'brand' && t.type !== 'trend')

  console.log(`[DEBUG] 블로그 작업: ${blogTasks.length}개, 기타 작업: ${otherTasks.length}개`)

  // 1단계: 브랜드/트렌드 골고루 분산 배치
  let blogTaskIndex = 0
  for (const daySchedule of contentDaySchedules) {
    if (blogTaskIndex >= blogTasks.length) break

    // 이미 메인 블로그 작업이 있으면 건너뛰기
    const mainBlogTaskCount = daySchedule.tasks.filter(t => 
      !t.isReport && (t.type === 'brand' || t.type === 'trend') && t.hospitalId === hospitalId
    ).length
    
    if (mainBlogTaskCount >= maxBlogPostsPerDay) continue

    const task = blogTasks[blogTaskIndex]
    const remainingHours = daySchedule.availableHours - daySchedule.usedHours
    const hospitalUsedHours = daySchedule.tasks
      .filter(t => t.hospitalId === hospitalId)
      .reduce((sum, t) => sum + t.duration, 0)

    // 병원 하루 최대 시간 체크
    if (hospitalUsedHours + task.duration > maxHoursPerHospitalPerDay) continue

    // 시간이 충분한 경우에만 배치
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
      blogTaskIndex++
    }
  }

  // 2단계: 기타 작업 배치 (상위노출, 언론보도, 지식인, 카페)
  let otherTaskIndex = 0
  for (const daySchedule of contentDaySchedules) {
    if (otherTaskIndex >= otherTasks.length) break

    while (otherTaskIndex < otherTasks.length) {
      const task = otherTasks[otherTaskIndex]
      const remainingHours = daySchedule.availableHours - daySchedule.usedHours
      const hospitalUsedHours = daySchedule.tasks
        .filter(t => t.hospitalId === hospitalId)
        .reduce((sum, t) => sum + t.duration, 0)

      // 병원 하루 최대 시간 체크
      if (hospitalUsedHours + task.duration > maxHoursPerHospitalPerDay) {
        break
      }

      // 시간이 충분한 경우에만 배치
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
        otherTaskIndex++
      } else {
        // 시간 부족 시 다음 날로 이동
        break
      }
    }
  }

  // 14. 배치되지 못한 작업 확인 및 "일찍 출근" 일정 자동 추가
  if (unscheduledTasks.length > 0) {
    const unscheduledHours = unscheduledTasks.reduce((sum, t) => sum + t.duration, 0)
    
    // 일찍 출근으로 필요한 일수 계산 (하루에 1.5시간씩 확보)
    const earlyDaysNeeded = Math.ceil(unscheduledHours / 1.5) // 하루 1.5시간 = 07:30~09:00
    
    // 콘텐츠 작업 가능한 날짜에 "일찍 출근" 일정 추가
    let addedEarlyDays = 0
    let unscheduledIndex = 0
    for (const daySchedule of contentDaySchedules) {
      if (addedEarlyDays >= earlyDaysNeeded) break
      
      // 월요일은 이미 10시 시작이므로 제외
      if (isMonday(daySchedule.date)) continue
      
      // 이 날에 배치될 작업 이름 확인
      const nextTask = unscheduledTasks[unscheduledIndex]
      const taskLabel = nextTask ? nextTask.label : '콘텐츠 작업'
      
      // 07:30~09:00 "일찍 출근" 일정 추가 (구체적 작업 표시)
      daySchedule.tasks.unshift({
        hospitalId,
        hospitalName,
        type: 'early_start',
        label: `일찍 출근 (${taskLabel})`,
        startTime: '07:30',
        endTime: '09:00',
        duration: 1.5,
        isReport: false
      })
      
      // availableHours도 증가시킴 (1.5시간 추가)
      daySchedule.availableHours += 1.5
      
      addedEarlyDays++
      unscheduledIndex++
    }
    
    // 남은 작업은 일반 작업으로 다시 배치 시도 (이제 시간 여유 있음)
    for (const task of unscheduledTasks) {
      for (const daySchedule of contentDaySchedules) {
        const remainingHours = daySchedule.availableHours - daySchedule.usedHours
        
        if (task.duration <= remainingHours) {
          const hasEarlyStart = daySchedule.tasks.some(t => t.type === 'early_start')
          const dayStartHour = isMonday(daySchedule.date) ? 10 : (hasEarlyStart ? 7.5 : 9) // 일찍 출근 시 7:30 시작
          const startHourOffset = dayStartHour + daySchedule.usedHours
          const { hour: endHour, minute: endMinute } = addHours(startHourOffset, task.duration)

          daySchedule.tasks.push({
            hospitalId: task.hospitalId,
            hospitalName: task.hospitalName,
            type: task.type,
            label: task.label,
            startTime: formatTime(Math.floor(startHourOffset), (startHourOffset % 1) * 60),
            endTime: formatTime(endHour, endMinute),
            duration: task.duration,
            isReport: false
          })

          daySchedule.usedHours += task.duration
          break
        }
      }
    }
  }

  // 15. 보고서 작업을 마감일 맨 마지막에 배치 (다른 작업 후)
  const reportDay = daySchedules[reportDayIndex]
  
  // 일찍 출근이 있는지 확인
  const hasEarlyStart = reportDay.tasks.some(t => t.type === 'early_start')
  const dayStartHour = isMonday(reportDay.date) ? 10 : (hasEarlyStart ? 7.5 : 9)
  
  // 보고서는 모든 작업 후 마지막에 배치
  const reportStartHourOffset = dayStartHour + reportDay.usedHours
  const { hour: reportEndHour, minute: reportEndMinute } = addHours(reportStartHourOffset, 2)
  
  reportDay.tasks.push({
    hospitalId,
    hospitalName,
    type: 'report',
    label: '보고서',
    startTime: formatTime(Math.floor(reportStartHourOffset), (reportStartHourOffset % 1) * 60),
    endTime: formatTime(reportEndHour, reportEndMinute),
    duration: 2,
    isReport: true
  })
  reportDay.usedHours += 2

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
    for (let i = 0; i < daySchedule.tasks.length; i++) {
      const task = daySchedule.tasks[i];
      await db.prepare(`
        INSERT INTO schedules (
          hospital_id, year, month, task_date, task_type, task_name,
          start_time, end_time, duration_hours, is_report, order_index
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        task.isReport ? 1 : 0,
        i // order_index는 배열 인덱스
      ).run()
    }
  }
}
