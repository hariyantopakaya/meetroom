/* ============================================ */
/* Booking Meeting — Production Client Logic   */
/* ============================================ */

let currentUser = null;
let currentCalendarDate = new Date();
let calendarViewMode = 'week'; // 'week' | 'day'
let currentBookingsPage = 1;
let currentUsersPage = 1;
let selectedBookingDetail = null;
let searchDebounceTimeout = null;
let conflictOriginModal = 'modal-new-booking';

// ============================================
// Navigation & Screen Management
// ============================================

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  const target = document.getElementById(screenId);
  if (target) {
    target.classList.add('active');
    target.querySelectorAll('.animate-in').forEach((el) => {
      el.style.animation = 'none';
      el.offsetHeight; // force reflow
      el.style.animation = '';
    });
  }
}

function showDashboardSection(section) {
  showScreen('screen-dashboard');

  const sections = ['dashboard', 'calendar', 'bookings', 'users', 'reports'];
  sections.forEach((s) => {
    const el = document.getElementById('section-' + s);
    if (el) {
      el.classList.add('hidden');
      el.style.display = 'none';
    }
  });

  const target = document.getElementById('section-' + section);
  if (target) {
    target.classList.remove('hidden');
    target.style.display = 'block';
    target.querySelectorAll('.animate-in').forEach((el) => {
      el.style.animation = 'none';
      el.offsetHeight;
      el.style.animation = '';
    });
  }

  const titles = {
    dashboard: 'Dashboard',
    calendar: 'Calendar',
    bookings: 'Bookings',
    users: 'User Management',
    reports: 'Reports',
  };

  document.querySelectorAll('.nav-item').forEach((item) => {
    item.classList.remove('active');
  });

  const activeNav = document.getElementById('nav-' + section);
  if (activeNav) activeNav.classList.add('active');

  const topbarTitle = document.getElementById('topbar-title');
  if (topbarTitle) topbarTitle.textContent = titles[section] || 'Dashboard';

  // Load section-specific data
  if (section === 'dashboard') loadDashboardStats();
  if (section === 'calendar') loadCalendar();
  if (section === 'bookings') loadBookings(1);
  if (section === 'users') loadUsers(1);
  if (section === 'reports') initReportsSection();
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.toggle('open');
}

// Close sidebar on mobile outside click
document.addEventListener('click', (e) => {
  const sidebar = document.getElementById('sidebar');
  const menuBtn = document.querySelector('.topbar-menu-btn');
  if (sidebar && sidebar.classList.contains('open') && !sidebar.contains(e.target) && !menuBtn?.contains(e.target)) {
    sidebar.classList.remove('open');
  }
});

// ============================================
// Modal Management
// ============================================

function showModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('visible');
    const inner = modal.querySelector('.modal');
    if (inner) {
      inner.style.animation = 'none';
      inner.offsetHeight;
      inner.style.animation = '';
    }
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('visible');
}

function closeModalOnOverlay(event) {
  if (event.target === event.currentTarget) {
    if (event.target.id === 'modal-conflict') {
      returnToTimeSelection();
    } else {
      event.target.classList.remove('visible');
    }
  }
}

// Escape key listener
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const conflictModal = document.getElementById('modal-conflict');
    if (conflictModal && conflictModal.classList.contains('visible')) {
      returnToTimeSelection();
      return;
    }
    document.querySelectorAll('.modal-overlay.visible').forEach((m) => m.classList.remove('visible'));
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.remove('open');
  }
});

// ============================================
// Toast Notifications
// ============================================

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = {
    success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    warning: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    error: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  };

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-msg">${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ============================================
// API Helper
// ============================================

async function apiRequest(url, options = {}) {
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  };

  const merged = {
    ...defaultOptions,
    ...options,
    headers: {
      ...defaultOptions.headers,
      ...(options.headers || {}),
    },
  };

  if (merged.body && typeof merged.body === 'object') {
    merged.body = JSON.stringify(merged.body);
  }

  const res = await fetch(url, merged);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error = new Error(data.error || 'An error occurred with the request.');
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

// ============================================
// Authentication Flow
// ============================================

async function checkAuthSession() {
  // Check URL parameters for password reset token
  const urlParams = new URLSearchParams(window.location.search);
  const resetToken = urlParams.get('resetToken');
  if (resetToken) {
    document.getElementById('reset-token-val').value = resetToken;
    showScreen('screen-reset-password');
    return false;
  }

  // Tampilan awal selalu menampilkan layar login terlebih dahulu
  currentUser = null;
  showScreen('screen-login');
  return false;
}

function setUserSession(user) {
  clearWifiSensitiveState();
  currentUser = user;

  // Update UI user info
  const nameEls = document.querySelectorAll('.sidebar-user-name');
  nameEls.forEach((el) => (el.textContent = user.fullName));

  const roleEls = document.querySelectorAll('.sidebar-user-role');
  roleEls.forEach((el) => {
    el.textContent = user.role === 'ADMIN' ? 'Administrator' : user.role === 'RECEPTIONIST' ? 'Receptionist' : 'User';
  });

  const initials = user.fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const avatarEls = document.querySelectorAll('.avatar');
  avatarEls.forEach((el) => {
    el.textContent = initials;
    if (user.role === 'ADMIN') {
      el.className = 'avatar avatar--admin';
    } else if (user.role === 'RECEPTIONIST') {
      el.className = 'avatar avatar--recep';
    } else {
      el.className = 'avatar';
    }
  });

  // Greet user
  const greetingEl = document.getElementById('dash-greeting');
  if (greetingEl) {
    const hour = new Date().getHours();
    const timeGreet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    greetingEl.textContent = `${timeGreet}, ${user.fullName.split(' ')[0]} 👋`;
  }

  // Handle Role-based visibility
  const mgmtSection = document.querySelectorAll('.nav-mgmt-section, .nav-mgmt-item, .nav-report-item');
  const userReportCard = document.getElementById('user-report-card');

  if (user.role === 'ADMIN') {
    mgmtSection.forEach((el) => (el.style.display = ''));
    if (userReportCard) userReportCard.style.display = '';
  } else if (user.role === 'RECEPTIONIST') {
    // Receptionist sees reports but not user management
    document.querySelectorAll('.nav-mgmt-item#nav-users').forEach((el) => (el.style.display = 'none'));
    document.querySelectorAll('#nav-reports, .nav-mgmt-section').forEach((el) => (el.style.display = ''));
    if (userReportCard) userReportCard.style.display = 'none';
  } else {
    // Normal user: hide user management & reports tabs from sidebar
    mgmtSection.forEach((el) => (el.style.display = 'none'));
    if (userReportCard) userReportCard.style.display = 'none';
  }
  const wifiNav = document.getElementById('nav-wifi');
  if (wifiNav) wifiNav.style.display = user.role === 'ADMIN' ? '' : 'none';
}

