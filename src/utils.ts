import { HOLIDAYS_2026 } from './types'

/**
 * 주말 또는 공휴일인지 확인
 */
export function isWeekendOrHoliday(date: Date, vacations: string[] = []): boolean {
  const day = date.getDay()
  const dateStr = date.toISOString().split('T')[0]
  return day === 0 || day === 6 || HOLIDAYS_2026.includes(dateStr) || vacations.includes(dateStr)
}

/**
 * 월요일인지 확인
 */
export function isMonday(date: Date): boolean {
  return date.getDay() === 1
}

/**
 * 특정 월의 근무일 목록 생성
 */
export function getWorkdays(year: number, month: number, vacations: string[] = []): Date[] {
  const workdays: Date[] = []
  const lastDay = new Date(year, month, 0).getDate()
  
  for (let day = 1; day <= lastDay; day++) {
    const date = new Date(year, month - 1, day)
    if (!isWeekendOrHoliday(date, vacations)) {
      workdays.push(date)
    }
  }
  
  return workdays
}

/**
 * 마감일 계산 (당김 적용)
 */
export function calculateDueDate(year: number, month: number, baseDueDay: number, pullDays: number, vacations: string[] = []): Date {
  const adjustedDay = baseDueDay - pullDays
  const dueDate = new Date(year, month - 1, adjustedDay)
  
  // 마감일이 주말/공휴일/연차인 경우 경고 (이미 당김 적용했는데도 근무 불가일이면 문제)
  if (isWeekendOrHoliday(dueDate, vacations)) {
    throw new Error(`마감일이 여전히 주말/공휴일/연차입니다: ${dueDate.toISOString().split('T')[0]}`)
  }
  
  return dueDate
}

/**
 * 콘텐츠 완료 기한 계산 (마감일 - 1일)
 */
export function getContentDeadline(dueDate: Date, vacations: string[] = []): Date {
  const deadline = new Date(dueDate)
  deadline.setDate(deadline.getDate() - 1)
  
  // 완료 기한이 주말/공휴일/연차이면 그 전 근무일로 이동
  while (isWeekendOrHoliday(deadline, vacations)) {
    deadline.setDate(deadline.getDate() - 1)
  }
  
  return deadline
}

/**
 * 날짜를 YYYY-MM-DD 형식으로 변환
 */
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

/**
 * 시간을 HH:MM 형식으로 변환
 */
export function formatTime(hour: number, minute: number = 0): string {
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
}

/**
 * 시간 더하기 (9시 + 3.5시간 = 12시 30분)
 */
export function addHours(startHour: number, durationHours: number): { hour: number; minute: number } {
  const totalMinutes = startHour * 60 + durationHours * 60
  const hour = Math.floor(totalMinutes / 60)
  const minute = Math.floor(totalMinutes % 60)
  return { hour, minute }
}

/**
 * 근무 가능 시간 계산 (월요일은 7시간, 나머지는 8시간)
 */
export function getAvailableHours(date: Date): number {
  return isMonday(date) ? 7 : 8
}
