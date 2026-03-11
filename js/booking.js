// $ et $all sont définis dans app.js — pas de redéclaration ici

function toast(message){
  let el = document.querySelector(".toast");
  if (!el){
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(()=> el.classList.remove("show"), 2200);
}

/**
 * Data model (localStorage):
 * - kb_availability: { "YYYY-MM-DD": { open: true, slots: ["12:00","12:15",...]} }
 *   If date missing -> defaultOpenAll (12:00-19:00, step 15)
 *   If open=false -> closed day
 * - kb_bookings: [{id, date, start, end, serviceId, serviceName, name, phone, email, note, createdAt}]
 */

const STORAGE = {
  avail: "kb_availability",
  bookings: "kb_bookings",
};

const BUSINESS = {
  start: "12:00",
  end: "19:00",
  stepMin: 15,
};

const SERVICES = [
  // Popular
  { id:"coupe-simple", cat:"Coiffure", name:"Coupe simple", price:"20€", durationMin:45, popular:true },
  { id:"coupe-barbe", cat:"Coiffure", name:"Coupe + Barbe", price:"30€", durationMin:60, popular:true },
  { id:"contours", cat:"Coiffure", name:"Contours", price:"20€", durationMin:45, popular:true },

  // Coiffure
  { id:"rasage-lame", cat:"Coiffure", name:"Rasage de crâne (lame)", price:"15€", durationMin:20 },
  { id:"rasage-tondeuse", cat:"Coiffure", name:"Rasage de crâne (tondeuse)", price:"10€", durationMin:15 },
  { id:"rasage-tondeuse-barbe", cat:"Coiffure", name:"Rasage tondeuse + barbe", price:"20€", durationMin:45 },
  { id:"enfant", cat:"Coiffure", name:"Coupe enfant (-12 ans)", price:"15€", durationMin:35 },

  // Barbe
  { id:"barbe", cat:"Barbe", name:"Barbe", price:"10€", durationMin:20 },

  // Colorations
  { id:"coloration", cat:"Colorations", name:"Coloration", price:"Sur devis", durationMin:90 },
  { id:"decoloration", cat:"Colorations", name:"Décoloration", price:"Sur devis", durationMin:90 },

  // Soins
  { id:"soin-visage", cat:"Soins du visage", name:"Soin du visage", price:"25€", durationMin:60 },
];

function readJSON(key, fallback){
  try{
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  }catch(e){
    return fallback;
  }
}
function writeJSON(key, value){
  localStorage.setItem(key, JSON.stringify(value));
}

function pad2(n){ return String(n).padStart(2,"0"); }
function toDateKey(d){
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth()+1);
  const dd = pad2(d.getDate());
  return `${yyyy}-${mm}-${dd}`;
}
function parseTimeToMin(t){
  const [h,m] = t.split(":").map(Number);
  return h*60+m;
}
function minToTime(min){
  const h = Math.floor(min/60);
  const m = min%60;
  return `${pad2(h)}:${pad2(m)}`;
}
function addMin(time, delta){
  return minToTime(parseTimeToMin(time)+delta);
}
function withinBusiness(time){
  const m = parseTimeToMin(time);
  return m >= parseTimeToMin(BUSINESS.start) && m <= parseTimeToMin(BUSINESS.end);
}
function generateDefaultSlots(){
  const start = parseTimeToMin(BUSINESS.start);
  const end = parseTimeToMin(BUSINESS.end);
  const slots = [];
  for(let m=start; m<=end; m+=BUSINESS.stepMin){
    slots.push(minToTime(m));
  }
  return slots;
}

function getAvailabilityForDate(dateKey){
  const avail = readJSON(STORAGE.avail, {});
  const entry = avail[dateKey];
  if (!entry){
    return { open:true, slots: generateDefaultSlots(), source:"default" };
  }
  if (entry.open === false) return { open:false, slots:[], source:"custom" };
  return { open:true, slots: Array.isArray(entry.slots) ? entry.slots : generateDefaultSlots(), source:"custom" };
}

function getBookings(){
  return readJSON(STORAGE.bookings, []);
}
function setBookings(list){
  writeJSON(STORAGE.bookings, list);
}

function overlaps(aStart, aEnd, bStart, bEnd){
  const as = parseTimeToMin(aStart);
  const ae = parseTimeToMin(aEnd);
  const bs = parseTimeToMin(bStart);
  const be = parseTimeToMin(bEnd);
  return Math.max(as, bs) < Math.min(ae, be);
}

