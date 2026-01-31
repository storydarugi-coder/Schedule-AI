export type Bindings = {
  DB: D1Database;
}

export interface Hospital {
  id: number;
  name: string;
  base_due_day: number;
  created_at: string;
}

export interface MonthlyTask {
  id: number;
  hospital_id: number;
  year: number;
  month: number;
  sanwi_nosul: number;
  brand: number;
  trend: number;
  eonron_bodo: number;
  jisikin: number;
  deadline_pull_days: number;
  created_at: string;
}

export interface Schedule {
  id: number;
  hospital_id: number;
  year: number;
  month: number;
  task_date: string;
  task_type: string;
  task_name: string;
  start_time: string;
  end_time: string;
  duration_hours: number;
  is_report: number;
  created_at: string;
}

export interface TaskDefinition {
  type: string;
  duration: number;
  label: string;
}

export const TASK_DEFINITIONS: Record<string, TaskDefinition> = {
  sanwi_nosul: { type: 'sanwi_nosul', duration: 3.5, label: '상위노출' },
  brand: { type: 'brand', duration: 3.5, label: '브랜드' },
  trend: { type: 'trend', duration: 1.5, label: '트렌드' },
  eonron_bodo: { type: 'eonron_bodo', duration: 0.5, label: '언론보도' },
  jisikin: { type: 'jisikin', duration: 0.5, label: '지식인' },
  report: { type: 'report', duration: 2, label: '보고서' }
}

export const HOLIDAYS_2026 = [
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
]

export interface ScheduleRequest {
  hospital_id: number;
  year: number;
  month: number;
  sanwi_nosul: number;
  brand: number;
  trend: number;
  eonron_bodo: number;
  jisikin: number;
  deadline_pull_days: number;
}

export interface ScheduleError {
  hospital_name: string;
  shortage_hours: number;
  tasks: string[];
  message: string;
}
