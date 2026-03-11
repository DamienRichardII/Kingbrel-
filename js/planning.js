// planning.js — Agenda temps réel heure par heure
var $     = (window.KBApp && window.KBApp.$)    || function(sel,root){ return (root||document).querySelector(sel); };
var $all  = (window.KBApp && window.KBApp.$all) || function(sel,root){ return Array.from((root||document).querySelectorAll(sel)); };
var toast = (window.KBApp && window.KBApp.toast) || function(msg){ console.log(msg); };

/* Standalone storage — n'a plus besoin de booking.js */
function getBookings(){ try { return JSON.parse(localStorage.getItem("kb_bookings") || "[]"); } catch(e){ return []; } }
function setBookings(list){ localStorage.setItem("kb_bookings", JSON.stringify(list)); }
var BUSINESS = { start: "10:00", end: "20:00", stepMin: 15 };

/* getBookings, setBookings, BUSINESS définis ci-dessus */

function pad2(n){ return String(n).padStart(2,"0"); }
function toDateKey(d){
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function parseTimeToMin(t){
  const [h,m] = t.split(":").map(Number);
  return h*60+m;
}

// State
let currentWeekStart = null;
let selectedDateKey = null;
let currentDetailId = null;
const HOURS = ["10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00"];

function getMonday(d){
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0) ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0,0,0,0);
  return date;
}

function formatWeekLabel(monday){
  const friday = new Date(monday);
  friday.setDate(friday.getDate() + 6);
  const opts = { day:"numeric", month:"long" };
  return `${monday.toLocaleDateString("fr-FR", opts)} — ${friday.toLocaleDateString("fr-FR", { day:"numeric", month:"long", year:"numeric" })}`;
}

function renderStats(){
  const el = $("#planningStats");
  if (!el) return;
  const all = getBookings();
  const today = toDateKey(new Date());
  const todayCount = all.filter(b => b.date === today).length;
  const weekEnd = new Date(currentWeekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekCount = all.filter(b => {
    const d = new Date(b.date + "T00:00:00");
    return d >= currentWeekStart && d < weekEnd;
  }).length;
  el.innerHTML = `
    <div class="stat-chip"><div class="sv">${todayCount}</div><div class="sl">Aujourd'hui</div></div>
    <div class="stat-chip"><div class="sv">${weekCount}</div><div class="sl">Cette semaine</div></div>
    <div class="stat-chip"><div class="sv">${all.length}</div><div class="sl">Total</div></div>
  `;
}

function renderWeekStrip(){
  const strip = $("#weekStrip");
  const label = $("#weekLabel");
  if (!strip) return;

  label.textContent = formatWeekLabel(currentWeekStart);

  const bookings = getBookings();
  const bookingsByDate = {};
  bookings.forEach(b => {
    bookingsByDate[b.date] = (bookingsByDate[b.date] || 0) + 1;
  });

  const days = [];
  for(let i=0; i<7; i++){
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + i);
    days.push(d);
  }

  const today = toDateKey(new Date());
  const dayNames = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];

  strip.innerHTML = days.map((d, i) => {
    const key = toDateKey(d);
    const isActive = key === selectedDateKey;
    const hasBookings = bookingsByDate[key] > 0;
    return `
      <div class="week-day${isActive ? " active" : ""}" data-date="${key}" title="${d.toLocaleDateString("fr-FR", {weekday:"long", day:"numeric", month:"long"})}">
        <div class="wd-name">${dayNames[i]}</div>
        <div class="wd-num">${d.getDate()}</div>
        ${hasBookings ? `<div class="wd-dot"></div>` : `<div style="height:9px"></div>`}
      </div>
    `;
  }).join("");

  $all(".week-day", strip).forEach(el => {
    el.addEventListener("click", () => {
      selectedDateKey = el.getAttribute("data-date");
      renderWeekStrip();
      renderTimeline();
    });
  });
}