function computeAvailableStartTimes(dateKey, service){
  const { open, slots } = getAvailabilityForDate(dateKey);
  if (!open) return [];

  const bookings = getBookings().filter(b => b.date === dateKey);
  const starts = [];

  const duration = service.durationMin;
  const startMin = parseTimeToMin(BUSINESS.start);
  const endMin = parseTimeToMin(BUSINESS.end);

  // Candidate starts from slots list, but must fit duration within business hours
  for(const t of slots){
    const s = parseTimeToMin(t);
    const e = s + duration;
    if (s < startMin) continue;
    if (e > endMin) continue;

    // must be fully within declared slots window. We assume slot list expresses opening boundaries.
    // If admin removed some internal slots, we require that every step slot in [s, e] exists.
    let okSlots = true;
    for(let m=s; m<=e; m+=BUSINESS.stepMin){
      const tt = minToTime(m);
      if (!slots.includes(tt)){
        okSlots = false;
        break;
      }
    }
    if (!okSlots) continue;

    // must not overlap existing bookings
    const endTime = minToTime(e);
    const conflict = bookings.some(b => overlaps(t, endTime, b.start, b.end));
    if (!conflict) starts.push(t);
  }
  return starts;
}

/* ---------- UI (Services list + Modal booking) ---------- */

function formatServiceLine(s){
  return `${s.name} • ${s.price} • ${s.durationMin} min`;
}

function renderServices(){
  const tabs = $("#serviceTabs");
  const grid = $("#serviceGrid");
  if (!tabs || !grid) return;

  const categories = ["Populaires","Coiffure","Barbe","Colorations","Soins du visage"];
  const catToFilter = (cat) => {
    if (cat === "Populaires") return (s)=>s.popular === true;
    return (s)=>s.cat === cat;
  };

  tabs.innerHTML = categories.map((c,i)=>`
    <button class="tab" role="tab" aria-selected="${i===0}" data-cat="${c}">${c}</button>
  `).join("");

  function paint(cat){
    const list = SERVICES.filter(catToFilter(cat));
    grid.innerHTML = list.map(s=>`
      <div class="card serviceCard">
        <div class="serviceMeta">
          ${s.popular ? `<span class="badge">Populaire</span>` : ``}
          <span class="badge" style="background: rgba(255,255,255,.06); border-color: rgba(255,255,255,.14)">${s.cat}</span>
        </div>
        <div>
          <h3 style="margin:0 0 4px">${s.name}</h3>
          <div style="display:flex; gap:10px; align-items:baseline; flex-wrap:wrap">
            <span class="price">${s.price}</span>
            <span class="duration">${s.durationMin} min</span>
          </div>
        </div>
        <div style="margin-top:auto; display:flex; gap:10px; flex-wrap:wrap">
          <button class="btn btn--primary" data-book="${s.id}">Réserver</button>
          <button class="btn" data-details="${s.id}">Détails</button>
        </div>
      </div>
    `).join("");

    $all("[data-book]").forEach(btn=>{
      btn.addEventListener("click", ()=> openBooking(btn.getAttribute("data-book")));
    });
    $all("[data-details]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const s = SERVICES.find(x=>x.id===btn.getAttribute("data-details"));
        if (s) toast(formatServiceLine(s));
      });
    });
  }

  paint(categories[0]);

  $all(".tab", tabs).forEach(t=>{
    t.addEventListener("click", ()=>{
      $all(".tab", tabs).forEach(x=>x.setAttribute("aria-selected","false"));
      t.setAttribute("aria-selected","true");
      paint(t.getAttribute("data-cat"));
    });
  });
}

let MODAL = null;
let selectedService = null;
let selectedDateKey = null;
let selectedStartTime = null;