async function handleLogin(e) {
  if (e && typeof e.preventDefault === 'function') {
    e.preventDefault();
    e.stopPropagation();
  }
  const btn = document.getElementById('btn-login-submit');
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  try {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span>Signing in...</span>';
    }

    const data = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });

    setUserSession(data.user);
    showToast(`Welcome back, ${data.user.fullName}!`, 'success');
    showDashboardSection('dashboard');
  } catch (err) {
    showToast(err.message || 'Login failed', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span>Sign In</span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;
    }
  }
  return false;
}

async function handleRegister(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-register-submit');
  const fullName = document.getElementById('reg-name').value;
  const company = document.getElementById('reg-company').value;
  const email = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-pass').value;
  const confirm = document.getElementById('reg-confirm').value;

  if (password !== confirm) {
    showToast('Passwords do not match.', 'error');
    return;
  }

  try {
    btn.disabled = true;
    btn.innerHTML = '<span>Creating Account...</span>';

    const data = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: { fullName, company, email, password },
    });

    setUserSession(data.user);
    showToast('Account created successfully!', 'success');
    showDashboardSection('dashboard');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span>Create Account</span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;
  }
}

async function handleForgotPassword(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-forgot-submit');
  const email = document.getElementById('forgot-email').value;

  try {
    btn.disabled = true;
    btn.innerHTML = '<span>Sending...</span>';

    const data = await apiRequest('/api/auth/forgot-password', {
      method: 'POST',
      body: { email },
    });

    showToast(data.message || 'If registered, reset link was sent.', 'success');
    setTimeout(() => showScreen('screen-login'), 2000);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Send Reset Link</span>';
  }
}

async function handleResetPassword(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-reset-submit');
  const token = document.getElementById('reset-token-val').value;
  const password = document.getElementById('reset-new-pass').value;
  const confirm = document.getElementById('reset-confirm-pass').value;

  if (password !== confirm) {
    showToast('Passwords do not match.', 'error');
    return;
  }

  try {
    btn.disabled = true;
    btn.innerHTML = '<span>Saving...</span>';

    const data = await apiRequest('/api/auth/reset-password', {
      method: 'POST',
      body: { token, password },
    });

    showToast(data.message, 'success');
    setTimeout(() => {
      // Clear URL parameter and go to login
      window.history.replaceState({}, document.title, '/');
      showScreen('screen-login');
    }, 1500);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Save New Password</span>';
  }
}

async function handleLogout() {
  try {
    await apiRequest('/api/auth/logout', { method: 'POST' });
  } catch {
    // Ignore error
  }
  clearWifiSensitiveState();
  currentUser = null;
  showToast('Signed out successfully.', 'info');
  showScreen('screen-login');
}

// ============================================
// Dashboard Overview & Stats
// ============================================