function renderTimeline(){
  const wrap = $("#timelineWrap");
  const dayTitle = $("#dayTitle");
  const bookingCount = $("#bookingCount");
  if (!wrap || !selectedDateKey) return;

  const date = new Date(selectedDateKey + "T00:00:00");
  dayTitle.textContent = date.toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long", year:"numeric" });

  const bookings = getBookings()
    .filter(b => b.date === selectedDateKey)
    .sort((a,b) => a.start.localeCompare(b.start));

  bookingCount.textContent = bookings.length === 0
    ? "Aucune réservation"
    : `${bookings.length} réservation${bookings.length > 1 ? "s" : ""}`;

  if (bookings.length === 0) {
    wrap.innerHTML = `<div class="empty-day">Aucune réservation ce jour-là.<br>Le planning sera vide.</div>`;
    return;
  }

  // Timeline from 10:00 to 20:00 = 10 hours = 600 min
  const START_MIN = parseTimeToMin("10:00");
  const END_MIN = parseTimeToMin("20:00");
  const TOTAL_MIN = END_MIN - START_MIN; // 600 min
  const PX_PER_HOUR = 72;
  const TOTAL_PX = (TOTAL_MIN / 60) * PX_PER_HOUR;

  const hourLabels = HOURS.map(h => `<div class="timeline-hour-label">${h}</div>`).join("");
  const hourRows = HOURS.map(() => `<div class="timeline-row"></div>`).join("");

  // Current time indicator
  const now = new Date();
  const todayKey = toDateKey(now);
  let indicatorHTML = "";
  if (selectedDateKey === todayKey) {
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (nowMin >= START_MIN && nowMin <= END_MIN) {
      const top = ((nowMin - START_MIN) / 60) * PX_PER_HOUR;
      indicatorHTML = `<div class="time-indicator" style="top:${top}px"></div>`;
    }
  }

  // Booking blocks
  const blocksHTML = bookings.map(b => {
    const startMin = parseTimeToMin(b.start);
    const endMin = parseTimeToMin(b.end);
    const top = ((startMin - START_MIN) / 60) * PX_PER_HOUR;
    const height = Math.max(((endMin - startMin) / 60) * PX_PER_HOUR - 4, 28);
    return `
      <div class="booking-block" data-id="${b.id}" style="top:${top}px; height:${height}px">
        <div class="bb-time">${b.start} → ${b.end}</div>
        <div class="bb-name">${escapeHtml(b.name)}</div>
        <div class="bb-service">${escapeHtml(b.serviceName)}</div>
      </div>
    `;
  }).join("");

  wrap.innerHTML = `
    <div class="timeline">
      <div class="timeline-hours">${hourLabels}</div>
      <div class="timeline-slots" style="min-height:${TOTAL_PX}px">
        ${hourRows}
        ${indicatorHTML}
        ${blocksHTML}
      </div>
    </div>
  `;

  // Click on booking block
  $all(".booking-block", wrap).forEach(el => {
    el.addEventListener("click", () => {
      const id = el.getAttribute("data-id");
      openDetail(id);
    });
  });
}

function openDetail(id){
  const booking = getBookings().find(b => b.id === id);
  if (!booking) return;
  currentDetailId = id;

  const overlay = $("#detailOverlay");
  const body = $("#detailBody");

  const created = new Date(booking.createdAt).toLocaleString("fr-FR");

  body.innerHTML = `
    <div class="detail-row"><span class="detail-label">Prestation</span><span class="detail-val">${escapeHtml(booking.serviceName)}</span></div>
    <div class="detail-row"><span class="detail-label">Date</span><span class="detail-val">${booking.date}</span></div>
    <div class="detail-row"><span class="detail-label">Horaire</span><span class="detail-val">${booking.start} → ${booking.end}</span></div>
    <div class="detail-row"><span class="detail-label">Client</span><span class="detail-val">${escapeHtml(booking.name)}</span></div>
    <div class="detail-row"><span class="detail-label">Téléphone</span><span class="detail-val">${escapeHtml(booking.phone)}</span></div>
    <div class="detail-row"><span class="detail-label">Email</span><span class="detail-val">${escapeHtml(booking.email)}</span></div>
    ${booking.note ? `<div class="detail-row"><span class="detail-label">Note</span><span class="detail-val">${escapeHtml(booking.note)}</span></div>` : ""}
    <div class="detail-row"><span class="detail-label">Réservé le</span><span class="detail-val" style="font-size:.8rem">${created}</span></div>
  `;

  overlay.classList.add("show");
}

function closeDetail(){
  $("#detailOverlay").classList.remove("show");
  currentDetailId = null;
}

function escapeHtml(s){
  return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

document.addEventListener("DOMContentLoaded", () => {
  const today = new Date();
  currentWeekStart = getMonday(today);
  selectedDateKey = toDateKey(today);

  renderStats();
  renderWeekStrip();
  renderTimeline();

  $("#prevWeek").addEventListener("click", () => {
    currentWeekStart.setDate(currentWeekStart.getDate() - 7);
    renderStats();
    renderWeekStrip();
  });
  $("#nextWeek").addEventListener("click", () => {
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    renderStats();
    renderWeekStrip();
  });
  $("#todayBtn").addEventListener("click", () => {
    const today = new Date();
    currentWeekStart = getMonday(today);
    selectedDateKey = toDateKey(today);
    renderStats();
    renderWeekStrip();
    renderTimeline();
  });
  $("#closeDetail").addEventListener("click", closeDetail);
  $("#detailOverlay").addEventListener("click", (e) => {
    if (e.target === $("#detailOverlay")) closeDetail();
  });
  $("#deleteBooking").addEventListener("click", () => {
    if (!currentDetailId) return;
    if (!confirm("Supprimer cette réservation ?")) return;
    const list = getBookings().filter(b => b.id !== currentDetailId);
    setBookings(list);
    toast("Réservation supprimée ✔");
    closeDetail();
    renderStats();
    renderWeekStrip();
    renderTimeline();
  });

  // Auto-refresh the time indicator every minute
  setInterval(() => {
    renderTimeline();
    renderStats();
    renderWeekStrip();
  }, 60 * 1000);
});
