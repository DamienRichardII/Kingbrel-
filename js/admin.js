import { $, $all, toast } from "./app.js";
import { SERVICES, STORAGE, BUSINESS, readJSON, writeJSON, getAvailabilityForDate, getBookings, setBookings } from "./booking.js";

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
function generateSlots(step=BUSINESS.stepMin){
  const start = parseTimeToMin(BUSINESS.start);
  const end = parseTimeToMin(BUSINESS.end);
  const slots = [];
  for(let m=start; m<=end; m+=step) slots.push(minToTime(m));
  return slots;
}

function getAvailAll(){
  return readJSON(STORAGE.avail, {});
}
function setAvailAll(obj){
  writeJSON(STORAGE.avail, obj);
}

function setDayOpen(dateKey, open){
  const all = getAvailAll();
  if (!all[dateKey]) all[dateKey] = { open:true, slots: generateSlots() };
  all[dateKey].open = open;
  if (open && (!Array.isArray(all[dateKey].slots) || all[dateKey].slots.length===0)){
    all[dateKey].slots = generateSlots();
  }
  setAvailAll(all);
}

function setDaySlots(dateKey, slots){
  const all = getAvailAll();
  all[dateKey] = { open:true, slots };
  setAvailAll(all);
}

function copyDay(fromKey, toKey){
  const all = getAvailAll();
  if (!all[fromKey]) return false;
  all[toKey] = JSON.parse(JSON.stringify(all[fromKey]));
  setAvailAll(all);
  return true;
}

/* --------- UI --------- */

let selectedDateKey = null;

function renderDatePicker(){
  const input = $("#adminDate");
  if (!input) return;

  const now = new Date();
  input.value = toDateKey(now);
  selectedDateKey = input.value;

  input.addEventListener("change", ()=>{
    selectedDateKey = input.value;
    renderDayEditor();
    renderBookings();
  });

  renderDayEditor();
  renderBookings();
}

function renderDayEditor(){
  const wrap = $("#dayEditor");
  if (!wrap || !selectedDateKey) return;

  const av = getAvailabilityForDate(selectedDateKey);
  const allSlots = generateSlots();

  wrap.innerHTML = `
    <div class="panel">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap">
        <div>
          <h3 style="margin:0 0 6px">Disponibilités — ${selectedDateKey}</h3>
          <p style="margin:0; color: rgba(255,255,255,.72); line-height:1.6">
            Active/désactive la journée, puis coche les créneaux ouverts (12h → 19h).
          </p>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap">
          <button class="btn" id="dayOpenBtn">${av.open ? "Fermer la journée" : "Ouvrir la journée"}</button>
          <button class="btn btn--primary" id="allOpen">Tout ouvrir</button>
          <button class="btn" id="allClose">Tout fermer</button>
        </div>
      </div>

      <div class="hr"></div>

      <div id="slotGrid" style="display:grid; grid-template-columns: repeat(6, 1fr); gap:8px"></div>

      <div class="hr"></div>

      <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center">
        <button class="btn btn--primary" id="saveSlots">Enregistrer</button>
        <button class="btn" id="copyPrev">Copier la veille</button>
        <button class="btn" id="copyNext">Copier le lendemain</button>
        <button class="btn" id="resetToDefault">Réinitialiser (par défaut)</button>
      </div>
    </div>
  `;

  const slotGrid = $("#slotGrid", wrap);

  const openSlots = new Set(av.open ? av.slots : []);
  slotGrid.innerHTML = allSlots.map(t=>{
    const checked = openSlots.has(t);
    return `
      <label class="btn" style="border-radius:14px; justify-content:flex-start; gap:10px; padding:10px 12px">
        <input type="checkbox" data-slot="${t}" ${checked ? "checked" : ""} ${av.open ? "" : "disabled"} />
        <span style="font-weight:800">${t}</span>
      </label>
    `;
  }).join("");

  $("#dayOpenBtn", wrap).addEventListener("click", ()=>{
    setDayOpen(selectedDateKey, !av.open);
    toast(!av.open ? "Journée ouverte" : "Journée fermée");
    renderDayEditor();
    renderBookings();
  });

  $("#allOpen", wrap).addEventListener("click", ()=>{
    if (!av.open) setDayOpen(selectedDateKey, true);
    $all('input[type="checkbox"]', wrap).forEach(cb=> cb.checked = true);
  });

  $("#allClose", wrap).addEventListener("click", ()=>{
    $all('input[type="checkbox"]', wrap).forEach(cb=> cb.checked = false);
  });

  $("#saveSlots", wrap).addEventListener("click", ()=>{
    const slots = $all('input[type="checkbox"]', wrap)
      .filter(cb=> cb.checked)
      .map(cb=> cb.getAttribute("data-slot"));
    if (slots.length === 0){
      setDayOpen(selectedDateKey, false);
      toast("Journée fermée (aucun créneau)");
    }else{
      setDaySlots(selectedDateKey, slots);
      toast("Disponibilités enregistrées ✔");
    }
    renderBookings();
  });

  const d = new Date(selectedDateKey+"T00:00:00");
  const prev = new Date(d); prev.setDate(prev.getDate()-1);
  const next = new Date(d); next.setDate(next.getDate()+1);

  $("#copyPrev", wrap).addEventListener("click", ()=>{
    const ok = copyDay(toDateKey(prev), selectedDateKey);
    toast(ok ? "Copié depuis la veille" : "Aucun réglage la veille");
    renderDayEditor();
    renderBookings();
  });

  $("#copyNext", wrap).addEventListener("click", ()=>{
    const ok = copyDay(toDateKey(next), selectedDateKey);
    toast(ok ? "Copié depuis le lendemain" : "Aucun réglage le lendemain");
    renderDayEditor();
    renderBookings();
  });

  $("#resetToDefault", wrap).addEventListener("click", ()=>{
    const all = getAvailAll();
    delete all[selectedDateKey];
    setAvailAll(all);
    toast("Réinitialisé (disponibilités par défaut)");
    renderDayEditor();
    renderBookings();
  });
}

