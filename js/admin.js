
// ========== MASQUER LA CONSOLE DE DEBUG ==========
(function suppressDebugConsole(){
  // On garde les erreurs (console.error) mais on cache les logs/warnings
  var noop = function(){};
  console.log = noop;
  console.warn = noop;
  console.info = noop;
  console.debug = noop;
})();

// admin.js (no-module build) — Version améliorée avec planning, toutes réservations, email
// Récupère $ depuis app.js — évite le SyntaxError de redéclaration
var $    = (window.KBApp && window.KBApp.$)    || function(sel, root){ return (root||document).querySelector(sel); };
var $all = (window.KBApp && window.KBApp.$all) || function(sel, root){ return Array.from((root||document).querySelectorAll(sel)); };
var toast = (window.KBApp && window.KBApp.toast) || function(msg){ console.log(msg); };

// Accès lazy à KBBooking — évite le race condition avec defer
function KB() { return window.KBBooking || {}; }
var SERVICES              = function(){ return KB().SERVICES || []; };
var STORAGE               = { bookings: "kb_bookings", avail: "kb_availability" };
var BUSINESS              = { start:"10:00", end:"20:00", stepMin:15 };
function readJSON(key, def){ try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch(e){ return def; } }
function writeJSON(key, val){ localStorage.setItem(key, JSON.stringify(val)); }
function getBookings(){ return readJSON(STORAGE.bookings, []); }
function setBookings(list){ writeJSON(STORAGE.bookings, list); }
function getAvailabilityForDate(d){
  const all = getAvailAll();
  if (all[d]) return all[d];
  // Default: journée ouverte 10h-20h, tous les créneaux disponibles
  var slots = [];
  for (var m = 10*60; m <= 20*60; m += 15) {
    slots.push(pad2(Math.floor(m/60)) + ":" + pad2(m%60));
  }
  return { open: true, slots: slots };
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
function generateSlots(step=BUSINESS.stepMin){
  const start = parseTimeToMin(BUSINESS.start);
  const end = parseTimeToMin(BUSINESS.end);
  const slots = [];
  for(let m=start; m<=end; m+=step) slots.push(minToTime(m));
  return slots;
}
function escapeHtml(s){
  return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
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

/* ========== EMAIL CONFIG ========== */
const EMAIL_STORAGE_KEY = "kb_email_config";

function getEmailConfig(){
  const defaults = {
    adminEmail:          "Kingbrel.paris@gmail.com",
    serviceId:           "service_bfriu0y",
    templateId:          "template_ynkyy9d",
    publicKey:           "UCtJeGwPU8PvmNu14",
    templateClientEmail: "template_mg4gs3p",
    templateClientSms:   "template_8bv9xa1",
  };
  const saved = readJSON(EMAIL_STORAGE_KEY, null);
  return saved ? Object.assign({}, defaults, saved) : defaults;
}
function saveEmailConfig(cfg){
  writeJSON(EMAIL_STORAGE_KEY, cfg);
}

function initEmailJs(){
  const cfg = getEmailConfig();
  if (cfg.publicKey && typeof emailjs !== "undefined"){
    emailjs.init(cfg.publicKey);
    return true;
  }
  return false;
}

async function sendBookingEmail(booking){
  const cfg = getEmailConfig();
  if (!cfg.adminEmail || !cfg.serviceId || !cfg.templateId || !cfg.publicKey){
    console.warn("[KINGBREL] EmailJS non configuré, email non envoyé.");
    return false;
  }
  try {
    if (typeof emailjs === "undefined") return false;
    emailjs.init(cfg.publicKey);
    await emailjs.send(cfg.serviceId, cfg.templateId, {
      to_email: cfg.adminEmail,
      client_name: booking.name,
      service_name: booking.serviceName,
      date: booking.date,
      start: booking.start,
      end: booking.end,
      client_phone: booking.phone,
      client_email: booking.email,
      note: booking.note || "—",
    });
    return true;
  } catch(err){
    console.error("[KINGBREL] Erreur EmailJS:", err);
    return false;
  }
}


/* ========== NO-SHOW MANUEL ========== */
function renderNoShowSection(){
  const el = document.getElementById("noShowSection");
  if (!el) return;

  const bookings = getBookings();
  const noShows = bookings.filter(b => b.noShow === true);
  const upcoming = bookings.filter(b => !b.noShow).sort((a,b) => (a.date||"").localeCompare(b.date||"") || (a.start||"").localeCompare(b.start||""));

  el.innerHTML = `
    <div class="panel">
      <h3 style="margin:0 0 6px">Déclarer un No-Show <span class="badge-count" style="background:#ff6b6b; color:#fff">${noShows.length}</span></h3>
      <p style="margin:0 0 14px; color: rgba(255,255,255,.55); font-size:.85rem">
        Sélectionne une réservation passée et marque le client comme no-show. Cela consigne l'incident dans l'historique.
      </p>

      <div class="field" style="max-width:400px; margin-bottom:14px">
        <div class="label">Sélectionner une réservation</div>
        <select class="input" id="noShowSelect" style="padding:10px 12px">
          <option value="">— Choisir un client —</option>
          ${upcoming.map(b => `<option value="${escapeHtml(b.id)}">${b.date} ${b.start} — ${escapeHtml(b.name)} (${escapeHtml(b.serviceName)})</option>`).join("")}
        </select>
      </div>

      <button class="btn" id="markNoShow" style="background:rgba(255,80,80,.15); border-color:rgba(255,80,80,.4); color:#ff8080; font-weight:700">
        ⚠️ Marquer comme No-Show
      </button>

      ${noShows.length > 0 ? `
        <div class="hr"></div>
        <h4 style="margin:0 0 10px; color: rgba(255,255,255,.7)">Historique No-Shows</h4>
        ${noShows.map(b => `
          <div style="background:rgba(255,80,80,.08); border:1px solid rgba(255,80,80,.2); border-left:3px solid #ff6b6b; border-radius:12px; padding:12px 14px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px">
            <div>
              <div style="font-weight:800">${escapeHtml(b.name)}</div>
              <div style="font-size:.8rem; color:rgba(255,255,255,.55)">${b.date} • ${b.start} → ${b.end} • ${escapeHtml(b.serviceName)}</div>
              <div style="font-size:.8rem; color:rgba(255,255,255,.55)">📞 ${escapeHtml(b.phone)} • ✉️ ${escapeHtml(b.email)}</div>
              ${b.cardLast4 ? `<div style="font-size:.8rem; color:#ff8080; font-weight:700; margin-top:3px">💳 ••••${escapeHtml(b.cardLast4)} — Prélèvement prévu : ${escapeHtml(b.noshowAmount||"—")}</div>` : ""}
            </div>
            <button class="btn" style="font-size:.75rem; color:rgba(255,255,255,.5)" data-undo-noshow="${escapeHtml(b.id)}">Annuler no-show</button>
          </div>
        `).join("")}
      ` : ""}
    </div>
  `;

  document.getElementById("markNoShow")?.addEventListener("click", () => {
    const select = document.getElementById("noShowSelect");
    const id = select?.value;
    if (!id) return toast("Sélectionne d'abord une réservation.");
    const list = getBookings();
    const idx = list.findIndex(b => b.id === id);
    if (idx === -1) return toast("Réservation introuvable.");
    list[idx].noShow = true;
    list[idx].noShowDate = new Date().toISOString();
    setBookings(list);
    toast("No-show enregistré ⚠️");
    renderNoShowSection();
    renderStats();
  });

  document.querySelectorAll("[data-undo-noshow]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-undo-noshow");
      const list = getBookings();
      const idx = list.findIndex(b => b.id === id);
      if (idx === -1) return;
      delete list[idx].noShow;
      delete list[idx].noShowDate;
      setBookings(list);
      toast("No-show annulé");
      renderNoShowSection();
      renderStats();
    });
  });
}