async function loadDashboardStats() {
  try {
    const stats = await apiRequest('/api/calendar/stats');

    // Date badge
    const dateText = document.getElementById('dash-date-text');
    if (dateText) {
      const now = new Date();
      dateText.textContent = now.toLocaleDateString('en-US', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    }

    // Numbers
    const elToday = document.getElementById('stat-today-bookings');
    if (elToday) elToday.textContent = stats.todayBookingsCount;

    const elUsers = document.getElementById('stat-total-users');
    if (elUsers) elUsers.textContent = stats.totalUsers;

    const elUsage = document.getElementById('stat-avg-usage');
    if (elUsage) elUsage.textContent = stats.avgDailyUsage;

    const elOcc = document.getElementById('stat-occupancy-rate');
    if (elOcc) elOcc.textContent = stats.occupancyRate;

    // Ring & mini stats
    const ringFill = document.getElementById('ring-fill-bar');
    const ringLabel = document.getElementById('ring-label-text');
    if (ringFill && ringLabel) {
      ringFill.setAttribute('stroke-dasharray', `${stats.occupancyPercent}, 100`);
      ringLabel.textContent = `${stats.occupancyPercent}%`;
    }

    const miniMonth = document.getElementById('stat-mini-month');
    if (miniMonth) miniMonth.textContent = `${stats.thisMonthBookingsCount} bookings`;

    const miniResched = document.getElementById('stat-mini-rescheduled');
    if (miniResched) miniResched.textContent = `${stats.rescheduledCount} bookings`;

    const miniCancel = document.getElementById('stat-mini-cancelled');
    if (miniCancel) miniCancel.textContent = `${stats.cancelledCount} bookings`;

    // Today's schedule timeline
    renderTodayTimeline(stats.todaySchedule || []);
  } catch (err) {
    console.error('Failed to load dashboard stats:', err);
  }
}

function canViewBookingDetails(booking) {
  return Boolean(currentUser && (['ADMIN', 'RECEPTIONIST'].includes(currentUser.role) || booking.userId === currentUser.id));
}

function renderTodayTimeline(bookings) {
  const container = document.getElementById('today-timeline-container');
  if (!container) return;

  if (bookings.length === 0) {
    container.innerHTML = `
      <div style="padding: 2rem; text-align: center; color: var(--text-muted); font-size: 0.9rem;">
        No bookings scheduled for today. Meeting room is available.
      </div>
    `;
    return;
  }

  container.innerHTML = bookings
    .map((b, idx) => {
      const badgeClass = b.status === 'CONFIRMED' ? 'badge--confirmed' : b.status === 'RESCHEDULED' ? 'badge--rescheduled' : 'badge--cancelled';
      const isFirst = idx === 0;

      return `
      <div class="timeline-item" ${canViewBookingDetails(b) ? `onclick="openBookingDetailModal('${b.id}')" style="cursor:pointer"` : ''}>
        <div class="timeline-time">${b.startTime} – ${b.endTime}</div>
        <div class="timeline-bar ${isFirst ? 'timeline-bar--active' : 'timeline-bar--upcoming'}"></div>
        <div class="timeline-content">
          <span class="timeline-topic">${escapeHtml(b.topic)}</span>
          <span class="timeline-meta">${escapeHtml(b.user?.fullName || '')} • ${escapeHtml(b.user?.company || '')}</span>
        </div>
        <span class="badge ${badgeClass}">${b.status}</span>
      </div>
    `;
    })
    .join('');
}

// ============================================
// Interactive Calendar
// ============================================

function setCalendarView(mode) {
  calendarViewMode = mode;
  document.getElementById('btn-view-week')?.classList.toggle('active', mode === 'week');
  document.getElementById('btn-view-day')?.classList.toggle('active', mode === 'day');
  loadCalendar();
}

function jumpCalendarToToday() {
  currentCalendarDate = new Date();
  loadCalendar();
}

function prevCalendarPeriod() {
  if (calendarViewMode === 'week') {
    currentCalendarDate.setDate(currentCalendarDate.getDate() - 7);
  } else {
    currentCalendarDate.setDate(currentCalendarDate.getDate() - 1);
  }
  loadCalendar();
}

function nextCalendarPeriod() {
  if (calendarViewMode === 'week') {
    currentCalendarDate.setDate(currentCalendarDate.getDate() + 7);
  } else {
    currentCalendarDate.setDate(currentCalendarDate.getDate() + 1);
  }
  loadCalendar();
}

function getWeekDates(d) {
  const current = new Date(d);
  const day = current.getDay();
  // Monday is index 1
  const diff = current.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(current.setDate(diff));

  const week = [];
  for (let i = 0; i < 7; i++) {
    const nextDay = new Date(monday);
    nextDay.setDate(monday.getDate() + i);
    week.push(nextDay);
  }
  return week;
}

function formatDateISO(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function loadCalendar() {
  const gridContainer = document.getElementById('calendar-grid-container');
  const titleEl = document.getElementById('cal-nav-title');
  if (!gridContainer) return;

  let daysToRender = [];
  let startDateStr = '';
  let endDateStr = '';

  if (calendarViewMode === 'week') {
    daysToRender = getWeekDates(currentCalendarDate);
    startDateStr = formatDateISO(daysToRender[0]);
    endDateStr = formatDateISO(daysToRender[6]);

    const startMonth = daysToRender[0].toLocaleString('en-US', { month: 'short' });
    const endMonth = daysToRender[6].toLocaleString('en-US', { month: 'short' });
    const year = daysToRender[6].getFullYear();

    titleEl.textContent = `${daysToRender[0].getDate()} ${startMonth} – ${daysToRender[6].getDate()} ${endMonth} ${year}`;
  } else {
    daysToRender = [new Date(currentCalendarDate)];
    startDateStr = formatDateISO(daysToRender[0]);
    endDateStr = startDateStr;

    titleEl.textContent = daysToRender[0].toLocaleDateString('en-US', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  try {
    const { events } = await apiRequest(`/api/calendar/events?startDate=${startDateStr}&endDate=${endDateStr}`);

    renderCalendarGrid(daysToRender, events || []);
  } catch (err) {
    console.error('Failed to load calendar events:', err);
  }
}

function renderCalendarGrid(days, events) {
  const gridContainer = document.getElementById('calendar-grid-container');
  if (!gridContainer) return;

  const hours = [
    '08:00', '09:00', '10:00', '11:00', '12:00',
    '13:00', '14:00', '15:00', '16:00', '17:00'
  ];

  const todayStr = formatDateISO(new Date());

  // Set grid columns based on days count
  gridContainer.style.gridTemplateColumns = `64px repeat(${days.length}, 1fr)`;

  let html = `
    <!-- Time Column -->
    <div class="cal-time-col">
      <div class="cal-header-cell cal-header-cell--corner"></div>
      ${hours.map((h) => `<div class="cal-time-slot">${h}</div>`).join('')}
    </div>
  `;

  const colorVariants = ['cal-event--cyan', 'cal-event--violet', 'cal-event--amber', 'cal-event--emerald', 'cal-event--rose'];

  days.forEach((dayDate) => {
    const dateStr = formatDateISO(dayDate);
    const dayName = dayDate.toLocaleDateString('en-US', { weekday: 'short' });
    const dayNum = dayDate.getDate();
    const isToday = dateStr === todayStr;
    const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;

    const dayEvents = events.filter((e) => e.bookingDate === dateStr);

    let dayColClass = 'cal-day-col';
    if (isToday) dayColClass += ' cal-day-col--today';
    if (isWeekend) dayColClass += ' cal-day-col--weekend';

    html += `
      <div class="${dayColClass}">
        <div class="cal-header-cell ${isToday ? 'cal-header-cell--today' : ''}">
          <span class="cal-day-name">${dayName}</span>
          <span class="cal-day-num ${isToday ? 'cal-day-num--today' : ''}">${dayNum}</span>
        </div>
        <div class="cal-day-body" onclick="handleCalendarSlotClick(event, '${dateStr}')">
          ${dayEvents
            .map((b, idx) => {
              const [sh, sm] = b.startTime.split(':').map(Number);
              const [eh, em] = b.endTime.split(':').map(Number);

              const startOffsetMinutes = (sh - 8) * 60 + sm;
              const durationMinutes = (eh * 60 + em) - (sh * 60 + sm);

              const topSlot = startOffsetMinutes / 60;
              // Pastikan tinggi event minimal 1 slot penuh agar teks (waktu, topik, nama) tampil lengkap & tidak terpotong
              const heightSlot = Math.max(durationMinutes / 60, 1);

              const colorClass = colorVariants[idx % colorVariants.length];
              const rescheduleClass = b.status === 'RESCHEDULED' ? 'cal-event--rescheduled' : '';

              return `
              <div class="cal-event ${colorClass} ${rescheduleClass}" 
                   style="top: calc(${topSlot} * var(--slot-h)); height: calc(${heightSlot} * var(--slot-h));"
                   title="${escapeHtml(b.topic)} (${b.startTime}–${b.endTime}) - ${escapeHtml(b.user?.fullName || '')}"
                   onclick="event.stopPropagation(); ${canViewBookingDetails(b) ? `openBookingDetailModal('${b.id}')` : ''}">
                <span class="cal-event-time">${b.startTime}–${b.endTime}</span>
                <span class="cal-event-title">${escapeHtml(b.topic)}</span>
                <span class="cal-event-meta">${escapeHtml(b.user?.fullName || '')}</span>
              </div>
            `;
            })
            .join('')}
        </div>
      </div>
    `;
  });

  gridContainer.innerHTML = html;
}

function handleCalendarSlotClick(e, dateStr) {
  if (e.target.closest('.cal-event')) return;
  openNewBookingModal(dateStr);
}

// ============================================
// Bookings Table
// ============================================

function debounceLoadBookings() {
  clearTimeout(searchDebounceTimeout);
  searchDebounceTimeout = setTimeout(() => loadBookings(1), 300);
}

async function loadBookings(page = 1) {
  currentBookingsPage = page;
  const tbody = document.getElementById('bookings-table-body');
  const infoEl = document.getElementById('bookings-table-info');
  const pagEl = document.getElementById('bookings-pagination');
  if (!tbody) return;

  const search = document.getElementById('filter-bookings-search')?.value || '';
  const status = document.getElementById('filter-bookings-status')?.value || 'ALL';
  const startDate = document.getElementById('filter-bookings-start')?.value || '';
  const endDate = document.getElementById('filter-bookings-end')?.value || '';

  try {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted)">Loading bookings...</td></tr>`;

    const params = new URLSearchParams({
      page,
      limit: 10,
      search,
      status,
      startDate,
      endDate,
    });

    const data = await apiRequest(`/api/bookings?${params.toString()}`);

    if (!data.bookings || data.bookings.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted)">No bookings found matching the filter criteria.</td></tr>`;
      if (infoEl) infoEl.textContent = 'Showing 0 bookings';
      if (pagEl) pagEl.innerHTML = '';
      return;
    }

    tbody.innerHTML = data.bookings
      .map((b) => {
        const initials = (b.user?.fullName || 'U')
          .split(' ')
          .map((n) => n[0])
          .join('')
          .toUpperCase()
          .slice(0, 2);

        const badgeClass = b.status === 'CONFIRMED' ? 'badge--confirmed' : b.status === 'RESCHEDULED' ? 'badge--rescheduled' : 'badge--cancelled';

        const canModify = currentUser?.role === 'ADMIN' || currentUser?.role === 'RECEPTIONIST' || b.userId === currentUser?.id;

        return `
        <tr>
          <td>${b.bookingDate}</td>
          <td><span class="time-range">${b.startTime} – ${b.endTime}</span></td>
          <td>
            <div class="client-cell">
              <div class="avatar avatar--xs">${initials}</div>
              ${escapeHtml(b.user?.fullName || 'N/A')}
            </div>
          </td>
          <td>${escapeHtml(b.user?.company || 'N/A')}</td>
          <td>${escapeHtml(b.topic)}</td>
          <td><span class="badge ${badgeClass}">${b.status}</span></td>
          <td>
            <div class="action-btns">
              <button class="icon-btn" title="View Details" onclick="openBookingDetailModal('${b.id}')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
              <button class="icon-btn" title="${b.wifiSsid ? 'Lihat Voucher Wi-Fi' : 'Wi-Fi bulan ini belum diatur'}" onclick="openVoucherForBooking('${b.id}')" style="${b.wifiSsid ? 'color:var(--violet-500);' : ''}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
              </button>
              ${
                canModify && b.status !== 'CANCELLED'
                  ? `
                <button class="icon-btn" title="Reschedule" onclick="openRescheduleModal('${b.id}')">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
                </button>
                <button class="icon-btn icon-btn--danger" title="Cancel" onclick="confirmCancelBooking('${b.id}')">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                </button>
              `
                  : ''
              }
            </div>
          </td>
        </tr>
      `;
      })
      .join('');

    const startItem = (data.page - 1) * data.limit + 1;
    const endItem = Math.min(data.page * data.limit, data.total);
    if (infoEl) infoEl.textContent = `Showing ${startItem}–${endItem} of ${data.total} bookings`;

    renderPagination(pagEl, data.page, data.totalPages, loadBookings);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--rose-400)">Error loading bookings: ${err.message}</td></tr>`;
  }
}

// ============================================
// User Management Table (Admin)
// ============================================

function debounceLoadUsers() {
  clearTimeout(searchDebounceTimeout);
  searchDebounceTimeout = setTimeout(() => loadUsers(1), 300);
}

async function loadUsers(page = 1) {
  if (currentUser?.role !== 'ADMIN') return;

  currentUsersPage = page;
  const tbody = document.getElementById('users-table-body');
  const infoEl = document.getElementById('users-table-info');
  const pagEl = document.getElementById('users-pagination');
  if (!tbody) return;

  const search = document.getElementById('filter-users-search')?.value || '';
  const role = document.getElementById('filter-users-role')?.value || 'ALL';
  const status = document.getElementById('filter-users-status')?.value || 'ALL';

  try {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted)">Loading users...</td></tr>`;

    const params = new URLSearchParams({ page, limit: 10, search, role, status });
    const data = await apiRequest(`/api/users?${params.toString()}`);

    if (!data.users || data.users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted)">No users found.</td></tr>`;
      if (infoEl) infoEl.textContent = 'Showing 0 users';
      if (pagEl) pagEl.innerHTML = '';
      return;
    }

    tbody.innerHTML = data.users
      .map((u) => {
        const initials = u.fullName
          .split(' ')
          .map((n) => n[0])
          .join('')
          .toUpperCase()
          .slice(0, 2);

        const roleClass = u.role === 'ADMIN' ? 'role-badge--admin' : u.role === 'RECEPTIONIST' ? 'role-badge--receptionist' : 'role-badge--user';
        const roleLabel = u.role === 'ADMIN' ? 'Admin' : u.role === 'RECEPTIONIST' ? 'Receptionist' : 'User';
        const avatarClass = u.role === 'ADMIN' ? 'avatar--admin' : u.role === 'RECEPTIONIST' ? 'avatar--recep' : '';

        const joinedDate = new Date(u.createdAt).toLocaleDateString('en-US', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });

        return `
        <tr>
          <td>
            <div class="client-cell">
              <div class="avatar avatar--xs ${avatarClass}">${initials}</div>
              ${escapeHtml(u.fullName)}
            </div>
          </td>
          <td>${escapeHtml(u.email)}</td>
          <td>${escapeHtml(u.company)}</td>
          <td><span class="role-badge ${roleClass}">${roleLabel}</span></td>
          <td>
            <span class="status-dot ${u.isActive ? 'status-dot--active' : 'status-dot--inactive'}"></span>
            ${u.isActive ? 'Active' : 'Inactive'}
          </td>
          <td>${joinedDate}</td>
          <td>
            <div class="action-btns">
              <button class="icon-btn" title="Edit" onclick="openEditUserModal('${u.id}', '${escapeAttr(u.fullName)}', '${escapeAttr(u.company)}', '${u.role}')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              ${
                u.isActive
                  ? `<button class="icon-btn icon-btn--danger" title="Deactivate" onclick="toggleUserActive('${u.id}', false)">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                    </button>`
                  : `<button class="icon-btn" title="Activate" onclick="toggleUserActive('${u.id}', true)">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    </button>`
              }
            </div>
          </td>
        </tr>
      `;
      })
      .join('');

    const startItem = (data.page - 1) * data.limit + 1;
    const endItem = Math.min(data.page * data.limit, data.total);
    if (infoEl) infoEl.textContent = `Showing ${startItem}–${endItem} of ${data.total} users`;

    renderPagination(pagEl, data.page, data.totalPages, loadUsers);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--rose-400)">Error loading users: ${err.message}</td></tr>`;
  }
}

