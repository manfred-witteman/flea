// ======================
// Minimal Front-End SPA
// ======================
const $ = (sel) => document.querySelector(sel);

// ---------------------
// API helper
// ---------------------
const api = async (action, payload = {}, method = "POST") => {
  const opts = { method, headers: {} };
  if (method === "POST") {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify({ action, ...payload });
  }
  const res = await fetch("/flea/api/api.php", opts);
  if (!res.ok) throw new Error("Serverfout");
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
};

// ---------------------
// Formatters
// ---------------------
function formatEuro(value) {
  if (value == null) return "";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number(value));
}

function parseMoney(value) {
  if (!value) return null;
  value = value.replace(/\s+/g,'').replace(',', '.');
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}

// Convert Date to "YYYY-Www" for week input
function getISOWeekString(date) {
  const d = new Date(date.getTime());
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(),0,4);
  const weekNo = 1 + Math.round(((d - week1)/86400000 -3 + (week1.getDay()+6)%7)/7);
  return `${d.getFullYear()}-W${weekNo.toString().padStart(2,'0')}`;
}

// Convert week input "YYYY-Www" to Monday Date
function getDateOfISOWeek(weekStr) {
  const [year, week] = weekStr.split('-W').map(Number);
  const simple = new Date(year,0,1 + (week-1)*7);
  const dow = simple.getDay();
  const monday = simple;
  if (dow <= 4) monday.setDate(simple.getDate() - simple.getDay() +1);
  else monday.setDate(simple.getDate() +8 - simple.getDay());
  return monday;
}

// ---------------------
// Global state
// ---------------------
let currentUserId = null;
let currentDate = new Date();

// ---------------------
// UI helpers
// ---------------------
function setActiveTab(name) {
  document.querySelectorAll("section[id^='view-']").forEach(s => s.classList.add("hidden"));
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  $(`#view-${name}`)?.classList.remove("hidden");
  document.querySelector(`.tab[data-tab='${name}']`)?.classList.add("active");
}

function setDayLabel(d) {
  const todayStr = new Date().toISOString().slice(0,10);
  const dateStr = d.toISOString().slice(0,10);
  const opts = { weekday:'long', day:'numeric', month:'long' };
  let label = d.toLocaleDateString('nl-NL', opts);
  if (dateStr === todayStr) label += " (vandaag)";
  $("#day-label").textContent = label;
}

// ---------------------
// Sales rendering
// ---------------------
function renderTodaySales(data, showAll, currentUserId) {
  const list = $("#today-list");
  const empty = $("#today-empty");
  list.innerHTML = "";

  const colors = ["bg-indigo-500","bg-emerald-500","bg-rose-500","bg-amber-500","bg-sky-500","bg-purple-500","bg-fuchsia-500","bg-teal-500"];
  const colorForUser = (userId) => colors[userId % colors.length];

  const filteredSales = showAll ? data.sales : data.sales.filter(s => s.cashier_user_id == currentUserId);

  if (!filteredSales.length) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  let modal = document.getElementById("sale-modal");
  let modalImg = document.getElementById("sale-modal-img");

  if (!modal) {
    modal = document.createElement("div");
    modal.id = "sale-modal";
    modal.className = "fixed inset-0 bg-black bg-opacity-70 hidden flex items-center justify-center z-50";
    modal.style.transition = "opacity 0.2s ease";
    modal.style.opacity = 0;

    modalImg = document.createElement("img");
    modalImg.id = "sale-modal-img";
    modalImg.className = "max-w-full max-h-full rounded-lg shadow-lg";

    modal.appendChild(modalImg);
    document.body.appendChild(modal);

    modal.addEventListener("click", e => {
      if (e.target === modal) {
        modal.style.opacity = 0;
        setTimeout(() => modal.classList.add("hidden"), 200);
      }
    });
  }

  filteredSales.forEach(sale => {
    const li = document.createElement("li");
    li.className = "flex items-center gap-3 py-2";

    // Avatar
    const avatar = document.createElement("div");
    avatar.className = `flex items-center justify-center w-10 h-10 rounded-full text-white font-bold ${colorForUser(sale.cashier_user_id)}`;
    avatar.textContent = sale.cashier_name.charAt(0).toUpperCase();

    const textBlock = document.createElement("div");
    textBlock.className = "flex flex-col";

    const desc = document.createElement("div");
    desc.className = "font-medium";
    desc.textContent = sale.description;

    const sub = document.createElement("div");
    sub.className = "text-sm text-slate-500";
    sub.textContent = `${formatEuro(sale.price)} • ${sale.owner_name}`;

    textBlock.appendChild(desc);
    textBlock.appendChild(sub);

    li.appendChild(avatar);
    li.appendChild(textBlock);

    const spacer = document.createElement("div");
    spacer.className = "flex-1";
    li.appendChild(spacer);

    if ((sale.image_url && sale.image_url.trim() !== "") || sale.cashier_user_id === currentUserId) {
      const rightBlock = document.createElement("div");
      rightBlock.className = "grid grid-cols-[auto,20px] items-center gap-2";

      if (sale.image_url && sale.image_url.trim() !== "") {
        const thumb = document.createElement("img");
        const imagePath = sale.image_url.trim();
        const fullPath = imagePath.startsWith("/flea") ? imagePath : "/flea" + imagePath;

        thumb.className = "w-12 h-12 object-cover rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer transition-opacity duration-300";
        thumb.src = "/flea/api/uploads/placeholder.png";
        thumb.style.opacity = 0.5;

        const imgLoader = new Image();
        imgLoader.src = fullPath;
        imgLoader.onload = () => { thumb.src = fullPath; thumb.style.opacity = 1; };

        thumb.addEventListener("click", () => {
          modalImg.src = thumb.src;
          modal.classList.remove("hidden");
          requestAnimationFrame(() => modal.style.opacity = 1);
        });

        rightBlock.appendChild(thumb);
      }

      if (sale.cashier_user_id === currentUserId) {
        const btn = document.createElement("button");
        btn.className = "text-rose-600 hover:text-rose-700";
        btn.title = "Verwijderen";
        btn.dataset.id = sale.id;
        btn.innerHTML = `<i class="fa-solid fa-trash"></i>`;
        btn.addEventListener("click", async () => {
          if (!confirm("Verkoop verwijderen?")) return;
          await api("delete_sale",{ id: sale.id, image_url: sale.image_url });
          await refreshToday();
          await refreshBreakdown(currentDate);
        });
        rightBlock.appendChild(btn);
      } else {
        const placeholder = document.createElement("div");
        placeholder.className = "w-5";
        rightBlock.appendChild(placeholder);
      }

      li.appendChild(rightBlock);
    }

    list.appendChild(li);
  });
}