/* ========== TABS ========== */
function activateTab(tabId){
  document.querySelectorAll(".admin-tab").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".admin-pane").forEach(p => p.classList.remove("active"));
  const btn = document.querySelector(`.admin-tab[data-tab="${tabId}"]`);
  if (btn) btn.classList.add("active");
  const pane = document.getElementById(`pane-${tabId}`);
  if (pane) pane.classList.add("active");
  // Update hash without scroll
  history.replaceState(null, "", `#${tabId}`);
}

function initTabs(){
  document.querySelectorAll(".admin-tab[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      activateTab(btn.getAttribute("data-tab"));
    });
  });

  // Support hash navigation (for links from planning.html)
  const hash = location.hash.replace("#", "");
  const validTabs = ["reservations","disponibilites","noshow","email"];
  if (hash && validTabs.includes(hash)) {
    activateTab(hash);
  } else {
    activateTab("reservations");
  }
}

/* ========== ALL BOOKINGS ========== */
function getWeekBounds(){
  const now = new Date();
  const day = now.getDay();
  const diff = (day === 0) ? -6 : 1 - day;
  const mon = new Date(now); mon.setDate(mon.getDate() + diff); mon.setHours(0,0,0,0);
  const sun = new Date(mon); sun.setDate(sun.getDate() + 6); sun.setHours(23,59,59,999);
  return { mon, sun };
}

