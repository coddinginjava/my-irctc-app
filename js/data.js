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

function parsePassengerStatus(passenger) {
  const explicit = (passenger.status || '').trim().toUpperCase();
  if (['CNF', 'RAC', 'WL', 'TLWL'].includes(explicit)) return explicit;

  const text = (passenger.seat || '').toUpperCase();
  if (text.includes('TLWL')) return 'TLWL';
  if (text.includes('WL')) return 'WL';
  if (text.includes('RAC')) return 'RAC';
  if (text.includes('CNF')) return 'CNF';
  return null;
}

function getJourneyStatusClass(passengers) {
  const statuses = passengers.map(parsePassengerStatus).filter(Boolean);
  if (statuses.some((s) => s === 'WL' || s === 'TLWL')) return 'accordion__item--wl';
  if (statuses.some((s) => s === 'RAC')) return 'accordion__item--rac';
  if (statuses.some((s) => s === 'CNF')) return 'accordion__item--cnf';
  return '';
}

function getTrainTimeTag(boardingTime) {
  if (!boardingTime) return null;

  const [hours] = boardingTime.split(':').map(Number);
  if (Number.isNaN(hours)) return null;

  if (hours >= 18 || hours < 5) {
    return { label: 'Evening', className: 'tag tag--evening' };
  }
  if (hours >= 12) {
    return { label: 'Afternoon', className: 'tag tag--afternoon' };
  }
  return { label: 'Morning', className: 'tag tag--morning' };
}

function formatPassengerStatusLabel(status) {
  if (!status) return '';
  if (status === 'CNF') return 'CNF';
  return status;
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
      .map((p) => ({
        name: p.name.trim(),
        seat: (p.seat || '').trim(),
        status: (p.status || '').trim().toUpperCase(),
      })),
  };
}

export {
  generateId,
  sortJourneys,
  filterByView,
  filterByName,
  validateJourney,
  createJourney,
  getTrainTimeTag,
  getJourneyStatusClass,
  parsePassengerStatus,
  formatPassengerStatusLabel,
};