function ensureModal(){
  if (MODAL) return MODAL;

  const backdrop = document.createElement("div");
  backdrop.className = "modalBackdrop";
  backdrop.id = "bookingModal";

  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="Réservation">
      <div class="modalTop">
        <div>
          <p class="kicker" style="margin:0 0 10px"><strong style="color: var(--supernova)">Réservation</strong> • Choisis ton créneau</p>
          <h3 class="modalTitle" id="modalTitle">Réserver</h3>
          <p style="margin:6px 0 0; color: rgba(255,255,255,.72)" id="modalMeta"></p>
        </div>
        <button class="btn modalClose" id="modalClose" aria-label="Fermer">✕</button>
      </div>
      <div class="modalBody">
        <div class="modalPane">
          <div class="calendar">
            <div class="calTop">
              <button class="btn" id="calPrev" aria-label="Mois précédent">←</button>
              <div class="calMonth" id="calMonth"></div>
              <button class="btn" id="calNext" aria-label="Mois suivant">→</button>
            </div>
            <div class="calGrid" id="calDows"></div>
            <div class="calGrid" id="calDays"></div>
          </div>

          <div style="margin-top:14px">
            <div class="label" style="margin-bottom:8px">Horaires disponibles</div>
            <div class="times" id="timeGrid"></div>
            <p id="noTimes" style="display:none; margin:10px 0 0; color: rgba(255,255,255,.72)">
              Aucun créneau disponible ce jour-là.
            </p>
          </div>
        </div>

        <div class="modalPane">
          <form id="bookingForm">
            <div class="field">
              <div class="label">Nom & Prénom</div>
              <input class="input" id="name" required placeholder="Ex: Damien-Richard Miyouna II." />
            </div>
            <div class="field">
              <div class="label">Téléphone</div>
              <input class="input" id="phone" required placeholder="Ex: 06 12 34 56 78" />
            </div>
            <div class="field">
              <div class="label">Email</div>
              <input class="input" id="email" type="email" required placeholder="Ex: client@email.com" />
            </div>
            <div class="field">
              <div class="label">Commentaire (facultatif)</div>
              <textarea class="textarea" id="note" placeholder="Ex: dégradé bas, pas trop court…"></textarea>
            </div>

            <div class="hr"></div>

            <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center">
              <button class="btn btn--primary" type="submit" style="flex:1">Valider la réservation</button>
              <button class="btn" type="button" id="clearSelection">Réinitialiser</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  document.body.append(backdrop);

  backdrop.addEventListener("click", (e)=>{
    if (e.target === backdrop) closeModal();
  });

  $("#modalClose", backdrop).addEventListener("click", closeModal);
  $("#clearSelection", backdrop).addEventListener("click", ()=>{
    selectedDateKey = null;
    selectedStartTime = null;
    renderCalendar();
    renderTimes();
    toast("Sélection réinitialisée");
  });

  $("#bookingForm", backdrop).addEventListener("submit", (e)=>{
    e.preventDefault();
    if (!selectedService) return toast("Choisis une prestation.");
    if (!selectedDateKey) return toast("Choisis une date.");
    if (!selectedStartTime) return toast("Choisis un horaire.");

    const name = $("#name", backdrop).value.trim();
    const phone = $("#phone", backdrop).value.trim();
    const email = $("#email", backdrop).value.trim();
    const note = $("#note", backdrop).value.trim();

    // Re-check availability right now
    const available = computeAvailableStartTimes(selectedDateKey, selectedService);
    if (!available.includes(selectedStartTime)){
      toast("Ce créneau vient d’être pris. Choisis un autre horaire.");
      renderTimes();
      return;
    }

    const start = selectedStartTime;
    const end = addMin(start, selectedService.durationMin);

    const booking = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      date: selectedDateKey,
      start,
      end,
      serviceId: selectedService.id,
      serviceName: selectedService.name,
      name, phone, email, note,
      createdAt: new Date().toISOString(),
    };

    const bookings = getBookings();
    bookings.push(booking);
    setBookings(bookings);

    toast("Réservation confirmée ✔");
    closeModal();
  });

  MODAL = backdrop;
  return MODAL;
}

let calCursor = null; // Date set to first day of month
let minDate = null;
let maxDate = null;

function computeRollingWindow(){
  const now = new Date();
  const min = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const max = new Date(min);
  max.setFullYear(max.getFullYear() + 1);
  max.setDate(max.getDate()); // keep same day (approx)
  return { min, max };
}

function monthKey(d){ return `${d.getFullYear()}-${d.getMonth()}`; }