function renderPagination(container, currentPage, totalPages, callback) {
  if (!container || totalPages <= 1) {
    if (container) container.innerHTML = '';
    return;
  }

  let html = '';
  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="${callback.name}(${i})">${i}</button>`;
  }
  container.innerHTML = html;
}

// ============================================
// Wi-Fi Voucher & Setup Popup Logic
// ============================================

let currentVoucherBooking = null;
let wifiMonthLoadId = 0;
let wifiMonthLoading = false;
let pendingVoucherBookingId = null;
let wifiSessionVersion = 0;

function clearWifiSensitiveState() {
  wifiSessionVersion++;
  wifiMonthLoadId++;
  wifiMonthLoading = false;
  pendingVoucherBookingId = null;
  currentVoucherBooking = null;
  selectedBookingDetail = null;
  for (const id of ['wifi-input-month', 'wifi-input-ssid', 'wifi-input-password']) {
    const input = document.getElementById(id);
    if (input) { input.value = ''; input.disabled = false; }
  }
  for (const id of ['voucher-ssid', 'voucher-password', 'wifi-month-status']) {
    const element = document.getElementById(id);
    if (element) element.textContent = '';
  }
  const qr = document.getElementById('voucher-qr-container');
  if (qr) qr.innerHTML = '';
  document.querySelectorAll('.modal-overlay.visible').forEach(modal => modal.classList.remove('visible'));
}

async function openMonthlyWifiSettings(month = formatDateISO(new Date()).slice(0, 7), bookingId = null) {
  if (currentUser?.role !== 'ADMIN') return;
  pendingVoucherBookingId = bookingId;
  document.getElementById('wifi-input-month').value = month;
  showModal('modal-wifi-setup');
  await loadMonthlyWifiSettings();
}

async function loadMonthlyWifiSettings() {
  const month = document.getElementById('wifi-input-month').value;
  const requestId = ++wifiMonthLoadId;
  const ssidInput = document.getElementById('wifi-input-ssid');
  const passInput = document.getElementById('wifi-input-password');
  const status = document.getElementById('wifi-month-status');
  const button = document.getElementById('btn-save-monthly-wifi');
  ssidInput.value = '';
  passInput.value = '';
  wifiMonthLoading = true;
  button.disabled = true;
  status.textContent = 'Memuat pengaturan Wi-Fi...';
  try {
    if (!month) throw new Error('Pilih bulan untuk pengaturan Wi-Fi.');
    const { setting } = await apiRequest('/api/wifi/' + encodeURIComponent(month));
    if (requestId !== wifiMonthLoadId) return;
    ssidInput.value = setting?.ssid || '';
    passInput.value = setting?.password || '';
    status.textContent = setting
      ? 'Pengaturan tersimpan untuk ' + month + '. Perubahan berlaku untuk seluruh voucher bulan ini.'
      : 'Wi-Fi bulan ' + month + ' belum diatur. Isi kredensial yang berlaku di router.';
  } catch (err) {
    if (requestId === wifiMonthLoadId) {
      status.textContent = 'Pengaturan belum dapat dimuat.';
      showToast(err.message, 'error');
    }
  } finally {
    if (requestId === wifiMonthLoadId) {
      wifiMonthLoading = false;
      button.disabled = false;
    }
  }
}

function toggleWifiInputVisibility() {
  const input = document.getElementById('wifi-input-password');
  if (input) input.type = input.type === 'password' ? 'text' : 'password';
}

async function handleSaveWifiSetup(e) {
  e.preventDefault();
  if (currentUser?.role !== 'ADMIN' || wifiMonthLoading) return false;
  const monthInput = document.getElementById('wifi-input-month');
  const month = monthInput.value;
  const ssid = document.getElementById('wifi-input-ssid').value;
  const password = document.getElementById('wifi-input-password').value;
  const button = document.getElementById('btn-save-monthly-wifi');
  button.disabled = true;
  monthInput.disabled = true;
  try {
    const result = await apiRequest('/api/wifi/' + encodeURIComponent(month), {
      method: 'PUT', body: { ssid, password },
    });
    closeModal('modal-wifi-setup');
    showToast(result.message, 'success');
    loadBookings(currentBookingsPage);
    const bookingId = pendingVoucherBookingId;
    pendingVoucherBookingId = null;
    if (bookingId) await openVoucherForBooking(bookingId);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    button.disabled = false;
    monthInput.disabled = false;
  }
  return false;
}

function showWifiVoucherModal(booking) {
  if (!booking || !canViewBookingDetails(booking)) return;
  currentVoucherBooking = booking;

  document.getElementById('voucher-topic').textContent = booking.topic || 'Meeting Reservation';
  document.getElementById('voucher-guest-name').textContent = booking.user?.fullName || currentUser?.fullName || 'Tamu';
  document.getElementById('voucher-company').textContent = booking.user?.company || currentUser?.company || '-';
  document.getElementById('voucher-room').textContent = booking.room?.name || '-';
  document.getElementById('voucher-schedule').textContent = `${booking.bookingDate} • ${booking.startTime} – ${booking.endTime}`;

  const ssid = booking.wifiSsid || '';
  const password = booking.wifiPassword || '';
  if (!ssid || !password) {
    showToast('Isi kredensial Wi-Fi yang sebenarnya sebelum membuat voucher.', 'error');
    return;
  }

  document.getElementById('voucher-ssid').textContent = ssid;
  document.getElementById('voucher-password').textContent = password;

  const shortId = (booking.id || '').replace(/-/g, '').slice(0, 6).toUpperCase();
  const dateStr = (booking.bookingDate || '').replace(/-/g, '');
  document.getElementById('voucher-code').textContent = `VCH-${dateStr}-${shortId || 'PASS'}`;
  document.getElementById('voucher-validity').textContent = `Berlaku: ${booking.bookingDate} (${booking.startTime} – ${booking.endTime})`;

  // Generate QR Code SVG (WIFI:T:WPA;S:ssid;P:password;;)
  const qrContainer = document.getElementById('voucher-qr-container');
  if (qrContainer) {
    if (typeof window.generateQRCodeSVG === 'function') {
      const escapeWifi = value => value.replace(/[\\;,:\"]/g, char => String.fromCharCode(92) + char);
      const wifiQrString = `WIFI:T:WPA;S:${escapeWifi(ssid)};P:${escapeWifi(password)};;`;
      qrContainer.innerHTML = window.generateQRCodeSVG(wifiQrString, 130, '#0f172a', '#ffffff');
    } else {
      qrContainer.innerHTML = '<div style="font-size:12px;color:#94a3b8;padding:1rem;">QR Code Ready</div>';
    }
  }

  showModal('modal-wifi-voucher');
}

async function openVoucherForBooking(bookingId) {
  const sessionVersion = wifiSessionVersion;
  try {
    const { booking } = await apiRequest(`/api/bookings/${bookingId}`);
    if (sessionVersion !== wifiSessionVersion || !currentUser) return;
    if (booking.wifiSsid && booking.wifiPassword) {
      showWifiVoucherModal(booking);
    } else {
      const month = booking.bookingDate.slice(0, 7);
      if (currentUser?.role === 'ADMIN') await openMonthlyWifiSettings(month, booking.id);
      else showToast('Wi-Fi bulan ' + month + ' belum diatur oleh admin.', 'info');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openVoucherFromDetail() {
  if (!selectedBookingDetail) return;
  openVoucherForBooking(selectedBookingDetail.id);
}

function copyWifiSsid() {
  const ssidEl = document.getElementById('voucher-ssid');
  const ssid = ssidEl ? ssidEl.textContent : (currentVoucherBooking?.wifiSsid || '');
  navigator.clipboard.writeText(ssid).then(() => {
    showToast(`Nama Wi-Fi disalin: "${ssid}"`, 'success');
  }).catch(() => {
    showToast('Gagal menyalin teks ke clipboard', 'error');
  });
}

function copyWifiPassword() {
  const passEl = document.getElementById('voucher-password');
  const pass = passEl ? passEl.textContent : (currentVoucherBooking?.wifiPassword || '');
  navigator.clipboard.writeText(pass).then(() => {
    showToast('Password Wi-Fi berhasil disalin!', 'success');
  }).catch(() => {
    showToast('Gagal menyalin teks ke clipboard', 'error');
  });
}

function copyFullVoucherText() {
  if (!currentVoucherBooking) return;
  const b = currentVoucherBooking;
  const text = `🎟️ *VOUCHER AKSES WI-FI RUANG MEETING*
━━━━━━━━━━━━━━━━━━━━━━
🏢 Ruangan: ${b.room?.name || '-'}
📌 Topik: ${b.topic}
📅 Jadwal: ${b.bookingDate} (${b.startTime} - ${b.endTime})
👤 Pemesan: ${b.user?.fullName || currentUser?.fullName || '-'} (${b.user?.company || currentUser?.company || '-'})
━━━━━━━━━━━━━━━━━━━━━━
📶 Nama Wi-Fi (SSID): ${b.wifiSsid || '-'}
🔑 Password Wi-Fi: ${b.wifiPassword || '-'}
━━━━━━━━━━━━━━━━━━━━━━
*RoomSync Meeting Room System*`;

  navigator.clipboard.writeText(text).then(() => {
    showToast('Semua informasi voucher berhasil disalin!', 'success');
  }).catch(() => {
    showToast('Gagal menyalin teks ke clipboard', 'error');
  });
}

function printVoucher() {
  window.print();
}

// ============================================
// New Booking & Conflict Detection
// ============================================

function openNewBookingModal(prefilledDate = null) {
  if (!currentUser) return;

  document.getElementById('booking-fullname').value = '';
  document.getElementById('booking-company').value = '';
  document.getElementById('booking-topic').value = '';

  const dateInput = document.getElementById('booking-date');
  if (prefilledDate) {
    dateInput.value = prefilledDate;
  } else {
    dateInput.value = formatDateISO(new Date());
  }

  document.getElementById('booking-start').value = '09:00';
  document.getElementById('booking-end').value = '10:30';

  checkAvailabilityLive();
  showModal('modal-new-booking');
}

async function checkAvailabilityLive() {
  const date = document.getElementById('booking-date').value;
  const startTime = document.getElementById('booking-start').value;
  const endTime = document.getElementById('booking-end').value;
  const box = document.getElementById('booking-avail-box');
  const text = document.getElementById('booking-avail-text');

  if (!date || !startTime || !endTime) return;

  if (startTime >= endTime) {
    box.style.background = '#ffe4e6';
    box.style.borderColor = '#fecdd3';
    text.style.color = '#9f1239';
    text.textContent = 'End time must be after start time';
    return;
  }

  try {
    const data = await apiRequest('/api/bookings/check-availability', {
      method: 'POST',
      body: { date, startTime, endTime },
    });

    const svgEl = box.querySelector('svg');
    if (data.available) {
      box.style.background = '#d1fae5';
      box.style.borderColor = '#a7f3d0';
      text.style.color = '#065f46';
      text.textContent = 'Time slot is available';
      if (svgEl) {
        svgEl.setAttribute('stroke', '#059669');
        svgEl.innerHTML = '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>';
      }
    } else {
      box.style.background = '#fee2e2';
      box.style.borderColor = '#fecaca';
      text.style.color = '#991b1b';
      text.textContent = `Konflik: ${data.conflictingBooking?.client || 'Slot sudah terisi'} (${data.conflictingBooking?.time || ''})`;
      if (svgEl) {
        svgEl.setAttribute('stroke', '#dc2626');
        svgEl.innerHTML = '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>';
      }
    }
  } catch {
    // Ignore validation check error
  }
}

let isSubmittingBooking = false;

async function handleCreateBooking(e) {
  if (e && typeof e.preventDefault === 'function') {
    e.preventDefault();
    e.stopPropagation();
  }
  if (isSubmittingBooking) return false;
  isSubmittingBooking = true;

  const btn = document.getElementById('btn-submit-booking');
  const date = document.getElementById('booking-date').value;
  const startTime = document.getElementById('booking-start').value;
  const endTime = document.getElementById('booking-end').value;
  const topic = document.getElementById('booking-topic').value;

  try {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span>Checking...</span>';
    }

    const payload = { date, startTime, endTime, topic };
    

    const data = await apiRequest('/api/bookings', {
      method: 'POST',
      body: payload,
    });

    closeModal('modal-new-booking');
    showToast(data.message || 'Booking confirmed successfully!', data.booking?.emailDelivery === 'failed' ? 'warning' : 'success');

    // Refresh all views
    loadDashboardStats();
    loadCalendar();
    loadBookings(1);

    // Immediately display the Voucher Popup
    if (data.booking?.wifiSsid && data.booking?.wifiPassword) {
      setTimeout(() => {
        showWifiVoucherModal(data.booking);
      }, 300);
    }
  } catch (err) {
    if (err.status === 409) {
      // Keep form inputs preserved and show conflict modal
      closeModal('modal-new-booking');
      showConflictModal(err.data?.conflictingBooking, date, startTime, endTime, 'modal-new-booking');
    } else {
      showToast(err.message, 'error');
    }
  } finally {
    isSubmittingBooking = false;
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Confirm Booking`;
    }
  }
  return false;
}