function renderAllBookings(){
  const list = $("#allBookingsList");
  const badge = $("#totalBadge");
  if (!list) return;

  let bookings = getBookings().sort((a,b) => {
    const da = (a.date || ""), db = (b.date || "");
    const d = da.localeCompare(db);
    return d !== 0 ? d : (a.start || "").localeCompare(b.start || "");
  });

  // Populate service filter
  const serviceFilter = $("#filterService");
  if (serviceFilter && serviceFilter.options.length === 1){
    const serviceNames = [...new Set(bookings.map(b => b.serviceName))].sort();
    serviceNames.forEach(name => {
      const opt = document.createElement("option");
      opt.value = name; opt.textContent = name;
      serviceFilter.append(opt);
    });
  }

  // Apply filters
  const period = $("#filterPeriod")?.value || "all";
  const search = $("#filterSearch")?.value.toLowerCase() || "";
  const service = $("#filterService")?.value || "";
  const today = toDateKey(new Date());
  const { mon, sun } = getWeekBounds();

  if (period === "today") bookings = bookings.filter(b => b.date === today);
  else if (period === "upcoming") bookings = bookings.filter(b => b.date >= today);
  else if (period === "past") bookings = bookings.filter(b => b.date < today);
  else if (period === "week"){
    bookings = bookings.filter(b => {
      const d = new Date(b.date + "T00:00:00");
      return d >= mon && d <= sun;
    });
  }
  if (search) bookings = bookings.filter(b =>
    b.name.toLowerCase().includes(search) ||
    b.email.toLowerCase().includes(search) ||
    b.phone.toLowerCase().includes(search)
  );
  if (service) bookings = bookings.filter(b => b.serviceName === service);

  badge.textContent = bookings.length;

  if (bookings.length === 0){
    list.innerHTML = `<p style="color: rgba(255,255,255,.5); padding:20px 0">Aucune réservation trouvée.</p>`;
    return;
  }

  list.innerHTML = bookings.map(b => {
    const created = new Date(b.createdAt).toLocaleDateString("fr-FR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" });
    return `
      <div class="booking-card" data-id="${b.id}">
        <div>
          <div class="bc-time">${b.start} → ${b.end}</div>
          <div class="bc-date">${b.date}</div>
        </div>
        <div>
          <div class="bc-name">${escapeHtml(b.name)}</div>
          <div class="bc-meta">
            📞 ${escapeHtml(b.phone)}<br>
            ✉️ ${escapeHtml(b.email)}<br>
            ${b.cardLast4 ? `💳 •••• ${escapeHtml(b.cardLast4)} — No-show: <strong style="color:var(--supernova)">${escapeHtml(b.noshowAmount || "—")}</strong><br>` : ""}
            ${b.note ? `💬 ${escapeHtml(b.note)}<br>` : ""}
            <span style="font-size:.72rem; color:rgba(255,255,255,.35)">Réservé le ${created}</span>
          </div>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px; align-items:flex-end">
          <span class="bc-service">${escapeHtml(b.serviceName)}</span>
          <button class="btn" style="font-size:.75rem; padding:6px 12px; color:#ff8080; border-color:rgba(255,80,80,.3)" data-del="${b.id}">Supprimer</button>
        </div>
      </div>
    `;
  }).join("");

  $all("[data-del]", list).forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-del");
      if (!confirm("Supprimer cette réservation ?")) return;
      const updated = getBookings().filter(b => b.id !== id);
      setBookings(updated);
      toast("Réservation supprimée");
      renderAllBookings();
      renderStats();
    });
  });
}