function renderBookings(){
  const wrap = $("#bookingList");
  if (!wrap || !selectedDateKey) return;

  const bookings = getBookings().filter(b => b.date === selectedDateKey).sort((a,b)=>a.start.localeCompare(b.start));
  wrap.innerHTML = `
    <div class="panel">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap">
        <div>
          <h3 style="margin:0 0 6px">Réservations — ${selectedDateKey}</h3>
          <p style="margin:0; color: rgba(255,255,255,.72); line-height:1.6">
            Supprimer une réservation libère automatiquement le créneau.
          </p>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap">
          <button class="btn" id="exportCSV">Exporter CSV</button>
          <button class="btn" id="wipeDay">Supprimer les réservations du jour</button>
        </div>
      </div>

      <div class="hr"></div>

      ${bookings.length===0 ? `<p style="margin:0; color: rgba(255,255,255,.72)">Aucune réservation ce jour.</p>` : `
        <table class="table">
          <thead>
            <tr>
              <th>Horaire</th>
              <th>Prestation</th>
              <th>Client</th>
              <th>Contact</th>
              <th>Note</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${bookings.map(b=>`
              <tr>
                <td style="font-weight:800">${b.start} → ${b.end}</td>
                <td>${b.serviceName}</td>
                <td>${escapeHtml(b.name)}</td>
                <td>${escapeHtml(b.phone)}<br/>${escapeHtml(b.email)}</td>
                <td>${escapeHtml(b.note || "")}</td>
                <td><button class="btn" data-del="${b.id}">Supprimer</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `}
    </div>
  `;

  $all("[data-del]", wrap).forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-del");
      const list = getBookings().filter(b => b.id !== id);
      setBookings(list);
      toast("Réservation supprimée");
      renderBookings();
    });
  });

  $("#wipeDay", wrap).addEventListener("click", ()=>{
    if (!confirm("Supprimer toutes les réservations de ce jour ?")) return;
    const list = getBookings().filter(b => b.date !== selectedDateKey);
    setBookings(list);
    toast("Réservations du jour supprimées");
    renderBookings();
  });

  $("#exportCSV", wrap).addEventListener("click", ()=>{
    const headers = ["date","start","end","serviceName","name","phone","email","note","createdAt"];
    const rows = bookings.map(b=> headers.map(h => csvEscape(String(b[h] ?? ""))).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    downloadText(`kingbrel-reservations-${selectedDateKey}.csv`, csv, "text/csv;charset=utf-8");
  });
}

function csvEscape(v){
  if (/[,"\n]/.test(v)) return `"${v.replaceAll('"','""')}"`;
  return v;
}
function downloadText(filename, content, mime){
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
function escapeHtml(s){
  return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

function renderStats(){
  const el = $("#stats");
  if (!el) return;
  const all = getBookings();
  const upcoming = all.length;
  const uniqueEmails = new Set(all.map(b=>b.email)).size;
  el.innerHTML = `
    <div class="grid3">
      <div class="card">
        <h3 style="margin:0 0 6px">Réservations</h3>
        <p style="margin:0">${upcoming} au total</p>
      </div>
      <div class="card">
        <h3 style="margin:0 0 6px">Clients</h3>
        <p style="margin:0">${uniqueEmails} emails uniques</p>
      </div>
      <div class="card">
        <h3 style="margin:0 0 6px">Horaires</h3>
        <p style="margin:0">12h → 19h</p>
      </div>
    </div>
  `;
}

document.addEventListener("DOMContentLoaded", ()=>{
  renderDatePicker();
  renderStats();
});
