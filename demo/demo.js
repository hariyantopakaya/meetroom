/* ============================================ */
/* RoomSync — Interactive Demo Logic            */
/* ============================================ */

// Screen Navigation
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(screenId);
  if (target) {
    target.classList.add('active');
    // Re-trigger animations
    target.querySelectorAll('.animate-in').forEach(el => {
      el.style.animation = 'none';
      el.offsetHeight; // force reflow
      el.style.animation = '';
    });
  }

  // Update demo nav active state
  document.querySelectorAll('.demo-btn').forEach(btn => btn.classList.remove('demo-btn--active'));
  const label = {
    'screen-login': 'Login',
    'screen-register': 'Register',
    'screen-forgot': 'Forgot PW',
    'screen-dashboard': 'Dashboard'
  }[screenId];
  if (label) {
    document.querySelectorAll('.demo-btn').forEach(btn => {
      if (btn.textContent.trim() === label) btn.classList.add('demo-btn--active');
    });
  }
}

// Dashboard Section Navigation
function showDashboardSection(section) {
  // Make sure we're on the dashboard screen
  showScreen('screen-dashboard');

  // Hide all sections
  const sections = ['dashboard', 'calendar', 'bookings', 'users', 'reports'];
  sections.forEach(s => {
    const el = document.getElementById('section-' + s);
    if (el) {
      el.classList.add('hidden');
      el.style.display = 'none';
    }
  });

  // Show target section
  const target = document.getElementById('section-' + section);
  if (target) {
    target.classList.remove('hidden');
    target.style.display = 'block';

    // Re-trigger animations
    target.querySelectorAll('.animate-in').forEach(el => {
      el.style.animation = 'none';
      el.offsetHeight;
      el.style.animation = '';
    });
  }

  // Update sidebar active state
  const titles = {
    'dashboard': 'Dashboard',
    'calendar': 'Calendar',
    'bookings': 'Bookings',
    'users': 'Users',
    'reports': 'Reports'
  };

  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
    const span = item.querySelector('span');
    if (span && span.textContent === titles[section]) {
      item.classList.add('active');
    }
  });

  // Update topbar title
  const topbarTitle = document.getElementById('topbar-title');
  if (topbarTitle) {
    topbarTitle.textContent = titles[section] || 'Dashboard';
  }
}

// Modal Management
function showModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('visible');
    // Re-trigger animation on inner modal
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
  if (modal) {
    modal.classList.remove('visible');
  }
}

function returnToTimeSelection() {
  closeModal('modal-conflict');
  showModal('modal-new-booking');
  setTimeout(() => {
    const startEl = document.getElementById('booking-start');
    if (startEl) {
      startEl.focus();
      startEl.select?.();
    }
  }, 150);
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

// Sidebar Toggle (Mobile)
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.classList.toggle('open');
  }
}

// Close sidebar when clicking outside on mobile
document.addEventListener('click', (e) => {
  const sidebar = document.getElementById('sidebar');
  const menuBtn = document.querySelector('.topbar-menu-btn');
  if (sidebar && sidebar.classList.contains('open') &&
      !sidebar.contains(e.target) &&
      !menuBtn.contains(e.target)) {
    sidebar.classList.remove('open');
  }
});

// Toast Notifications
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = {
    success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    warning: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    error: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
  };

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-msg">${message}</span>
  `;

  container.appendChild(toast);

  // Auto-remove after 3 seconds
  setTimeout(() => {
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    // Close any open modals
    document.querySelectorAll('.modal-overlay.visible').forEach(m => {
      m.classList.remove('visible');
    });
    // Close sidebar on mobile
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.remove('open');
  }
});

// Initialize — show login on load
document.addEventListener('DOMContentLoaded', () => {
  showScreen('screen-login');
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