function showConflictModal(conflictInfo, reqDate, reqStart, reqEnd, originModal = 'modal-new-booking') {
  conflictOriginModal = originModal;
  const msgBody = document.getElementById('conflict-msg-body');
  msgBody.innerHTML = `The selected time range <strong style="color:var(--text-primary)">${reqStart} – ${reqEnd}</strong> on <strong style="color:var(--text-primary)">${reqDate}</strong> overlaps with an existing reservation.`;

  const topicEl = document.getElementById('conflict-existing-topic');
  const metaEl = document.getElementById('conflict-existing-meta');
  const timeEl = document.getElementById('conflict-existing-time');

  if (conflictInfo) {
    topicEl.textContent = conflictInfo.topic || 'Occupied Reservation';
    metaEl.textContent = `${conflictInfo.client || 'Client'} • ${conflictInfo.company || 'Company'}`;
    timeEl.textContent = `${conflictInfo.time} (${conflictInfo.date || reqDate})`;
  } else {
    topicEl.textContent = 'Existing Reservation';
    metaEl.textContent = 'Reserved by another client';
    timeEl.textContent = 'Time slot unavailable';
  }

  showModal('modal-conflict');
}

function returnToTimeSelection() {
  closeModal('modal-conflict');
  const targetModal = conflictOriginModal || 'modal-new-booking';
  showModal(targetModal);

  if (targetModal === 'modal-new-booking') {
    checkAvailabilityLive();
    setTimeout(() => {
      const startEl = document.getElementById('booking-start');
      if (startEl) {
        startEl.focus();
        startEl.select?.();
      }
    }, 150);
  } else if (targetModal === 'modal-reschedule') {
    setTimeout(() => {
      const startEl = document.getElementById('reschedule-start');
      if (startEl) {
        startEl.focus();
        startEl.select?.();
      }
    }, 150);
  }
}

