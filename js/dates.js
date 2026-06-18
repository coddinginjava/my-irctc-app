const IST_TIMEZONE = 'Asia/Kolkata';

function getISTParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '';

  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
  };
}

function formatISTDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function addDaysToISTDate(days, fromDate = new Date()) {
  const { year, month, day } = getISTParts(fromDate);
  const utcMidnight = Date.UTC(year, month - 1, day);
  const result = new Date(utcMidnight + days * 24 * 60 * 60 * 1000);
  return formatISTDate(result);
}

function getNextBookingDate() {
  return addDaysToISTDate(60);
}

function parseTimeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;
  return hours * 60 + minutes;
}

function getJourneyEndDateTime(journey) {
  const { year, month, day } = parseISODateParts(journey.journeyEndDate);
  const minutes = parseTimeToMinutes(journey.destination?.time);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return Date.UTC(year, month - 1, day, hours, mins);
}

function parseISODateParts(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return { year, month, day };
}

function getNowISTTimestamp() {
  const { year, month, day, hour, minute } = getISTParts();
  return Date.UTC(year, month - 1, day, hour, minute);
}

function isJourneyUpcoming(journey) {
  return getJourneyEndDateTime(journey) >= getNowISTTimestamp();
}

function formatDisplayDate(isoDate) {
  const { year, month, day } = parseISODateParts(isoDate);
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatDateRange(startDate, endDate) {
  if (startDate === endDate) return formatDisplayDate(startDate);
  return `${formatDisplayDate(startDate)} – ${formatDisplayDate(endDate)}`;
}

export {
  IST_TIMEZONE,
  getNextBookingDate,
  isJourneyUpcoming,
  formatDisplayDate,
  formatDateRange,
  getNowISTTimestamp,
};