/* ========== DISPONIBILITÉS (ancien code) ========== */
function getAvailAll(){ return readJSON(STORAGE.avail, {}); }
function setAvailAll(obj){ writeJSON(STORAGE.avail, obj); }
function setDayOpen(dateKey, open){
  const all = getAvailAll();
  if (!all[dateKey]) all[dateKey] = { open:true, slots: generateSlots() };
  all[dateKey].open = open;
  if (open && (!Array.isArray(all[dateKey].slots) || all[dateKey].slots.length===0))
    all[dateKey].slots = generateSlots();
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
          <p style="margin:0; color: rgba(255,255,255,.72); line-height:1.6">Active/désactive la journée et les créneaux horaires.</p>
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
        <button class="btn" id="resetToDefault">Réinitialiser</button>
      </div>
    </div>
  `;
  const slotGrid = $("#slotGrid", wrap);
  const openSlots = new Set(av.open ? av.slots : []);
  slotGrid.innerHTML = allSlots.map(t=>`
    <label class="btn" style="border-radius:14px; justify-content:flex-start; gap:10px; padding:10px 12px">
      <input type="checkbox" data-slot="${t}" ${openSlots.has(t) ? "checked" : ""} ${av.open ? "" : "disabled"} />
      <span style="font-weight:800">${t}</span>
    </label>
  `).join("");
  $("#dayOpenBtn", wrap).addEventListener("click", ()=>{
    setDayOpen(selectedDateKey, !av.open);
    toast(!av.open ? "Journée ouverte" : "Journée fermée");
    renderDayEditor(); renderBookings();
  });
  $("#allOpen", wrap).addEventListener("click", ()=>{
    if (!av.open) setDayOpen(selectedDateKey, true);
    $all('input[type="checkbox"]', wrap).forEach(cb=> cb.checked = true);
  });
  $("#allClose", wrap).addEventListener("click", ()=>{
    $all('input[type="checkbox"]', wrap).forEach(cb=> cb.checked = false);
  });
  $("#saveSlots", wrap).addEventListener("click", ()=>{
    const slots = $all('input[type="checkbox"]', wrap).filter(cb=> cb.checked).map(cb=> cb.getAttribute("data-slot"));
    if (slots.length === 0){ setDayOpen(selectedDateKey, false); toast("Journée fermée (aucun créneau)"); }
    else { setDaySlots(selectedDateKey, slots); toast("Disponibilités enregistrées ✔"); }
    renderBookings();
  });
  const d = new Date(selectedDateKey+"T00:00:00");
  const prev = new Date(d); prev.setDate(prev.getDate()-1);
  const next = new Date(d); next.setDate(next.getDate()+1);
  $("#copyPrev", wrap).addEventListener("click", ()=>{ const ok=copyDay(toDateKey(prev),selectedDateKey); toast(ok?"Copié depuis la veille":"Aucun réglage la veille"); renderDayEditor(); renderBookings(); });
  $("#copyNext", wrap).addEventListener("click", ()=>{ const ok=copyDay(toDateKey(next),selectedDateKey); toast(ok?"Copié depuis le lendemain":"Aucun réglage le lendemain"); renderDayEditor(); renderBookings(); });
  $("#resetToDefault", wrap).addEventListener("click", ()=>{
    const all=getAvailAll(); delete all[selectedDateKey]; setAvailAll(all);
    toast("Réinitialisé"); renderDayEditor(); renderBookings();
  });
}

function renderBookings(){
  const wrap = $("#bookingList");
  if (!wrap || !selectedDateKey) return;
  const bookings = getBookings().filter(b => b.date === selectedDateKey).sort((a,b)=>(a.start||"").localeCompare(b.start||""));
  wrap.innerHTML = `
    <div class="panel">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap">
        <h3 style="margin:0 0 6px">Réservations — ${selectedDateKey}</h3>
        <div style="display:flex; gap:10px; flex-wrap:wrap">
          <button class="btn" id="exportCSV">Exporter CSV</button>
          <button class="btn" id="wipeDay">Supprimer le jour</button>
        </div>
      </div>
      <div class="hr"></div>
      ${bookings.length===0 ? `<p style="margin:0; color: rgba(255,255,255,.72)">Aucune réservation ce jour.</p>` : `
        <table class="table">
          <thead><tr><th>Horaire</th><th>Prestation</th><th>Client</th><th>Contact</th><th>Carte / No-show</th><th>Note</th><th>Action</th></tr></thead>
          <tbody>
            ${bookings.map(b=>`
              <tr>
                <td style="font-weight:800">${b.start} → ${b.end}</td>
                <td>${b.serviceName}</td>
                <td>${escapeHtml(b.name)}</td>
                <td>${escapeHtml(b.phone)}<br/>${escapeHtml(b.email)}</td>
                <td>${b.cardLast4 ? "💳 ••••"+escapeHtml(b.cardLast4)+"<br><span style='color:var(--supernova);font-weight:700'>No-show: "+escapeHtml(b.noshowAmount||"—")+"</span>" : "—"}</td>
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
      setBookings(list); toast("Réservation supprimée");
      renderBookings(); renderStats();
    });
  });
  $("#wipeDay", wrap).addEventListener("click", ()=>{
    if (!confirm("Supprimer toutes les réservations de ce jour ?")) return;
    const list = getBookings().filter(b => b.date !== selectedDateKey);
    setBookings(list); toast("Réservations du jour supprimées");
    renderBookings(); renderStats();
  });
  $("#exportCSV", wrap).addEventListener("click", ()=>{
    const headers = ["date","start","end","serviceName","name","phone","email","note","createdAt"];
    const rows = bookings.map(b=> headers.map(h => csvEscape(String(b[h] ?? ""))).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    downloadText(`kingbrel-reservations-${selectedDateKey}.csv`, csv, "text/csv;charset=utf-8");
  });
}