// ---------------------
// Refresh functions
// ---------------------
async function refreshToday() {
  const data = await api("list_sales",{ date: new Date().toISOString().slice(0,10) });
  const showAll = $("#filter-mine")?.checked ?? false;
  renderTodaySales(data, showAll, currentUserId);
}

async function refreshBreakdown(day, range="day") {
  setDayLabel(day);
  const dateStr = day.toISOString().slice(0,10);
  const data = await api("breakdown",{ date: dateStr, range });
  const list = $("#breakdown-list");
  list.innerHTML = "";
  data.rows.forEach(r => {
    const li = document.createElement("li");
    li.className = "py-3 flex items-center justify-between";
    li.innerHTML = `<span>${r.owner_name}</span><span class="font-medium">${formatEuro(r.revenue)}</span>`;
    list.appendChild(li);
  });
  $("#breakdown-total").textContent = formatEuro(data.total);
}

// ---------------------
// Owner select
// ---------------------
async function populateOwnerSelect(defaultUserId) {
  const select = $("#owner-select");
  if (!select) return;
  const dataUsers = await api("list_users");
  select.innerHTML = "";
  dataUsers.users.forEach(u => {
    const option = document.createElement("option");
    option.value = u.id.toString();
    option.textContent = u.name;
    select.appendChild(option);
  });
  if (defaultUserId) select.value = defaultUserId.toString();
}

// ---------------------
// Image handling
// ---------------------
const imageInput = $("#image-upload");
const preview = $("#image-preview");
const imageUrlInput = $('input[name="image_url"]');

imageInput?.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  // Preview
  const reader = new FileReader();
  reader.onload = e => {
    preview.src = e.target.result;
    preview.classList.remove('hidden');
  };
  reader.readAsDataURL(file);

  // Upload
  const formData = new FormData();
  formData.append('image', file);
  formData.append('action', 'upload_image');

  try {
    const res = await fetch('/flea/api/api.php',{ method:'POST', body:formData });
    const data = await res.json();
    if (data.success) imageUrlInput.value = data.url;
    else alert('Upload fout: '+(data.error||'Onbekend'));
  } catch(err) { console.error('Upload error',err); }
});

// ---------------------
// Breakdown FAB
// ---------------------
function initBreakdownFAB() {
  const fabBtn = $("#breakdown-date-btn");
  const fabMenu = $("#breakdown-fab-menu");
  const dateInput = $("#breakdown-date-picker");
  const weekInput = $("#breakdown-week-picker");

  fabBtn?.addEventListener("click", () => {
    fabMenu.classList.toggle("hidden");
    dateInput.value = currentDate.toISOString().slice(0,10);
    weekInput.value = getISOWeekString(currentDate);
  });

  dateInput?.addEventListener("change", async () => {
    if (!dateInput.value) return;
    currentDate = new Date(dateInput.value);
    await refreshBreakdown(currentDate,"day");
    fabMenu.classList.add("hidden");
  });

  weekInput?.addEventListener("change", async () => {
    if (!weekInput.value) return;
    currentDate = getDateOfISOWeek(weekInput.value);
    await refreshBreakdown(currentDate,"week");
    fabMenu.classList.add("hidden");
  });

  fabMenu?.querySelector("button[data-range='month']")?.addEventListener("click", async () => {
    await refreshBreakdown(currentDate,"month");
    fabMenu.classList.add("hidden");
  });

  fabMenu?.querySelector("label[for='breakdown-date-picker']")?.addEventListener("click", () => dateInput.click());
  fabMenu?.querySelector("label[for='breakdown-week-picker']")?.addEventListener("click", () => weekInput.click());
}