function renderCalendar(){
  const modal = ensureModal();
  if (!calCursor){
    const { min, max } = computeRollingWindow();
    minDate = min;
    maxDate = max;
    calCursor = new Date(min.getFullYear(), min.getMonth(), 1);
  }

  const monthLabel = $("#calMonth", modal);
  const daysWrap = $("#calDays", modal);
  const dowsWrap = $("#calDows", modal);

  const locale = "fr-FR";
  monthLabel.textContent = calCursor.toLocaleDateString(locale, { month:"long", year:"numeric" }).replace(/^\w/, c => c.toUpperCase());

  const dows = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
  dowsWrap.innerHTML = dows.map(d=>`<div class="dow">${d}</div>`).join("");

  // Determine first day offset (Monday as first)
  const first = new Date(calCursor.getFullYear(), calCursor.getMonth(), 1);
  const last = new Date(calCursor.getFullYear(), calCursor.getMonth()+1, 0);
  const daysInMonth = last.getDate();

  // JS: 0=Sun...6=Sat. Convert to Monday start
  const jsDay = first.getDay(); // 0 Sun
  const offset = (jsDay + 6) % 7; // 0 if Monday

  const cells = [];
  for(let i=0;i<offset;i++){
    cells.push(`<div></div>`);
  }

  for(let day=1; day<=daysInMonth; day++){
    const date = new Date(calCursor.getFullYear(), calCursor.getMonth(), day);
    const key = toDateKey(date);

    const disabled = date < minDate || date > maxDate;
    const selected = selectedDateKey === key;

    cells.push(`
      <div class="day" role="button" tabindex="${disabled? -1:0}" aria-disabled="${disabled}" aria-selected="${selected}" data-date="${key}">
        <div class="num">${day}</div>
      </div>
    `);
  }

  daysWrap.innerHTML = cells.join("");

  $all(".day[data-date]", daysWrap).forEach(el=>{
    el.addEventListener("click", ()=>{
      if (el.getAttribute("aria-disabled")==="true") return;
      selectedDateKey = el.getAttribute("data-date");
      selectedStartTime = null;
      renderCalendar();
      renderTimes();
    });
    el.addEventListener("keydown", (e)=>{
      if (e.key==="Enter" || e.key===" "){
        e.preventDefault();
        el.click();
      }
    });
  });

  const prev = $("#calPrev", modal);
  const next = $("#calNext", modal);

  prev.onclick = ()=>{
    const d = new Date(calCursor);
    d.setMonth(d.getMonth()-1);
    // Clamp: if month end < minDate's month start then block
    const monthEnd = new Date(d.getFullYear(), d.getMonth()+1, 0);
    if (monthEnd < minDate) return toast("Hors plage de réservation.");
    calCursor = d;
    renderCalendar();
    renderTimes();
  };

  next.onclick = ()=>{
    const d = new Date(calCursor);
    d.setMonth(d.getMonth()+1);
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
    if (monthStart > maxDate) return toast("Hors plage de réservation.");
    calCursor = d;
    renderCalendar();
    renderTimes();
  };
}

function renderTimes(){
  const modal = ensureModal();
  const timeGrid = $("#timeGrid", modal);
  const noTimes = $("#noTimes", modal);

  timeGrid.innerHTML = "";
  noTimes.style.display = "none";

  if (!selectedService || !selectedDateKey){
    noTimes.textContent = "Choisis une date pour voir les créneaux.";
    noTimes.style.display = "block";
    return;
  }

  const starts = computeAvailableStartTimes(selectedDateKey, selectedService);
  if (starts.length === 0){
    noTimes.textContent = "Aucun créneau disponible ce jour-là.";
    noTimes.style.display = "block";
    return;
  }

  timeGrid.innerHTML = starts.map(t=>`
    <button class="timeBtn" type="button" aria-selected="${selectedStartTime===t}" data-time="${t}">
      ${t}
    </button>
  `).join("");

  $all(".timeBtn", timeGrid).forEach(btn=>{
    btn.addEventListener("click", ()=>{
      selectedStartTime = btn.getAttribute("data-time");
      renderTimes();
      toast(`Créneau sélectionné: ${selectedStartTime}`);
    });
  });
}

 function openBooking(serviceId){
  selectedService = SERVICES.find(s=>s.id===serviceId) || null;
  if (!selectedService) return;

  const modal = ensureModal();
  $("#modalTitle", modal).textContent = `Réserver — ${selectedService.name}`;
  $("#modalMeta", modal).textContent = `${selectedService.price} • ${selectedService.durationMin} min`;

  // reset selection each time
  selectedDateKey = null;
  selectedStartTime = null;
  calCursor = null;

  modal.classList.add("show");

  renderCalendar();
  renderTimes();
}

function closeModal(){
  const modal = ensureModal();
  modal.classList.remove("show");
}

function hookQuickCTA(){
  const heroBtn = $("#heroReserveBtn");
  if (heroBtn){
    heroBtn.addEventListener("click", ()=>{
      // Default to first popular service
      openBooking("coupe-simple");
    });
  }
}

document.addEventListener("DOMContentLoaded", ()=>{
  renderServices();
  hookQuickCTA();

  // Delegate openBooking from service page CTA, if any
  const open = $("#openBookingFromQuery");
  const params = new URLSearchParams(location.search);
  const service = params.get("service");
  if (service){
    setTimeout(()=> openBooking(service), 250);
  }
});

window.openBooking = openBooking;