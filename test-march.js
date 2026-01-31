const HOLIDAYS_2026 = [
  '2026-01-01',
  '2026-02-16', '2026-02-17', '2026-02-18',
  '2026-03-01', '2026-03-02', // 삼일절
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

function calculateDueDate(year, month, baseDueDay, pullDays, vacations = []) {
  const adjustedDay = baseDueDay - pullDays;
  const dueDate = createKSTDate(year, month, adjustedDay);
  
  // 마감일이 주말/공휴일/연차인 경우 그 전 근무일로 자동 이동
  let finalDueDate = dueDate;
  while (isWeekendOrHoliday(finalDueDate, vacations)) {
    finalDueDate = new Date(finalDueDate);
    finalDueDate.setDate(finalDueDate.getDate() - 1);
  }
  
  return finalDueDate;
}

console.log('=== 3월 2일 마감일 테스트 ===');
const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
for (let day = 26; day <= 31; day++) {
  const date = createKSTDate(2026, 2, day);
  const kstOffset = 9 * 60;
  const utcTime = date.getTime() + date.getTimezoneOffset() * 60000;
  const kstTime = new Date(utcTime + kstOffset * 60000);
  const dayOfWeek = kstTime.getUTCDay();
  console.log(`2월 ${day}일 (${dayNames[dayOfWeek]}): 근무일=${!isWeekendOrHoliday(date)}`);
}

for (let day = 1; day <= 5; day++) {
  const date = createKSTDate(2026, 3, day);
  const kstOffset = 9 * 60;
  const utcTime = date.getTime() + date.getTimezoneOffset() * 60000;
  const kstTime = new Date(utcTime + kstOffset * 60000);
  const dayOfWeek = kstTime.getUTCDay();
  console.log(`3월 ${day}일 (${dayNames[dayOfWeek]}): 근무일=${!isWeekendOrHoliday(date)}, 공휴일=${HOLIDAYS_2026.includes(formatDate(date))}`);
}

console.log('\n=== 마감일 계산 ===');
const baseDueDay = 2; // 3월 2일
const pullDays = 0; // 당김 없음
const finalDueDate = calculateDueDate(2026, 3, baseDueDay, pullDays);
console.log(`기본 마감일: 3월 ${baseDueDay}일`);
console.log(`마감 당김: ${pullDays}일`);
console.log(`최종 마감일: ${formatDate(finalDueDate)}`);