/* ========== STATS ========== */
function renderStats(){
  const el = $("#stats");
  if (!el) return;
  const all = getBookings();
  const today = toDateKey(new Date());
  const todayCount = all.filter(b => b.date === today).length;
  const upcoming = all.filter(b => b.date >= today).length;
  el.innerHTML = `
    <div class="grid3">
      <div class="card"><h3 style="margin:0 0 6px">Total réservations</h3><p style="margin:0; font-size:1.5rem; font-weight:800; color:var(--supernova)">${all.length}</p></div>
      <div class="card"><h3 style="margin:0 0 6px">Aujourd'hui</h3><p style="margin:0; font-size:1.5rem; font-weight:800; color:var(--supernova)">${todayCount}</p></div>
      <div class="card"><h3 style="margin:0 0 6px">À venir</h3><p style="margin:0; font-size:1.5rem; font-weight:800; color:var(--supernova)">${upcoming}</p></div>
    </div>
  `;
}

/* ========== EMAIL CONFIG UI ========== */
function renderEmailConfig(){
  const cfg = getEmailConfig();
  const adminEmailEl = $("#adminEmail");
  const serviceIdEl = $("#ejsServiceId");
  const templateIdEl = $("#ejsTemplateId");
  const publicKeyEl = $("#ejsPublicKey");
  if (!adminEmailEl) return;

  adminEmailEl.value = cfg.adminEmail || "";
  const tplClientEmailEl = document.getElementById("ejsTemplateClientEmail");
  const tplClientSmsEl   = document.getElementById("ejsTemplateClientSms");
  if (tplClientEmailEl) tplClientEmailEl.value = cfg.templateClientEmail || "";
  if (tplClientSmsEl)   tplClientSmsEl.value   = cfg.templateClientSms   || "";
  serviceIdEl.value = cfg.serviceId || "";
  templateIdEl.value = cfg.templateId || "";
  publicKeyEl.value = cfg.publicKey || "";

  const status = $("#emailStatus");
  if (cfg.publicKey && cfg.serviceId && cfg.templateId && cfg.adminEmail){
    status.className = "email-status ok";
    status.textContent = "✅ EmailJS configuré. Les notifications seront envoyées à " + cfg.adminEmail;
  }

  $("#saveEmailConfig").addEventListener("click", () => {
    const newCfg = {
      adminEmail: adminEmailEl.value.trim(),
      serviceId: serviceIdEl.value.trim(),
      templateId: templateIdEl.value.trim(),
      publicKey: publicKeyEl.value.trim(),
      templateClientEmail: (document.getElementById("ejsTemplateClientEmail")?.value || "").trim() || "template_confirmation_email",
      templateClientSms:   (document.getElementById("ejsTemplateClientSms")?.value || "").trim(),
    };
    saveEmailConfig(newCfg);
    toast("Configuration enregistrée ✔");
    status.className = "email-status ok";
    status.textContent = "✅ Configuration sauvegardée. Emails envoyés à " + newCfg.adminEmail;
  });

  $("#testEmail").addEventListener("click", async () => {
    const testBooking = {
      name: "Client Test",
      serviceName: "Coupe simple",
      date: toDateKey(new Date()),
      start: "14:00",
      end: "14:45",
      phone: "06 00 00 00 00",
      email: "client@test.com",
      note: "Email de test depuis le panel admin",
    };
    const ok = await sendBookingEmail(testBooking);
    if (ok){
      status.className = "email-status ok";
      status.textContent = "✅ Email de test envoyé avec succès !";
      toast("Email de test envoyé ✔");
    } else {
      status.className = "email-status err";
      status.textContent = "❌ Échec d'envoi. Vérifie ta configuration EmailJS ou ouvre la console pour voir l'erreur.";
      toast("Erreur d'envoi - voir console");
    }
  });
}

