const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_PER_PERIOD = 7;

function dayNumber(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

function isoDateFromDayNumber(days) {
  return new Date(days * MS_PER_DAY).toISOString().slice(0, 10);
}

export function isValidIsoDate(text) {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return false;
  }
  return isoDateFromDayNumber(dayNumber(text)) === text;
}

export function isSaturday(isoDate) {
  return new Date(dayNumber(isoDate) * MS_PER_DAY).getUTCDay() === 6;
}

export function todayIso(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function periodForDate(anchorDate, date) {
  const daysSinceAnchor = dayNumber(date) - dayNumber(anchorDate);
  if (daysSinceAnchor < 0) return null;
  return Math.floor(daysSinceAnchor / DAYS_PER_PERIOD) + 1;
}

export function periodDates(anchorDate, number) {
  if (!Number.isInteger(number) || number < 1) {
    throw new Error('Period number must be a whole number from 1.');
  }
  const start = dayNumber(anchorDate) + (number - 1) * DAYS_PER_PERIOD;
  return {
    number,
    startDate: isoDateFromDayNumber(start),
    endDate: isoDateFromDayNumber(start + DAYS_PER_PERIOD - 1),
  };
}