// 현재 구현 테스트
const year = 2026;
const month = 2;
const day = 27;

// 방법 1: Date.UTC 사용
const date1 = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
console.log('Date.UTC:', date1.toISOString(), '요일:', date1.getUTCDay());

// 방법 2: 로컬 타임존
const date2 = new Date(year, month - 1, day);
console.log('로컬:', date2.toString(), '요일:', date2.getDay());

// formatDate 시뮬레이션
function formatDate(date) {
  const kstOffset = 9 * 60;
  const utcTime = date.getTime() + date.getTimezoneOffset() * 60000;
  const kstTime = new Date(utcTime + kstOffset * 60000);
  
  const y = kstTime.getUTCFullYear();
  const m = String(kstTime.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kstTime.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

console.log('formatDate(date1):', formatDate(date1));
console.log('formatDate(date2):', formatDate(date2));

// getDay 시뮬레이션
function getKSTDay(date) {
  const kstOffset = 9 * 60;
  const utcTime = date.getTime() + date.getTimezoneOffset() * 60000;
  const kstTime = new Date(utcTime + kstOffset * 60000);
  return kstTime.getUTCDay();
}

console.log('KST 요일(date1):', getKSTDay(date1));
console.log('KST 요일(date2):', getKSTDay(date2));
