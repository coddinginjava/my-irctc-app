import { getNextBookingDate, formatDisplayDate, formatDateRange } from './dates.js';
import {
  sortJourneys,
  filterByView,
  filterByName,
  validateJourney,
  createJourney,
} from './data.js';
import {
  isAuthenticated,
  setToken,
  clearToken,
  getJourneys,
  saveJourneys,
} from './github.js';

const state = {
  journeys: [],
  view: 'upcoming',
  nameQuery: '',
  editingId: null,
  deletingId: null,
  openAccordionId: null,
  loading: false,
};

const els = {
  bookingDate: document.getElementById('bookingDate'),
  syncStatus: document.getElementById('syncStatus'),
  authBtn: document.getElementById('authBtn'),
  nameFilter: document.getElementById('nameFilter'),
  addBtn: document.getElementById('addBtn'),
  journeyList: document.getElementById('journeyList'),
  emptyState: document.getElementById('emptyState'),
  emptyStateText: document.getElementById('emptyStateText'),
  authModal: document.getElementById('authModal'),
  authForm: document.getElementById('authForm'),
  authClose: document.getElementById('authClose'),
  authCancel: document.getElementById('authCancel'),
  tokenInput: document.getElementById('tokenInput'),
  authError: document.getElementById('authError'),
  journeyModal: document.getElementById('journeyModal'),
  journeyForm: document.getElementById('journeyForm'),
  journeyModalTitle: document.getElementById('journeyModalTitle'),
  journeyClose: document.getElementById('journeyClose'),
  journeyCancel: document.getElementById('journeyCancel'),
  pnrInput: document.getElementById('pnrInput'),
  startDateInput: document.getElementById('startDateInput'),
  endDateInput: document.getElementById('endDateInput'),
  boardingStationInput: document.getElementById('boardingStationInput'),
  boardingTimeInput: document.getElementById('boardingTimeInput'),
  destinationStationInput: document.getElementById('destinationStationInput'),
  destinationTimeInput: document.getElementById('destinationTimeInput'),
  passengerRows: document.getElementById('passengerRows'),
  addPassengerBtn: document.getElementById('addPassengerBtn'),
  formError: document.getElementById('formError'),
  deleteModal: document.getElementById('deleteModal'),
  deleteCancel: document.getElementById('deleteCancel'),
  deleteConfirm: document.getElementById('deleteConfirm'),
  toast: document.getElementById('toast'),
  viewBtns: document.querySelectorAll('[data-view]'),
};

function showToast(message, type = '') {
  els.toast.textContent = message;
  els.toast.hidden = false;
  els.toast.className = `toast${type ? ` toast--${type}` : ''}`;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    els.toast.hidden = true;
  }, 3500);
}

function setSyncStatus(text, type = '') {
  els.syncStatus.textContent = text;
  els.syncStatus.className = `sync-status${type ? ` sync-status--${type}` : ''}`;
}

function updateAuthUI() {
  const authed = isAuthenticated();
  els.authBtn.textContent = authed ? 'Sign out' : 'Sign in';
  els.addBtn.disabled = !authed;
}

function getVisibleJourneys() {
  let list = filterByView(state.journeys, state.view);
  list = filterByName(list, state.nameQuery);
  return sortJourneys(list, state.view === 'completed');
}