// ============================================
// Booking Details & Reschedule
// ============================================

async function openBookingDetailModal(bookingId) {
  try {
    const { booking } = await apiRequest(`/api/bookings/${bookingId}`);
    selectedBookingDetail = booking;

    document.getElementById('detail-client-name').textContent = booking.user?.fullName || 'N/A';
    document.getElementById('detail-company').textContent = booking.user?.company || 'N/A';
    document.getElementById('detail-date').textContent = booking.bookingDate;
    document.getElementById('detail-time').textContent = `${booking.startTime} – ${booking.endTime}`;
    document.getElementById('detail-topic').textContent = booking.topic;

    const badgeClass = booking.status === 'CONFIRMED' ? 'badge--confirmed' : booking.status === 'RESCHEDULED' ? 'badge--rescheduled' : 'badge--cancelled';
    document.getElementById('detail-status').innerHTML = `<span class="badge ${badgeClass}">${booking.status}</span>`;

    document.getElementById('detail-created-at').textContent = new Date(booking.createdAt).toLocaleString();

    // Adjust action buttons
    const canModify = currentUser?.role === 'ADMIN' || currentUser?.role === 'RECEPTIONIST' || booking.userId === currentUser?.id;
    const isCancelled = booking.status === 'CANCELLED';

    document.getElementById('btn-detail-reschedule').style.display = canModify && !isCancelled ? '' : 'none';
    document.getElementById('btn-detail-cancel').style.display = canModify && !isCancelled ? '' : 'none';

    // Voucher Wi-Fi button: always visible for non-cancelled bookings
    const voucherBtn = document.getElementById('btn-detail-voucher');
    if (voucherBtn) {
      voucherBtn.style.display = !isCancelled ? '' : 'none';
      voucherBtn.title = booking.wifiSsid ? 'Lihat / Cetak Voucher Wi-Fi' : 'Wi-Fi bulan ini belum diatur';
      voucherBtn.style.color = booking.wifiSsid ? 'var(--violet-500)' : '';
    }


    showModal('modal-booking-detail');
  } catch (err) {
    showToast(`Failed to load booking: ${err.message}`, 'error');
  }
}

