import { getNextBookingDate, getNextBookingDateISO, getTodayISO, getBookingInfo, formatDisplayDate, formatDateRange } from './dates.js';
import {
  sortJourneys,
  filterByView,
  filterByName,
  validateJourney,
  createJourney,
  getTrainTimeTag,
  getJourneyStatusClass,
  parsePassengerStatus,
  formatPassengerStatusLabel,
} from './data.js';
import { encryptJourneys, decryptJourneys } from './crypto.js';
import {
  isAuthenticated,
  setToken,
  clearToken,
  getEncryptedEnvelope,
  saveEncryptedEnvelope,
  getLegacyPlaintextJourneys,
  deleteLegacyPlaintextFile,
  encryptedFileExists,
  legacyFileExists,
} from './github.js';

const PASSPHRASE_KEY = 'irctc_passphrase';

const state = {
  journeys: [],
  view: 'upcoming',
  nameQuery: '',
  editingId: null,
  deletingId: null,
  openAccordionId: null,
  loading: false,
  unlockMode: 'unlock',
  migrateLegacy: false,
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
  bookingHeroBtn: document.getElementById('bookingHeroBtn'),
  bookingCalcModal: document.getElementById('bookingCalcModal'),
  bookingCalcClose: document.getElementById('bookingCalcClose'),
  bookingCalcDone: document.getElementById('bookingCalcDone'),
  travelDateInput: document.getElementById('travelDateInput'),
  bookingResult: document.getElementById('bookingResult'),
  resultTravelDate: document.getElementById('resultTravelDate'),
  resultOpenDate: document.getElementById('resultOpenDate'),
  resultStatus: document.getElementById('resultStatus'),
  unlockModal: document.getElementById('unlockModal'),
  unlockForm: document.getElementById('unlockForm'),
  unlockModalTitle: document.getElementById('unlockModalTitle'),
  unlockModalDesc: document.getElementById('unlockModalDesc'),
  unlockClose: document.getElementById('unlockClose'),
  unlockCancel: document.getElementById('unlockCancel'),
  unlockSubmitBtn: document.getElementById('unlockSubmitBtn'),
  passphraseInput: document.getElementById('passphraseInput'),
  passphraseConfirmInput: document.getElementById('passphraseConfirmInput'),
  passphraseConfirmField: document.getElementById('passphraseConfirmField'),
  unlockError: document.getElementById('unlockError'),
};

function getSessionPassphrase() {
  return sessionStorage.getItem(PASSPHRASE_KEY);
}

function setSessionPassphrase(passphrase) {
  sessionStorage.setItem(PASSPHRASE_KEY, passphrase);
}

function clearSessionPassphrase() {
  sessionStorage.removeItem(PASSPHRASE_KEY);
}

function isUnlocked() {
  return Boolean(getSessionPassphrase());
}

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
  const unlocked = isUnlocked();
  els.authBtn.textContent = authed ? 'Sign out' : 'Sign in';
  els.addBtn.disabled = !authed || !unlocked;

  if (!authed) {
    setSyncStatus('');
    els.syncStatus.style.cursor = 'default';
  } else if (!unlocked) {
    setSyncStatus('Locked — tap to unlock');
    els.syncStatus.style.cursor = 'pointer';
  }
}

function getVisibleJourneys() {
  let list = filterByView(state.journeys, state.view);
  list = filterByName(list, state.nameQuery);
  return sortJourneys(list, state.view === 'completed');
}

function renderBookingDate() {
  els.bookingDate.textContent = getNextBookingDate();
}

function updateBookingCalcResult() {
  const travelDate = els.travelDateInput.value;
  if (!travelDate) {
    els.bookingResult.hidden = true;
    return;
  }

  const info = getBookingInfo(travelDate);
  els.resultTravelDate.textContent = info.travelDateDisplay;
  els.resultOpenDate.textContent = `${info.openDateDisplay} (IST)`;

  if (info.canBookNow) {
    els.resultStatus.textContent = 'Booking is open — you can book this journey on IRCTC now.';
    els.resultStatus.className = 'booking-result__status booking-result__status--open';
  } else if (info.daysUntilOpen === 1) {
    els.resultStatus.textContent = 'Booking opens tomorrow.';
    els.resultStatus.className = 'booking-result__status booking-result__status--soon';
  } else {
    els.resultStatus.textContent = `Booking opens in ${info.daysUntilOpen} days.`;
    els.resultStatus.className = 'booking-result__status booking-result__status--soon';
  }

  els.bookingResult.hidden = false;
}