/* ========== INTERCEPT BOOKING + SEND EMAIL ========== */
function hookBookingNotifications(){
  // Listen for new bookings via localStorage changes
  const origSetItem = localStorage.setItem.bind(localStorage);
  let prevBookings = JSON.stringify(getBookings());
  
  // Poll for new bookings every 2 seconds (works in file:// context too)
  setInterval(() => {
    const current = JSON.stringify(getBookings());
    if (current !== prevBookings){
      const old = JSON.parse(prevBookings);
      const now = JSON.parse(current);
      const oldIds = new Set(old.map(b => b.id));
      const newBookings = now.filter(b => !oldIds.has(b.id));
      newBookings.forEach(b => {
        sendBookingEmail(b).then(ok => {
          if (ok) console.log("[KINGBREL] Email envoyé pour réservation", b.id);
        });
      });
      prevBookings = current;
    }
  }, 2000);
}

/* ========== HOOK FOR BOOKING PAGE ========== */
// Override setBookings globally to intercept new bookings
(function patchSetBookings(){
  if (!window.KBBooking) return;
  const original = window.KBBooking.setBookings;
  window.KBBooking.setBookings = function(list){
    original(list);
    // The notification hook will pick it up via the polling interval
  };
})();

document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  renderStats();
  renderAllBookings();
  renderDatePicker();
  renderEmailConfig();
  hookBookingNotifications();
  renderNoShowSection();

  // Filter listeners
  const rerender = () => renderAllBookings();
  $("#filterPeriod")?.addEventListener("change", rerender);
  $("#filterSearch")?.addEventListener("input", rerender);
  $("#filterService")?.addEventListener("change", rerender);

  // Export all CSV
  $("#exportAllCSV")?.addEventListener("click", () => {
    const bookings = getBookings().sort((a,b) => (a.date||"").localeCompare(b.date||"") || (a.start||"").localeCompare(b.start||""));
    const headers = ["date","start","end","serviceName","name","phone","email","note","createdAt"];
    const rows = bookings.map(b=> headers.map(h => csvEscape(String(b[h] ?? ""))).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    downloadText(`kingbrel-toutes-reservations.csv`, csv, "text/csv;charset=utf-8");
  });

  // Wipe all
  $("#wipeAll")?.addEventListener("click", () => {
    if (!confirm("⚠️ Supprimer TOUTES les réservations ? Cette action est irréversible.")) return;
    setBookings([]);
    toast("Toutes les réservations supprimées");
    renderAllBookings();
    renderStats();
  });
});