// ---------------------
// Session handling
// ---------------------
async function checkSession() {
  try {
    const me = await api("me");
    if (me?.user) {
      currentUserId = me.user.id;
      $("#screen-login").classList.add("hidden");
      $("#screen-app").classList.remove("hidden");
      await populateOwnerSelect(currentUserId);
      currentDate = new Date();
      await refreshToday();
      await refreshBreakdown(currentDate);
      setActiveTab("home");

      const tabsContainer = $("#tabs");
      const logoutTab = $("#btn-logout");
      const existingAdminTab = $(".tab[data-tab='admin']");
      if (existingAdminTab) existingAdminTab.remove();

      if (me.user.is_admin && tabsContainer && logoutTab) {
        const adminTab = document.createElement("button");
        adminTab.className = "tab flex flex-col items-center text-sm";
        adminTab.dataset.tab = "admin";
        adminTab.innerHTML = `<i class="fa-solid fa-cash-register"></i><span>Admin</span>`;
        tabsContainer.insertBefore(adminTab, logoutTab);
        adminTab.addEventListener("click", () => setActiveTab("admin"));
      }

      initBreakdownFAB();

    } else {
      $("#screen-login").classList.remove("hidden");
      $("#screen-app").classList.add("hidden");
    }
  } catch {
    $("#screen-login").classList.remove("hidden");
    $("#screen-app").classList.add("hidden");
  }
}

// ---------------------
// DOM Content Loaded
// ---------------------
document.addEventListener("DOMContentLoaded", async () => {

  // Tabs
  document.querySelectorAll(".tabbar .tab[data-tab]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const tab = btn.dataset.tab;
      setActiveTab(tab);
      if (tab === "overzicht") await refreshToday();
      if (tab === "breakdown") await refreshBreakdown(currentDate);
    });
  });

  // Login
  $("#login-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#login-error")?.classList.add("hidden");
    const form = e.currentTarget;
    try {
      await api("login",{ email: form.email.value.trim(), password: form.password.value });
      form.reset();
      await checkSession();
    } catch(err) {
      $("#login-error").textContent = err.message || "Inloggen mislukt";
      $("#login-error").classList.remove("hidden");
    }
  });

  // Logout
  $("#btn-logout")?.addEventListener("click", async () => {
    await api("logout");
    $("#screen-app").classList.add("hidden");
    $("#screen-login").classList.remove("hidden");
    $(".tab[data-tab='admin']")?.remove();
    preview.src = ""; preview.classList.add("hidden"); imageUrlInput.value = "";
  });

  // Sale form
  $("#sale-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const payload = {
      description: form.description.value.trim(),
      price: parseMoney(form.price.value),
      owner_user_id: parseInt(form.owner_user_id.value,10),
      cost: form.cost.value ? parseMoney(form.cost.value) : null,
      image_url: imageUrlInput.value || null
    };
    if (!payload.description || payload.price == null || isNaN(payload.owner_user_id)) {
      alert("Controleer je invoer."); return;
    }
    try {
      await api("add_sale", payload);
      form.reset(); preview.src=""; preview.classList.add("hidden"); imageUrlInput.value="";
      if (currentUserId) form.owner_user_id.value = currentUserId;
      await refreshToday(); await refreshBreakdown(currentDate); setActiveTab("overzicht");
    } catch(err){ alert(err.message||"Fout bij opslaan."); }
  });

  // Filter toggle
  $("#filter-mine")?.addEventListener("change", refreshToday);

  // Settlement button
  document.addEventListener("click", async e => {
    if (!e.target.closest("#btn-settle")) return;
    if (!confirm("Alle verkopen verrekenen?")) return;
    try {
      const res = await api("process_settlement");
      const resultDiv = $("#settlement-result");
      resultDiv.innerHTML = "<h3 class='font-semibold mb-2'>Verrekende bedragen:</h3>";
      if (res.settlements) {
        for (const key in res.settlements) {
          const [from,to] = key.split("_");
          const amount = res.settlements[key].amount;
          resultDiv.innerHTML += `<div>${from} → ${to}: €${amount.toFixed(2)}</div>`;
        }
      }
    } catch(err){ alert(err.message||"Fout bij verrekenen"); }
  });

  await checkSession();
});