function openRescheduleFromDetail() {
  if (!selectedBookingDetail) return;
  closeModal('modal-booking-detail');
  openRescheduleModal(selectedBookingDetail.id);
}

function openRescheduleModal(bookingId) {
  const booking = selectedBookingDetail?.id === bookingId ? selectedBookingDetail : null;

  document.getElementById('reschedule-booking-id').value = bookingId;
  document.getElementById('reschedule-topic-preview').textContent = booking?.topic || 'Meeting';
  document.getElementById('reschedule-current-preview').textContent = booking ? `${booking.bookingDate} (${booking.startTime} – ${booking.endTime})` : '';

  document.getElementById('reschedule-date').value = booking?.bookingDate || formatDateISO(new Date());
  document.getElementById('reschedule-start').value = booking?.startTime || '10:00';
  document.getElementById('reschedule-end').value = booking?.endTime || '11:30';
  document.getElementById('reschedule-reason').value = '';

  showModal('modal-reschedule');
}

let isSubmittingReschedule = false;

async function handleRescheduleSubmit(e) {
  if (e && typeof e.preventDefault === 'function') {
    e.preventDefault();
    e.stopPropagation();
  }
  if (isSubmittingReschedule) return false;
  isSubmittingReschedule = true;

  const btn = document.getElementById('btn-submit-reschedule');
  const bookingId = document.getElementById('reschedule-booking-id').value;
  const newDate = document.getElementById('reschedule-date').value;
  const newStartTime = document.getElementById('reschedule-start').value;
  const newEndTime = document.getElementById('reschedule-end').value;
  const reason = document.getElementById('reschedule-reason').value;

  try {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span>Checking...</span>';
    }

    const data = await apiRequest(`/api/bookings/${bookingId}/reschedule`, {
      method: 'PUT',
      body: { newDate, newStartTime, newEndTime, reason },
    });

    closeModal('modal-reschedule');
    showToast(data.message || 'Booking rescheduled successfully!', data.booking?.emailDelivery === 'failed' ? 'warning' : 'success');

    loadDashboardStats();
    loadCalendar();
    loadBookings(currentBookingsPage);
  } catch (err) {
    if (err.status === 409) {
      closeModal('modal-reschedule');
      showConflictModal(err.data?.conflictingBooking, newDate, newStartTime, newEndTime, 'modal-reschedule');
    } else {
      showToast(err.message, 'error');
    }
  } finally {
    isSubmittingReschedule = false;
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = 'Save Changes';
    }
  }
  return false;
}

