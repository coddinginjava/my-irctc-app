import { isJourneyUpcoming } from './dates.js';

function generateId() {
  return crypto.randomUUID();
}

function sortJourneys(journeys, completed = false) {
  const sorted = [...journeys].sort((a, b) => {
    const dateCompare = a.journeyStartDate.localeCompare(b.journeyStartDate);
    if (dateCompare !== 0) return dateCompare;
    return (a.boarding?.time ?? '').localeCompare(b.boarding?.time ?? '');
  });
  return completed ? sorted.reverse() : sorted;
}

function filterByView(journeys, view) {
  const upcoming = view === 'upcoming';
  return journeys.filter((j) => isJourneyUpcoming(j) === upcoming);
}

function filterByName(journeys, query) {
  const q = query.trim().toLowerCase();
  if (!q) return journeys;
  return journeys.filter((j) =>
    j.passengers.some((p) => p.name.toLowerCase().includes(q))
  );
}

function validateJourney(data) {
  const errors = [];
  if (!data.pnr?.trim()) errors.push('PNR is required');
  if (!data.journeyStartDate) errors.push('Journey start date is required');
  if (!data.journeyEndDate) errors.push('Journey end date is required');
  if (data.journeyEndDate < data.journeyStartDate) {
    errors.push('End date cannot be before start date');
  }
  if (!data.boarding?.station?.trim()) errors.push('Boarding station is required');
  if (!data.destination?.station?.trim()) errors.push('Destination station is required');
  if (!data.passengers?.length) errors.push('At least one passenger is required');
  data.passengers?.forEach((p, i) => {
    if (!p.name?.trim()) errors.push(`Passenger ${i + 1} name is required`);
  });
  return errors;
}

function createJourney(formData) {
  return {
    id: formData.id || generateId(),
    pnr: formData.pnr.trim(),
    journeyStartDate: formData.journeyStartDate,
    journeyEndDate: formData.journeyEndDate,
    boarding: {
      station: formData.boarding.station.trim(),
      time: formData.boarding.time || '',
    },
    destination: {
      station: formData.destination.station.trim(),
      time: formData.destination.time || '',
    },
    passengers: formData.passengers
      .filter((p) => p.name.trim())
      .map((p) => ({ name: p.name.trim(), seat: (p.seat || '').trim() })),
  };
}

export {
  generateId,
  sortJourneys,
  filterByView,
  filterByName,
  validateJourney,
  createJourney,
};
