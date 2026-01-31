import { HOLIDAYS_2026 } from './types'

/**
 * UTC+09:00 (한국 시간) 기준으로 날짜 생성
 */
function createKSTDate(year: number, month: number, day: number): Date {
  // UTC 시간으로 생성 후 +9시간 오프셋 적용
  const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  // KST는 UTC+9이므로 9시간을 빼서 로컬 타임존 상관없이 동일한 날짜 보장
  return date;
}

/**
 * 날짜를 YYYY-MM-DD 형식으로 변환 (UTC+09:00 기준)
 */
export function formatDate(date: Date): string {
  // UTC 시간에 9시간을 더해 KST로 변환
  const kstOffset = 9 * 60; // 9시간을 분으로
  const utcTime = date.getTime() + date.getTimezoneOffset() * 60000;
  const kstTime = new Date(utcTime + kstOffset * 60000);
  
  const year = kstTime.getUTCFullYear();
  const month = String(kstTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kstTime.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 주말 또는 공휴일인지 확인 (UTC+09:00 기준)
 */
export function isWeekendOrHoliday(date: Date, vacations: string[] = []): boolean {
  // UTC+09:00 기준 요일 계산
  const kstOffset = 9 * 60;
  const utcTime = date.getTime() + date.getTimezoneOffset() * 60000;
  const kstTime = new Date(utcTime + kstOffset * 60000);
  const day = kstTime.getUTCDay();
  
  const dateStr = formatDate(date); // 로컬 타임존 사용
  return day === 0 || day === 6 || HOLIDAYS_2026.includes(dateStr) || vacations.includes(dateStr)
}

/**
 * 월요일인지 확인 (UTC+09:00 기준)
 */
export function isMonday(date: Date): boolean {
  // UTC+09:00 기준 요일 계산
  const kstOffset = 9 * 60;
  const utcTime = date.getTime() + date.getTimezoneOffset() * 60000;
  const kstTime = new Date(utcTime + kstOffset * 60000);
  return kstTime.getUTCDay() === 1;
}

/**
 * 특정 월의 근무일 목록 생성
 */
export function getWorkdays(year: number, month: number, vacations: string[] = []): Date[] {
  const workdays: Date[] = []
  const lastDay = new Date(year, month, 0).getDate()
  
  for (let day = 1; day <= lastDay; day++) {
    const date = createKSTDate(year, month, day)
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
  const dueDate = createKSTDate(year, month, adjustedDay)
  
  // 마감일이 주말/공휴일/연차인 경우 그 전 근무일로 자동 이동
  let finalDueDate = dueDate
  while (isWeekendOrHoliday(finalDueDate, vacations)) {
    finalDueDate = new Date(finalDueDate)
    finalDueDate.setDate(finalDueDate.getDate() - 1)
  }
  
  return finalDueDate
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
 * 근무 가능 시간 계산 (월요일은 7.5시간, 나머지는 8.5시간)
 */
export function getAvailableHours(date: Date): number {
  return isMonday(date) ? 7.5 : 8.5
}
