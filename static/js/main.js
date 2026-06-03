function prefillBooking(type, notes) {
  const select = document.getElementById('event_type');
  if (select) {
    const option = Array.from(select.options).find((item) => item.value.toLowerCase() === type.toLowerCase());
    if (option) {
      select.value = option.value;
      updateEventTypePreview();
    }
  }

  const notesEl = document.getElementById('notes');
  if (notesEl) notesEl.value = notes;

  const bookingSection = document.getElementById('book');
  if (bookingSection) bookingSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function updateEventTypePreview() {
  const select = document.querySelector('[data-event-select]');
  const shell = document.querySelector('[data-event-shell]');

  if (!select || !shell) return;

  const hasSelection = Boolean(select.value);
  shell.dataset.selected = hasSelection ? 'true' : 'false';
}

function validateBooking() {
  const hiddenDate = document.getElementById('booking-date');
  const monthSelect = document.querySelector('[data-booking-month]');
  const daySelect = document.querySelector('[data-booking-day]');
  const yearSelect = document.querySelector('[data-booking-year]');

  if (!hiddenDate || !monthSelect || !daySelect || !yearSelect) {
    return true;
  }

  const month = Number.parseInt(monthSelect.value, 10);
  const day = Number.parseInt(daySelect.value, 10);
  const year = Number.parseInt(yearSelect.value, 10);

  if (!month || !day || !year) {
    alert('Please choose the event month, day, and year.');
    return false;
  }

  const formattedDate = [
    year,
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0')
  ].join('-');

  const selectedDate = new Date(`${formattedDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (Number.isNaN(selectedDate.getTime())) {
    alert('Please choose a valid event date.');
    return false;
  }

  if (selectedDate < today) {
    alert('Please choose an upcoming event date.');
    return false;
  }

  hiddenDate.value = formattedDate;
  return true;
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function syncBookingDate() {
  const hiddenDate = document.getElementById('booking-date');
  const monthSelect = document.querySelector('[data-booking-month]');
  const daySelect = document.querySelector('[data-booking-day]');
  const yearSelect = document.querySelector('[data-booking-year]');

  if (!hiddenDate || !monthSelect || !daySelect || !yearSelect) return;

  const month = Number.parseInt(monthSelect.value, 10);
  const day = Number.parseInt(daySelect.value, 10);
  const year = Number.parseInt(yearSelect.value, 10);

  if (!month || !day || !year) {
    hiddenDate.value = '';
    return;
  }

  hiddenDate.value = [
    year,
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0')
  ].join('-');
}

function populateBookingDays() {
  const monthSelect = document.querySelector('[data-booking-month]');
  const daySelect = document.querySelector('[data-booking-day]');
  const yearSelect = document.querySelector('[data-booking-year]');

  if (!monthSelect || !daySelect || !yearSelect) return;

  const selectedDay = daySelect.value;
  const month = Number.parseInt(monthSelect.value, 10);
  const year = Number.parseInt(yearSelect.value, 10);
  const totalDays = month && year ? getDaysInMonth(year, month) : 31;

  daySelect.innerHTML = '<option value="">Day</option>';
  for (let day = 1; day <= totalDays; day += 1) {
    const option = document.createElement('option');
    option.value = String(day);
    option.textContent = String(day);
    daySelect.append(option);
  }

  if (selectedDay && Number.parseInt(selectedDay, 10) <= totalDays) {
    daySelect.value = selectedDay;
  }
}

function setupBookingDatePicker() {
  const hiddenDate = document.getElementById('booking-date');
  const monthSelect = document.querySelector('[data-booking-month]');
  const daySelect = document.querySelector('[data-booking-day]');
  const yearSelect = document.querySelector('[data-booking-year]');

  if (!hiddenDate || !monthSelect || !daySelect || !yearSelect) return;

  const today = new Date();
  const currentYear = today.getFullYear();

  for (let year = currentYear; year <= currentYear + 5; year += 1) {
    const option = document.createElement('option');
    option.value = String(year);
    option.textContent = String(year);
    yearSelect.append(option);
  }

  monthSelect.value = String(today.getMonth() + 1);
  yearSelect.value = String(currentYear);
  populateBookingDays();
  daySelect.value = String(today.getDate());
  syncBookingDate();

  monthSelect.addEventListener('change', () => {
    populateBookingDays();
    syncBookingDate();
  });

  yearSelect.addEventListener('change', () => {
    populateBookingDays();
    syncBookingDate();
  });

  daySelect.addEventListener('change', syncBookingDate);
}

function setupEventTypePicker() {
  const select = document.querySelector('[data-event-select]');
  if (!select) return;

  updateEventTypePreview();
  select.addEventListener('change', updateEventTypePreview);
}

async function sendEnquiry(event) {
  event.preventDefault();
  const form = document.getElementById('enquiry-form');
  if (!form) return false;

  const dataObj = Object.fromEntries(new FormData(form).entries());
  const response = await fetch('/api/enquiry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dataObj)
  });

  const data = await response.json();
  if (data.ok) {
    alert('Thanks. Our team will contact you shortly.');
    form.reset();
  } else {
    alert(`Error: ${data.error || 'Something went wrong'}`);
  }
  return false;
}

function setupReveal() {
  const items = document.querySelectorAll('.fade-in');
  if (!items.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.2 });

  items.forEach((item) => observer.observe(item));
}

function setupNavigation() {
  const toggle = document.querySelector('[data-nav-toggle]');
  const menu = document.querySelector('[data-nav-menu]');
  if (!toggle || !menu) return;

  toggle.addEventListener('click', () => {
    menu.classList.toggle('open');
    document.body.classList.toggle('nav-open', menu.classList.contains('open'));
  });

  menu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      menu.classList.remove('open');
      document.body.classList.remove('nav-open');
    });
  });
}

function setupWidget() {
  const button = document.querySelector('[data-widget-toggle]');
  const menu = document.getElementById('fw-menu');
  if (!button || !menu) return;

  button.addEventListener('click', () => {
    menu.classList.toggle('active');
  });
}

function setupCanvas() {
  const canvas = document.getElementById('site-canvas');
  if (!canvas) return;

  const context = canvas.getContext('2d');
  if (!context) return;

  const particles = [];
  const colors = ['rgba(247,198,107,0.9)', 'rgba(255,141,114,0.72)', 'rgba(141,243,255,0.78)', 'rgba(255,95,162,0.7)'];
  let width = 0;
  let height = 0;
  let pointerX = 0;
  let pointerY = 0;
  let reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    particles.length = 0;

    const count = Math.min(44, Math.max(20, Math.floor(width / 34)));
    for (let i = 0; i < count; i += 1) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: 1.5 + Math.random() * 3,
        dx: (Math.random() - 0.5) * 0.24,
        dy: (Math.random() - 0.5) * 0.24,
        pulse: Math.random() * Math.PI * 2,
        color: colors[i % colors.length]
      });
    }
  }

  function drawRibbon(offset, alpha) {
    context.save();
    context.beginPath();
    context.moveTo(-20, height * (0.18 + offset));
    context.bezierCurveTo(width * 0.24, height * (0.08 + offset), width * 0.36, height * (0.34 + offset), width * 0.54, height * (0.24 + offset));
    context.bezierCurveTo(width * 0.72, height * (0.14 + offset), width * 0.8, height * (0.42 + offset), width + 20, height * (0.28 + offset));
    context.lineWidth = 2;
    context.strokeStyle = `rgba(255,255,255,${alpha})`;
    context.stroke();
    context.restore();
  }

  function render() {
    context.clearRect(0, 0, width, height);

    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, 'rgba(255,141,114,0.05)');
    gradient.addColorStop(0.5, 'rgba(141,243,255,0.03)');
    gradient.addColorStop(1, 'rgba(255,95,162,0.06)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    drawRibbon(0.02, 0.06);
    drawRibbon(0.16, 0.04);

    particles.forEach((particle, index) => {
      particle.x += particle.dx + (pointerX - width / 2) * 0.000005;
      particle.y += particle.dy + (pointerY - height / 2) * 0.000005;
      particle.pulse += 0.015;

      if (particle.x < -20) particle.x = width + 20;
      if (particle.x > width + 20) particle.x = -20;
      if (particle.y < -20) particle.y = height + 20;
      if (particle.y > height + 20) particle.y = -20;

      context.beginPath();
      context.fillStyle = particle.color;
      context.globalAlpha = 0.45 + Math.sin(particle.pulse) * 0.18;
      context.arc(particle.x, particle.y, particle.r + Math.sin(particle.pulse) * 0.6, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;

      for (let i = index + 1; i < particles.length; i += 1) {
        const other = particles[i];
        const dx = particle.x - other.x;
        const dy = particle.y - other.y;
        const distance = Math.hypot(dx, dy);
        if (distance < 110) {
          context.beginPath();
          context.strokeStyle = `rgba(255,255,255,${0.06 * (1 - distance / 110)})`;
          context.moveTo(particle.x, particle.y);
          context.lineTo(other.x, other.y);
          context.stroke();
        }
      }
    });

    if (!reduceMotion) {
      window.requestAnimationFrame(render);
    }
  }

  window.addEventListener('mousemove', (event) => {
    pointerX = event.clientX;
    pointerY = event.clientY;
  });

  window.addEventListener('resize', resize);
  resize();

  if (reduceMotion) {
    render();
  } else {
    window.requestAnimationFrame(render);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setupReveal();
  setupNavigation();
  setupWidget();
  setupCanvas();
  setupEventTypePicker();
  setupBookingDatePicker();
});