function renderBookingDate() {
  els.bookingDate.textContent = getNextBookingDate();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatTime(time) {
  if (!time) return '—';
  const [h, m] = time.split(':');
  const hour = Number(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function renderPassengerRows(passengers = [{ name: '', seat: '' }]) {
  els.passengerRows.innerHTML = '';
  passengers.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'passenger-row';
    row.innerHTML = `
      <label class="field">
        <span class="field__label">Name</span>
        <input type="text" class="input passenger-name" value="${escapeHtml(p.name)}" required placeholder="Passenger name">
      </label>
      <label class="field">
        <span class="field__label">Seat</span>
        <input type="text" class="input passenger-seat" value="${escapeHtml(p.seat)}" placeholder="e.g. B2-45">
      </label>
      ${passengers.length > 1 ? '<button type="button" class="btn btn--ghost btn--sm remove-passenger" aria-label="Remove passenger">&times;</button>' : '<span></span>'}
    `;
    row.querySelector('.remove-passenger')?.addEventListener('click', () => {
      row.remove();
    });
    els.passengerRows.appendChild(row);
  });
}

function getPassengersFromForm() {
  const rows = els.passengerRows.querySelectorAll('.passenger-row');
  return Array.from(rows).map((row) => ({
    name: row.querySelector('.passenger-name').value,
    seat: row.querySelector('.passenger-seat').value,
  }));
}

function renderAccordion() {
  const journeys = getVisibleJourneys();
  els.journeyList.innerHTML = '';

  if (journeys.length === 0) {
    els.emptyState.hidden = false;
    if (!isAuthenticated()) {
      els.emptyStateText.textContent = 'Sign in and add your first journey to get started.';
    } else if (state.nameQuery) {
      els.emptyStateText.textContent = `No journeys found matching "${state.nameQuery}".`;
    } else if (state.view === 'upcoming') {
      els.emptyStateText.textContent = 'No upcoming journeys. Add one or switch to Completed.';
    } else {
      els.emptyStateText.textContent = 'No completed journeys yet.';
    }
    return;
  }

  els.emptyState.hidden = true;

  journeys.forEach((j) => {
    const isOpen = state.openAccordionId === j.id;
    const passengerNames = j.passengers.map((p) => p.name).join(', ');
    const item = document.createElement('div');
    item.className = `accordion__item${isOpen ? ' accordion__item--open' : ''}`;
    item.innerHTML = `
      <button type="button" class="accordion__trigger" aria-expanded="${isOpen}">
        <div class="accordion__summary">
          <div class="accordion__pnr">PNR ${escapeHtml(j.pnr)}</div>
          <div class="accordion__route">${escapeHtml(j.boarding.station)} → ${escapeHtml(j.destination.station)}</div>
          <div class="accordion__meta">${formatDateRange(j.journeyStartDate, j.journeyEndDate)} · ${escapeHtml(passengerNames)}</div>
        </div>
        <svg class="accordion__chevron" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"/>
        </svg>
      </button>
      <div class="accordion__panel">
        <div class="detail-grid">
          <div class="detail-row">
            <div class="detail-item">
              <div class="detail-item__label">Start Date</div>
              <div class="detail-item__value">${formatDisplayDate(j.journeyStartDate)}</div>
            </div>
            <div class="detail-item">
              <div class="detail-item__label">End Date</div>
              <div class="detail-item__value">${formatDisplayDate(j.journeyEndDate)}</div>
            </div>
            <div class="detail-item">
              <div class="detail-item__label">Boarding</div>
              <div class="detail-item__value">${escapeHtml(j.boarding.station)}<br><small>${formatTime(j.boarding.time)}</small></div>
            </div>
            <div class="detail-item">
              <div class="detail-item__label">Destination</div>
              <div class="detail-item__value">${escapeHtml(j.destination.station)}<br><small>${formatTime(j.destination.time)}</small></div>
            </div>
          </div>
          <div>
            <div class="detail-item__label">Passengers</div>
            <table class="passengers-table">
              <thead><tr><th>Name</th><th>Seat</th></tr></thead>
              <tbody>
                ${j.passengers.map((p) => `<tr><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.seat || '—')}</td></tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
        <div class="accordion__actions">
          <button type="button" class="btn btn--ghost btn--sm edit-btn">Edit</button>
          <button type="button" class="btn btn--ghost btn--sm delete-btn" style="color:var(--danger)">Delete</button>
        </div>
      </div>
    `;

    item.querySelector('.accordion__trigger').addEventListener('click', () => {
      state.openAccordionId = isOpen ? null : j.id;
      renderAccordion();
    });

    item.querySelector('.edit-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openJourneyModal(j);
    });

    item.querySelector('.delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openDeleteModal(j.id);
    });

    els.journeyList.appendChild(item);
  });
}

function render() {
  renderBookingDate();
  updateAuthUI();
  renderAccordion();
}

async function loadJourneys() {
  if (!isAuthenticated()) {
    state.journeys = [];
    render();
    return;
  }

  state.loading = true;
  setSyncStatus('Syncing…', 'loading');

  try {
    const data = await getJourneys();
    state.journeys = data.journeys || [];
    setSyncStatus('Synced', 'ok');
  } catch (err) {
    setSyncStatus('Sync failed', 'error');
    showToast(err.message, 'error');
    state.journeys = [];
  } finally {
    state.loading = false;
    render();
  }
}

async function persistJourneys() {
  setSyncStatus('Saving…', 'loading');
  try {
    await saveJourneys({ journeys: state.journeys });
    setSyncStatus('Saved', 'ok');
    showToast('Journey saved', 'success');
  } catch (err) {
    setSyncStatus('Save failed', 'error');
    showToast(err.message, 'error');
    throw err;
  }
}

function openAuthModal() {
  els.authError.hidden = true;
  els.tokenInput.value = '';
  els.authModal.showModal();
  els.tokenInput.focus();
}

function closeAuthModal() {
  els.authModal.close();
}

function handleAuth() {
  if (isAuthenticated()) {
    clearToken();
    state.journeys = [];
    setSyncStatus('');
    showToast('Signed out');
    render();
    return;
  }
  openAuthModal();
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const token = els.tokenInput.value.trim();
  if (!token) return;

  els.authError.hidden = true;
  setToken(token);

  try {
    await loadJourneys();
    closeAuthModal();
    showToast('Signed in successfully', 'success');
  } catch (err) {
    clearToken();
    els.authError.textContent = err.message;
    els.authError.hidden = false;
  }
}

function openJourneyModal(journey = null) {
  state.editingId = journey?.id ?? null;
  els.journeyModalTitle.textContent = journey ? 'Edit Journey' : 'Add Journey';
  els.formError.hidden = true;

  els.pnrInput.value = journey?.pnr ?? '';
  els.startDateInput.value = journey?.journeyStartDate ?? '';
  els.endDateInput.value = journey?.journeyEndDate ?? '';
  els.boardingStationInput.value = journey?.boarding?.station ?? '';
  els.boardingTimeInput.value = journey?.boarding?.time ?? '';
  els.destinationStationInput.value = journey?.destination?.station ?? '';
  els.destinationTimeInput.value = journey?.destination?.time ?? '';

  renderPassengerRows(journey?.passengers ?? [{ name: '', seat: '' }]);
  els.journeyModal.showModal();
}

function closeJourneyModal() {
  els.journeyModal.close();
  state.editingId = null;
}

async function handleJourneySubmit(e) {
  e.preventDefault();

  const formData = {
    id: state.editingId,
    pnr: els.pnrInput.value,
    journeyStartDate: els.startDateInput.value,
    journeyEndDate: els.endDateInput.value,
    boarding: {
      station: els.boardingStationInput.value,
      time: els.boardingTimeInput.value,
    },
    destination: {
      station: els.destinationStationInput.value,
      time: els.destinationTimeInput.value,
    },
    passengers: getPassengersFromForm(),
  };

  const errors = validateJourney(formData);
  if (errors.length) {
    els.formError.textContent = errors[0];
    els.formError.hidden = false;
    return;
  }

  const journey = createJourney(formData);

  if (state.editingId) {
    const idx = state.journeys.findIndex((j) => j.id === state.editingId);
    if (idx !== -1) state.journeys[idx] = journey;
  } else {
    state.journeys.push(journey);
  }

  try {
    await persistJourneys();
    closeJourneyModal();
    render();
  } catch {
    if (!state.editingId) {
      state.journeys.pop();
    }
  }
}

function openDeleteModal(id) {
  state.deletingId = id;
  els.deleteModal.showModal();
}

function closeDeleteModal() {
  els.deleteModal.close();
  state.deletingId = null;
}

async function handleDelete() {
  const id = state.deletingId;
  if (!id) return;

  const idx = state.journeys.findIndex((j) => j.id === id);
  if (idx === -1) return;

  const removed = state.journeys.splice(idx, 1);

  try {
    await persistJourneys();
    if (state.openAccordionId === id) state.openAccordionId = null;
    closeDeleteModal();
    render();
    showToast('Journey deleted', 'success');
  } catch {
    state.journeys.splice(idx, 0, ...removed);
  }
}

function bindEvents() {
  els.authBtn.addEventListener('click', handleAuth);
  els.authForm.addEventListener('submit', handleAuthSubmit);
  els.authClose.addEventListener('click', closeAuthModal);
  els.authCancel.addEventListener('click', closeAuthModal);

  els.nameFilter.addEventListener('input', (e) => {
    state.nameQuery = e.target.value;
    renderAccordion();
  });

  els.viewBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      state.view = btn.dataset.view;
      els.viewBtns.forEach((b) => b.classList.toggle('segmented__btn--active', b === btn));
      renderAccordion();
    });
  });

  els.addBtn.addEventListener('click', () => openJourneyModal());
  els.journeyForm.addEventListener('submit', handleJourneySubmit);
  els.journeyClose.addEventListener('click', closeJourneyModal);
  els.journeyCancel.addEventListener('click', closeJourneyModal);
  els.addPassengerBtn.addEventListener('click', () => {
    renderPassengerRows([...getPassengersFromForm(), { name: '', seat: '' }]);
  });

  els.deleteCancel.addEventListener('click', closeDeleteModal);
  els.deleteConfirm.addEventListener('click', handleDelete);

  els.journeyModal.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeJourneyModal();
  });
}

function init() {
  bindEvents();
  renderBookingDate();
  updateAuthUI();

  if (isAuthenticated()) {
    loadJourneys();
  } else {
    renderAccordion();
  }
}

init();