// Expose email sender for booking.js to use
window.KBAdmin = { sendBookingEmail };

/* ========== NO-SHOW MANAGEMENT ========== */
const NOSHOW_KEY = "kb_noshows";

function getNoshows() {
  try { return JSON.parse(localStorage.getItem(NOSHOW_KEY) || "[]"); } catch(e) { return []; }
}
function setNoshows(list) {
  localStorage.setItem(NOSHOW_KEY, JSON.stringify(list));
}

function renderNoshowList() {
  const wrap = document.getElementById("noShowList");
  if (!wrap) return;
  const list = getNoshows().sort((a,b) => (b.createdAt||"").localeCompare(a.createdAt||""));

  if (list.length === 0) {
    wrap.innerHTML = '<p style="color:rgba(255,255,255,.4); margin:0; padding:10px 0">Aucun no-show enregistré.</p>';
    return;
  }

  wrap.innerHTML = '<h4 style="margin:0 0 12px">Historique des no-shows <span style="background:rgba(255,100,100,.2);border:1px solid rgba(255,100,100,.3);color:#ff8080;font-size:.75rem;padding:2px 8px;border-radius:50px;font-weight:700">' + list.length + '</span></h4>' +
    list.map(ns => {
      const d = new Date(ns.createdAt).toLocaleDateString("fr-FR", {day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
      return `<div style="background:rgba(255,100,100,.06);border:1px solid rgba(255,100,100,.18);border-left:3px solid #ff6b6b;border-radius:12px;padding:14px;margin-bottom:8px;display:grid;grid-template-columns:1fr auto;gap:10px;align-items:start">
        <div>
          <div style="font-weight:800;margin-bottom:4px">${escapeHtml(ns.name)}</div>
          <div style="font-size:.82rem;color:rgba(255,255,255,.6);line-height:1.7">
            📅 ${ns.date || "—"} à ${ns.time || "—"}<br>
            ✂️ ${escapeHtml(ns.service)} — Prix: <strong style="color:#ff8080">${escapeHtml(ns.noshowAmount)}</strong> à prélever<br>
            ${ns.note ? `💬 ${escapeHtml(ns.note)}<br>` : ""}
            <span style="font-size:.72rem;color:rgba(255,255,255,.3)">Enregistré le ${d}</span>
          </div>
        </div>
        <button class="btn" style="color:#ff8080;border-color:rgba(255,80,80,.3);font-size:.78rem;padding:6px 10px" data-del-ns="${ns.id}">Supprimer</button>
      </div>`;
    }).join("");

  wrap.querySelectorAll("[data-del-ns]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-del-ns");
      if (!confirm("Supprimer ce no-show ?")) return;
      setNoshows(getNoshows().filter(n => n.id !== id));
      renderNoshowList();
      toast("No-show supprimé");
    });
  });
}