function openBookingCalcModal() {
  els.travelDateInput.value = getNextBookingDateISO();
  els.travelDateInput.min = getTodayISO();
  updateBookingCalcResult();
  els.bookingCalcModal.showModal();
  els.travelDateInput.focus();
}

function closeBookingCalcModal() {
  els.bookingCalcModal.close();
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  }
}

function attachPnrLongPressCopy(element, pnr, onCopied) {
  const LONG_PRESS_MS = 500;
  let pressTimer = null;
  let longPressTriggered = false;

  const clearPress = () => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  };

  const startPress = (e) => {
    longPressTriggered = false;
    clearPress();
    pressTimer = setTimeout(async () => {
      longPressTriggered = true;
      const copied = await copyToClipboard(pnr);
      if (copied) {
        showToast(`PNR ${pnr} copied`, 'success');
        onCopied?.();
      } else {
        showToast('Could not copy PNR', 'error');
      }
    }, LONG_PRESS_MS);
    e.stopPropagation();
  };

  const endPress = (e) => {
    clearPress();
    if (longPressTriggered) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const blockClick = (e) => {
    if (longPressTriggered) {
      e.preventDefault();
      e.stopPropagation();
      longPressTriggered = false;
    }
  };

  element.addEventListener('mousedown', startPress);
  element.addEventListener('touchstart', startPress, { passive: true });
  element.addEventListener('mouseup', endPress);
  element.addEventListener('mouseleave', clearPress);
  element.addEventListener('touchend', endPress);
  element.addEventListener('touchcancel', clearPress);
  element.addEventListener('click', blockClick, true);
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

const PASSENGER_STATUSES = ['', 'CNF', 'RAC', 'WL', 'TLWL'];

function renderPassengerRows(passengers = [{ name: '', seat: '', status: '' }]) {
  els.passengerRows.innerHTML = '';
  passengers.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'passenger-row';
    const statusOptions = PASSENGER_STATUSES.map(
      (s) => `<option value="${s}"${(p.status || '').toUpperCase() === s ? ' selected' : ''}>${s || 'Status'}</option>`
    ).join('');
    row.innerHTML = `
      <label class="field">
        <span class="field__label">Name</span>
        <input type="text" class="input passenger-name" value="${escapeHtml(p.name)}" required placeholder="Passenger name">
      </label>
      <label class="field">
        <span class="field__label">Seat / Berth</span>
        <input type="text" class="input passenger-seat" value="${escapeHtml(p.seat)}" placeholder="e.g. B2-45 or WL 24">
      </label>
      <label class="field">
        <span class="field__label">Status</span>
        <select class="input passenger-status">${statusOptions}</select>
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
    status: row.querySelector('.passenger-status').value,
  }));
}

function renderAccordion() {
  const journeys = getVisibleJourneys();
  els.journeyList.innerHTML = '';

  if (journeys.length === 0) {
    els.emptyState.hidden = false;
    if (!isAuthenticated()) {
      els.emptyStateText.textContent = 'Sign in and add your first journey to get started.';
    } else if (!isUnlocked()) {
      els.emptyStateText.textContent = 'Unlock with your passphrase to view journeys.';
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
    const timeTag = getTrainTimeTag(j.boarding?.time);
    const statusClass = getJourneyStatusClass(j.passengers);
    const passengerText = j.passengers.map((p) => escapeHtml(p.name)).join(', ');
    const item = document.createElement('div');
    item.className = `accordion__item${isOpen ? ' accordion__item--open' : ''}${statusClass ? ` ${statusClass}` : ''}`;
    item.innerHTML = `
      <button type="button" class="accordion__trigger" aria-expanded="${isOpen}">
        <div class="accordion__trigger-bar">
          <div class="accordion__headline">
            <span class="accordion__pnr" title="Long press to copy PNR">PNR ${escapeHtml(j.pnr)}</span>
            ${timeTag ? `<span class="accordion__headline-sep">-</span><span class="${timeTag.className}">${timeTag.label}</span>` : ''}
          </div>
          <svg class="accordion__chevron" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"/>
          </svg>
        </div>
        <div class="accordion__summary-extra">
          <div class="accordion__summary-body">
            <div class="accordion__route">${escapeHtml(j.boarding.station)} → ${escapeHtml(j.destination.station)}</div>
            <div class="accordion__date">${formatDateRange(j.journeyStartDate, j.journeyEndDate)}</div>
            <p class="accordion__passengers">${passengerText}</p>
          </div>
          <div class="accordion__times">
            <span class="accordion__time">${formatTime(j.boarding.time)}</span>
            <span class="accordion__time">${formatTime(j.destination.time)}</span>
          </div>
        </div>
      </button>
      <div class="accordion__panel" aria-hidden="${!isOpen}">
        <div class="accordion__panel-inner">
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
              <thead><tr><th>Name</th><th>Seat / Berth</th><th>Status</th></tr></thead>
              <tbody>
                ${j.passengers.map((p) => {
                  const status = parsePassengerStatus(p);
                  const statusClass = status === 'CNF' ? 'status-badge status-badge--cnf'
                    : status === 'RAC' ? 'status-badge status-badge--rac'
                    : (status === 'WL' || status === 'TLWL') ? 'status-badge status-badge--wl'
                    : '';
                  return `<tr>
                    <td>${escapeHtml(p.name)}</td>
                    <td>${escapeHtml(p.seat || '—')}</td>
                    <td>${status ? `<span class="${statusClass}">${formatPassengerStatusLabel(status)}</span>` : '—'}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
          </div>
        <div class="accordion__actions">
          <button type="button" class="btn btn--ghost btn--sm edit-btn">Edit</button>
          <button type="button" class="btn btn--ghost btn--sm delete-btn" style="color:var(--danger)">Delete</button>
        </div>
        </div>
      </div>
    `;

    let suppressToggle = false;
    const trigger = item.querySelector('.accordion__trigger');
    const panel = item.querySelector('.accordion__panel');

    trigger.addEventListener('click', () => {
      if (suppressToggle) return;

      const opening = !item.classList.contains('accordion__item--open');

      els.journeyList.querySelectorAll('.accordion__item').forEach((el) => {
        el.classList.remove('accordion__item--open');
        el.querySelector('.accordion__trigger')?.setAttribute('aria-expanded', 'false');
        el.querySelector('.accordion__panel')?.setAttribute('aria-hidden', 'true');
      });

      if (opening) {
        item.classList.add('accordion__item--open');
        trigger.setAttribute('aria-expanded', 'true');
        panel.setAttribute('aria-hidden', 'false');
        state.openAccordionId = j.id;
      } else {
        state.openAccordionId = null;
      }
    });

    attachPnrLongPressCopy(item.querySelector('.accordion__pnr'), j.pnr, () => {
      suppressToggle = true;
      setTimeout(() => { suppressToggle = false; }, 400);
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

  if (!isUnlocked()) {
    state.journeys = [];
    updateAuthUI();
    renderAccordion();
    return;
  }

  state.loading = true;
  setSyncStatus('Syncing…', 'loading');

  try {
    const envelope = await getEncryptedEnvelope();
    if (!envelope) {
      state.journeys = [];
      setSyncStatus('Unlocked', 'ok');
      return;
    }

    const data = await decryptJourneys(envelope, getSessionPassphrase());
    state.journeys = data.journeys || [];
    setSyncStatus('Synced', 'ok');
  } catch (err) {
    clearSessionPassphrase();
    setSyncStatus('Locked — tap to unlock', '');
    showToast(err.message, 'error');
    state.journeys = [];
    await promptUnlockIfNeeded();
  } finally {
    state.loading = false;
    updateAuthUI();
    render();
  }
}

async function persistJourneys() {
  if (!isUnlocked()) {
    throw new Error('Unlock required before saving');
  }

  setSyncStatus('Saving…', 'loading');
  try {
    const envelope = await encryptJourneys({ journeys: state.journeys }, getSessionPassphrase());
    await saveEncryptedEnvelope(envelope);
    setSyncStatus('Synced', 'ok');
    showToast('Journey saved', 'success');
  } catch (err) {
    setSyncStatus('Save failed', 'error');
    showToast(err.message, 'error');
    throw err;
  }
}

async function openUnlockModal(mode, migrateLegacy = false) {
  state.unlockMode = mode;
  state.migrateLegacy = migrateLegacy;

  const isSetup = mode === 'setup';
  els.unlockModalTitle.textContent = isSetup ? 'Set encryption passphrase' : 'Unlock your journeys';
  els.unlockSubmitBtn.textContent = isSetup ? 'Set passphrase' : 'Unlock';
  els.passphraseConfirmField.hidden = !isSetup;
  els.passphraseConfirmInput.required = isSetup;
  els.unlockError.hidden = true;
  els.passphraseInput.value = '';
  els.passphraseConfirmInput.value = '';

  if (isSetup && migrateLegacy) {
    els.unlockModalDesc.textContent =
      'Plaintext journey data was found. Set a passphrase to encrypt it. Your old data/journeys.json file will be removed from the repo.';
  } else if (isSetup) {
    els.unlockModalDesc.textContent =
      'Choose a strong passphrase to encrypt your PNR data. It never leaves this browser. If you forget it, your data cannot be recovered.';
  } else {
    els.unlockModalDesc.textContent =
      'Enter your passphrase to decrypt journey data. It is remembered for this browser session only.';
  }

  els.unlockModal.showModal();
  els.passphraseInput.focus();
}

function closeUnlockModal() {
  els.unlockModal.close();
}

async function promptUnlockIfNeeded() {
  if (!isAuthenticated() || isUnlocked()) return;

  const hasEnc = await encryptedFileExists();
  const hasLegacy = await legacyFileExists();

  if (hasEnc) {
    await openUnlockModal('unlock');
  } else {
    await openUnlockModal('setup', hasLegacy);
  }
}

async function afterSignIn() {
  if (getSessionPassphrase()) {
    await loadJourneys();
    return;
  }
  await promptUnlockIfNeeded();
}

async function handleUnlockSubmit(e) {
  e.preventDefault();
  els.unlockError.hidden = true;

  const passphrase = els.passphraseInput.value;
  const confirm = els.passphraseConfirmInput.value;

  if (state.unlockMode === 'setup') {
    if (passphrase.length < 8) {
      els.unlockError.textContent = 'Passphrase must be at least 8 characters';
      els.unlockError.hidden = false;
      return;
    }
    if (passphrase !== confirm) {
      els.unlockError.textContent = 'Passphrases do not match';
      els.unlockError.hidden = false;
      return;
    }

    try {
      let journeyData = { journeys: [] };
      if (state.migrateLegacy) {
        const legacy = await getLegacyPlaintextJourneys();
        if (legacy?.journeys) journeyData = legacy;
      }

      const envelope = await encryptJourneys(journeyData, passphrase);
      await saveEncryptedEnvelope(envelope);

      if (state.migrateLegacy) {
        await deleteLegacyPlaintextFile();
        showToast('Encrypted and migrated from plaintext file', 'success');
      } else {
        showToast('Encryption enabled', 'success');
      }

      setSessionPassphrase(passphrase);
      state.journeys = journeyData.journeys || [];
      closeUnlockModal();
      updateAuthUI();
      render();
    } catch (err) {
      els.unlockError.textContent = err.message;
      els.unlockError.hidden = false;
    }
    return;
  }

  try {
    const envelope = await getEncryptedEnvelope();
    if (!envelope) {
      els.unlockError.textContent = 'No encrypted data found. Set a passphrase first.';
      els.unlockError.hidden = false;
      return;
    }

    const data = await decryptJourneys(envelope, passphrase);
    setSessionPassphrase(passphrase);
    state.journeys = data.journeys || [];
    closeUnlockModal();
    setSyncStatus('Synced', 'ok');
    updateAuthUI();
    render();
    showToast('Unlocked', 'success');
  } catch (err) {
    els.unlockError.textContent = err.message;
    els.unlockError.hidden = false;
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
    clearSessionPassphrase();
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
    closeAuthModal();
    showToast('Signed in successfully', 'success');
    await afterSignIn();
  } catch (err) {
    clearToken();
    clearSessionPassphrase();
    els.authError.textContent = err.message;
    els.authError.hidden = false;
    openAuthModal();
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

  renderPassengerRows(journey?.passengers ?? [{ name: '', seat: '', status: '' }]);
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
    renderPassengerRows([...getPassengersFromForm(), { name: '', seat: '', status: '' }]);
  });

  els.deleteCancel.addEventListener('click', closeDeleteModal);
  els.deleteConfirm.addEventListener('click', handleDelete);

  els.syncStatus.addEventListener('click', () => {
    if (isAuthenticated() && !isUnlocked()) promptUnlockIfNeeded();
  });

  els.unlockForm.addEventListener('submit', handleUnlockSubmit);
  els.unlockClose.addEventListener('click', closeUnlockModal);
  els.unlockCancel.addEventListener('click', closeUnlockModal);

  els.unlockModal.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeUnlockModal();
  });

  els.bookingHeroBtn.addEventListener('click', openBookingCalcModal);
  els.bookingCalcClose.addEventListener('click', closeBookingCalcModal);
  els.bookingCalcDone.addEventListener('click', closeBookingCalcModal);
  els.travelDateInput.addEventListener('change', updateBookingCalcResult);
  els.travelDateInput.addEventListener('input', updateBookingCalcResult);

  els.bookingCalcModal.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeBookingCalcModal();
  });

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
    if (isUnlocked()) {
      loadJourneys();
    } else {
      promptUnlockIfNeeded();
      renderAccordion();
    }
  } else {
    renderAccordion();
  }
}

init();
