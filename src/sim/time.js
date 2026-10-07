// Game clock. One tick = one game minute. Weeks have 5 working days, a month has 4 weeks.
export const DAY_MIN = 1440;
export const WORK_START = 9 * 60;
export const WORK_END = 18 * 60;
export const DAYS_PER_MONTH = 20;
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

export function clock(t) {
  const day = Math.floor(t / DAY_MIN);
  const minute = t - day * DAY_MIN;
  return {
    day, minute, hour: minute / 60,
    weekday: day % 5,
    week: Math.floor(day / 5) + 1,
    month: Math.floor(day / DAYS_PER_MONTH) + 1,
    dayOfMonth: day % DAYS_PER_MONTH,
  };
}

export const dayName = (day) => WEEKDAYS[((day % 5) + 5) % 5];

export function hhmm(minute) {
  const h = Math.floor(minute / 60), m = Math.floor(minute % 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

export function dateLabel(t) {
  const c = clock(t);
  return `${WEEKDAYS[c.weekday]} · Week ${c.week} · ${hhmm(c.minute)}`;
}

// 0 = full daylight, 0.5 = night
export function darkness(hour) {
  if (hour < 5) return 0.5;
  if (hour < 7.5) return 0.5 * (1 - (hour - 5) / 2.5);
  if (hour < 17) return 0;
  if (hour < 20) return 0.5 * (hour - 17) / 3;
  return 0.5;
}