function initNoshowForm() {
  const addBtn = document.getElementById("addNoShow");
  if (!addBtn) return;

  // Set today's date by default
  const dateInput = document.getElementById("ns_date");
  if (dateInput) dateInput.value = toDateKey(new Date());

  addBtn.addEventListener("click", () => {
    const name = (document.getElementById("ns_name")?.value || "").trim();
    const serviceVal = document.getElementById("ns_service")?.value || "";
    const date = document.getElementById("ns_date")?.value || "";
    const time = document.getElementById("ns_time")?.value || "";
    const note = (document.getElementById("ns_note")?.value || "").trim();

    if (!name) return toast("Indique le nom du client.");
    if (!serviceVal) return toast("Choisis une prestation.");

    const [service, price, noshowAmount] = serviceVal.split("|");

    const ns = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      name, service, price, noshowAmount, date, time, note,
      createdAt: new Date().toISOString(),
    };

    const list = getNoshows();
    list.push(ns);
    setNoshows(list);
    toast("No-show enregistré ✔");

    // Reset form
    document.getElementById("ns_name").value = "";
    document.getElementById("ns_service").value = "";
    document.getElementById("ns_time").value = "";
    document.getElementById("ns_note").value = "";

    renderNoshowList();
  });

  renderNoshowList();
}

/* ========== TAB PERSISTENCE (cross-page nav) ========== */
function initTabPersistence() {
  const saved = localStorage.getItem("kb_admin_tab");
  if (saved) {
    localStorage.removeItem("kb_admin_tab");
    // Activate the saved tab
    const tabBtn = document.querySelector(`.admin-tab[data-tab="${saved}"]`);
    if (tabBtn) {
      document.querySelectorAll(".admin-tab").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".admin-pane").forEach(p => p.classList.remove("active"));
      tabBtn.classList.add("active");
      const pane = document.getElementById(`pane-${saved}`);
      if (pane) pane.classList.add("active");
    }
  }
}

// Hook into DOMContentLoaded
document.addEventListener("DOMContentLoaded", () => {
  initNoshowForm();
  initTabPersistence();
});

/* ========== STRIPE LINKS CONFIG ========== */
const STRIPE_KEY = "kb_stripe_config";

function getStripeConfig() {
  try { return JSON.parse(localStorage.getItem(STRIPE_KEY) || "{}"); } catch(e) { return {}; }
}
function saveStripeConfig(cfg) {
  localStorage.setItem(STRIPE_KEY, JSON.stringify(cfg));
}

function initStripePanel() {
  const saveBtn = document.getElementById("saveStripeLinks");
  if (!saveBtn) return;

  // Load saved values
  const cfg = getStripeConfig();
  const fields = { silver: "stripe_silver", gold: "stripe_gold", platinium: "stripe_platinium", vip: "stripe_vip" };
  Object.entries(fields).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el && cfg[key]) el.value = cfg[key];
  });

  saveBtn.addEventListener("click", () => {
    const newCfg = {};
    Object.entries(fields).forEach(([key, id]) => {
      const el = document.getElementById(id);
      if (el && el.value.trim()) newCfg[key] = el.value.trim();
    });
    saveStripeConfig(newCfg);
    const status = document.getElementById("stripeStatus");
    if (status) { status.style.display = "block"; setTimeout(() => status.style.display = "none", 4000); }
    toast("Liens Stripe enregistrés ✔");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initStripePanel();
});