async function handleCancelFromDetail() {
  if (!selectedBookingDetail) return;
  closeModal('modal-booking-detail');
  confirmCancelBooking(selectedBookingDetail.id);
}

async function confirmCancelBooking(bookingId) {
  if (!confirm('Are you sure you want to cancel this meeting room reservation?')) return;

  try {
    const data = await apiRequest(`/api/bookings/${bookingId}/cancel`, {
      method: 'POST',
    });

    showToast(data.message || 'Booking cancelled', 'warning');
    loadDashboardStats();
    loadCalendar();
    loadBookings(currentBookingsPage);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ============================================
// User Management Actions (Admin)
// ============================================

async function handleCreateUser(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-submit-newuser');
  const fullName = document.getElementById('newuser-name').value;
  const company = document.getElementById('newuser-company').value;
  const email = document.getElementById('newuser-email').value;
  const role = document.getElementById('newuser-role').value;
  const password = document.getElementById('newuser-password').value;

  try {
    btn.disabled = true;
    btn.innerHTML = '<span>Creating...</span>';

    const data = await apiRequest('/api/users', {
      method: 'POST',
      body: { fullName, company, email, role, password },
    });

    closeModal('modal-new-user');
    showToast(data.message || 'User created successfully', 'success');
    loadUsers(1);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Create User';
  }
}

function openEditUserModal(id, name, company, role) {
  document.getElementById('edituser-id').value = id;
  document.getElementById('edituser-name').value = name;
  document.getElementById('edituser-company').value = company;
  document.getElementById('edituser-role').value = role;
  document.getElementById('edituser-newpass').value = '';

  showModal('modal-edit-user');
}

async function handleEditUserSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('edituser-id').value;
  const fullName = document.getElementById('edituser-name').value;
  const company = document.getElementById('edituser-company').value;
  const role = document.getElementById('edituser-role').value;
  const newPassword = document.getElementById('edituser-newpass').value;

  try {
    await apiRequest(`/api/users/${id}`, {
      method: 'PUT',
      body: { fullName, company, role },
    });

    if (newPassword) {
      await apiRequest(`/api/users/${id}/reset-password`, {
        method: 'POST',
        body: { password: newPassword },
      });
    }

    closeModal('modal-edit-user');
    showToast('User account updated successfully', 'success');
    loadUsers(currentUsersPage);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function toggleUserActive(userId, makeActive) {
  try {
    const data = await apiRequest(`/api/users/${userId}/status`, {
      method: 'PUT',
      body: { isActive: makeActive },
    });
    showToast(data.message, 'success');
    loadUsers(currentUsersPage);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ============================================
// Reports & Exports
// ============================================

function initReportsSection() {
  const select = document.getElementById('report-month-select');
  if (!select) return;

  const current = new Date();
  let html = '';

  for (let i = -3; i <= 3; i++) {
    const d = new Date(current.getFullYear(), current.getMonth() + i, 1);
    const monthVal = d.getMonth() + 1;
    const yearVal = d.getFullYear();
    const label = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    const isSelected = i === 0 ? 'selected' : '';

    html += `<option value="${yearVal}-${monthVal}" ${isSelected}>${label}</option>`;
  }

  select.innerHTML = html;
}

function exportMonthlyReport(format) {
  const select = document.getElementById('report-month-select');
  const today = new Date();
  const [year, month] = (select ? select.value : `${today.getFullYear()}-${today.getMonth() + 1}`).split('-');

  showToast(`Generating ${format.toUpperCase()} monthly booking report...`, 'info');
  window.open(`/api/reports/bookings/${format}?year=${year}&month=${month}`, '_blank');
}

function exportBookings(format) {
  showToast(`Downloading bookings as ${format.toUpperCase()}...`, 'info');
  window.open(`/api/reports/bookings/${format}`, '_blank');
}

function exportUsers(format) {
  showToast(`Downloading user directory as ${format.toUpperCase()}...`, 'info');
  window.open(`/api/reports/users/${format}`, '_blank');
}

// ============================================
// Utility Helpers
// ============================================

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// ============================================
// Initialize App
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  checkAuthSession();
});

// Fullscreen Calendar
function toggleFullScreenCalendar() {
  const calSection = document.getElementById('section-calendar');
  if (!document.fullscreenElement) {
    if (calSection.requestFullscreen) {
      calSection.requestFullscreen();
    } else if (calSection.webkitRequestFullscreen) { /* Safari */
      calSection.webkitRequestFullscreen();
    } else if (calSection.msRequestFullscreen) { /* IE11 */
      calSection.msRequestFullscreen();
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) { /* Safari */
      document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) { /* IE11 */
      document.msExitFullscreen();
    }
  }
}

document.addEventListener('fullscreenchange', () => {
  const calSection = document.getElementById('section-calendar');
  if (document.fullscreenElement) {
    calSection.classList.add('fullscreen-mode');
  } else {
    calSection.classList.remove('fullscreen-mode');
  }
});
