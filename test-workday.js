// 2026년 2월의 모든 날짜 체크
const HOLIDAYS_2026 = [
  '2026-01-01',
  '2026-02-16', '2026-02-17', '2026-02-18', // 설날
  '2026-03-01', '2026-03-02'
];

function createKSTDate(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

function formatDate(date) {
  const kstOffset = 9 * 60;
  const utcTime = date.getTime() + date.getTimezoneOffset() * 60000;
  const kstTime = new Date(utcTime + kstOffset * 60000);
  
  const year = kstTime.getUTCFullYear();
  const month = String(kstTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kstTime.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isWeekendOrHoliday(date, vacations = []) {
  const kstOffset = 9 * 60;
  const utcTime = date.getTime() + date.getTimezoneOffset() * 60000;
  const kstTime = new Date(utcTime + kstOffset * 60000);
  const day = kstTime.getUTCDay();
  
  const dateStr = formatDate(date);
  return day === 0 || day === 6 || HOLIDAYS_2026.includes(dateStr) || vacations.includes(dateStr);
}

console.log('=== 2026년 2월 근무일 체크 ===');
for (let day = 24; day <= 28; day++) {
  const date = createKSTDate(2026, 2, day);
  const dateStr = formatDate(date);
  const kstOffset = 9 * 60;
  const utcTime = date.getTime() + date.getTimezoneOffset() * 60000;
  const kstTime = new Date(utcTime + kstOffset * 60000);
  const dayOfWeek = kstTime.getUTCDay();
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  
  console.log(`${dateStr} (${dayNames[dayOfWeek]}): 근무일=${!isWeekendOrHoliday(date)}`);
}

// 마감일 27일 테스트
console.log('\n=== 마감일 27일, 당김 1일 ===');
const baseDueDay = 27;
const pullDays = 1;
const adjustedDay = baseDueDay - pullDays;
const dueDate = createKSTDate(2026, 2, adjustedDay);
console.log('계산된 마감일:', formatDate(dueDate));
console.log('근무일 체크:', !isWeekendOrHoliday(dueDate));
