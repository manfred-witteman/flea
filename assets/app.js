// ======================
// Minimal Front-End SPA (location independent)
// ======================
const $ = (sel) => document.querySelector(sel);

// ---------------------
// Dynamic base paths
// ---------------------
const BASE_PATH = window.location.pathname.replace(/\/[^/]*$/, "");
const API_BASE = BASE_PATH + "/api/api.php";
const UPLOADS_BASE = BASE_PATH + "/api/uploads/";

// ---------------------
// API helper
// ---------------------
const api = async (action, payload = {}, method = "POST") => {
  const opts = { method, headers: {} };
  if (method === "POST") {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify({ action, ...payload });
  }
  const res = await fetch(API_BASE, opts);
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
  value = value.replace(/\s+/g, "").replace(",", ".");
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}




// ---------------------
// Global state
// ---------------------
let currentUserId = null;
let currentDate = new Date();
let overviewDate = new Date(); 

// ---------------------
// UI helpers
// ---------------------
function setActiveTab(name) {
  document.querySelectorAll("section[id^='view-']").forEach((s) => s.classList.add("hidden"));
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  $(`#view-${name}`)?.classList.remove("hidden");
  document.querySelector(`.tab[data-tab='${name}']`)?.classList.add("active");
}

function setDayLabel(d) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const dateStr = d.toISOString().slice(0, 10);

  const opts = { weekday: "long", day: "numeric", month: "long" };
  let formattedDate = d.toLocaleDateString("nl-NL", opts);

  const labelEl = $("#overview-label");
  if (!labelEl) return;

  if (dateStr === todayStr) {
    labelEl.textContent = "Vandaag verkocht";
  } else {
    labelEl.textContent = `Verkoop van ${formattedDate}`;
  }
}


// ---------------------
// Sales rendering (met swipe gallery)
// ---------------------
function renderTodaySales(data, showAll, currentUserId) {
  const list = $("#today-list");
  const empty = $("#today-empty");
  list.innerHTML = "";

  const colors = ["bg-indigo-500","bg-emerald-500","bg-rose-500","bg-amber-500","bg-sky-500","bg-purple-500","bg-fuchsia-500","bg-teal-500"];
  const colorForUser = (userId) => colors[userId % colors.length];

  const filteredSales = showAll ? data.sales : data.sales.filter((s) => s.cashier_user_id == currentUserId);

  if (!filteredSales.length) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  // ---------------------
  // Modal setup
  // ---------------------
  let modal = document.getElementById("sale-modal");
  let modalImg = document.getElementById("sale-modal-img");
  let prevBtn, nextBtn;

  if (!modal) {
    modal = document.createElement("div");
    modal.id = "sale-modal";
    modal.className = "fixed inset-0 bg-black bg-opacity-70 hidden flex items-start justify-center z-50";
    modal.style.transition = "opacity 0.2s ease";
    modal.style.opacity = 0;

    const modalContent = document.createElement("div");
    modalContent.className = "relative max-h-[85vh] overflow-auto p-4 mt-12 flex justify-center";

    // Sluitknop
    const closeBtn = document.createElement("button");
    closeBtn.innerHTML = `<i class="fa-solid fa-xmark"></i>`;
    closeBtn.className = "absolute top-2 right-2 bg-white text-slate-700 rounded-full shadow-md w-8 h-8 flex items-center justify-center hover:bg-slate-100 z-50";
    closeBtn.addEventListener("click", () => {
      modal.style.opacity = 0;
      setTimeout(() => modal.classList.add("hidden"), 200);
    });

    // Afbeelding
    modalImg = document.createElement("img");
    modalImg.id = "sale-modal-img";
    modalImg.className = "max-w-full max-h-[80vh] rounded-lg shadow-lg";

    // Navigatieknoppen
    prevBtn = document.createElement("button");
    prevBtn.innerHTML = `<i class="fa-solid fa-chevron-left"></i>`;
    prevBtn.className = "absolute left-4 top-1/2 -translate-y-1/2 bg-white bg-opacity-70 text-slate-700 rounded-full w-10 h-10 flex items-center justify-center shadow-md hover:bg-slate-100";

    nextBtn = document.createElement("button");
    nextBtn.innerHTML = `<i class="fa-solid fa-chevron-right"></i>`;
    nextBtn.className = "absolute right-4 top-1/2 -translate-y-1/2 bg-white bg-opacity-70 text-slate-700 rounded-full w-10 h-10 flex items-center justify-center shadow-md hover:bg-slate-100";

    modalContent.appendChild(modalImg);
    modal.appendChild(modalContent);
    modal.appendChild(closeBtn);
    modal.appendChild(prevBtn);
    modal.appendChild(nextBtn);
    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.style.opacity = 0;
        setTimeout(() => modal.classList.add("hidden"), 200);
      }
    });
  } else {
    prevBtn = modal.querySelector("button:nth-of-type(2)");
    nextBtn = modal.querySelector("button:nth-of-type(3)");
  }

  // ---------------------
  // Dagafbeeldingen verzamelen
  // ---------------------
  let dayImages = [];
  filteredSales.forEach((sale) => {
    if (sale.image_url && sale.image_url.trim() !== "") {
      const imagePath = sale.image_url.trim();
      const fullPath = imagePath.startsWith("http")
        ? imagePath
        : UPLOADS_BASE + imagePath.replace(/^\/+/, "");
      dayImages.push(fullPath);
    }
  });

  let currentImageIndex = 0;
  function showImageAtIndex(index) {
    if (dayImages.length === 0) return;
    currentImageIndex = (index + dayImages.length) % dayImages.length;
    modalImg.src = dayImages[currentImageIndex];
  }

  // ---------------------
  // Swipe support
  // ---------------------
  let startX = 0;
  modal.addEventListener("touchstart", (e) => {
    startX = e.touches[0].clientX;
  });
  modal.addEventListener("touchend", (e) => {
    const diffX = e.changedTouches[0].clientX - startX;
    if (Math.abs(diffX) > 50) {
      if (diffX > 0) {
        showImageAtIndex(currentImageIndex - 1);
      } else {
        showImageAtIndex(currentImageIndex + 1);
      }
    }
  });

  prevBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    showImageAtIndex(currentImageIndex - 1);
  });
  nextBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    showImageAtIndex(currentImageIndex + 1);
  });

  // ---------------------
  // Lijst renderen
  // ---------------------
  filteredSales.forEach((sale) => {
    const li = document.createElement("li");
    li.className = "flex items-center gap-3 py-2";

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

    const rightBlock = document.createElement("div");
    rightBlock.className = "grid grid-cols-[48px,20px] items-center gap-2";

    const thumbSlot = document.createElement("div");
    thumbSlot.className = "w-12 h-12";

    const hasImage = sale.image_url && sale.image_url.trim() !== "";
    if (hasImage) {
      const thumb = document.createElement("img");
      const imagePath = sale.image_url.trim();
      const fullPath = imagePath.startsWith("http") ? imagePath : UPLOADS_BASE + imagePath.replace(/^\/+/, "");
      thumb.className = "w-12 h-12 object-cover rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer transition-opacity duration-300";
      thumb.src = UPLOADS_BASE + "placeholder.png";
      thumb.style.opacity = 0.5;

      const imgLoader = new Image();
      imgLoader.src = fullPath;
      imgLoader.onload = () => {
        thumb.src = fullPath;
        thumb.style.opacity = 1;
      };

      thumb.addEventListener("click", () => {
        currentImageIndex = dayImages.indexOf(fullPath);
        showImageAtIndex(currentImageIndex);
        modal.classList.remove("hidden");
        requestAnimationFrame(() => (modal.style.opacity = 1));
      });

      thumbSlot.appendChild(thumb);
    } else {
      const thumbPh = document.createElement("div");
      thumbPh.className = "w-12 h-12 rounded-xl border border-transparent invisible";
      thumbSlot.appendChild(thumbPh);
    }

    rightBlock.appendChild(thumbSlot);

    const trashSlot = document.createElement("div");
    if (sale.cashier_user_id === currentUserId) {
      const btn = document.createElement("button");
      btn.className = "text-rose-600 hover:text-rose-700";
      btn.title = "Verwijderen";
      btn.dataset.id = sale.id;
      btn.innerHTML = `<i class="fa-solid fa-trash"></i>`;
      btn.addEventListener("click", async () => {
        if (!confirm("Verkoop verwijderen?")) return;
        await api("delete_sale", { id: sale.id, image_url: sale.image_url });
        await refreshToday();
        await refreshBreakdown(currentDate);
      });
      trashSlot.appendChild(btn);
    } else {
      const trashPh = document.createElement("i");
      trashPh.className = "fa-solid fa-trash opacity-0";
      trashSlot.appendChild(trashPh);
    }

    rightBlock.appendChild(trashSlot);
    li.appendChild(rightBlock);
    list.appendChild(li);
  });
}


// ---------------------
// Refresh functions
// ---------------------
async function refreshToday() {
  const data = await api("list_sales", { date: formatDateUTC(overviewDate) });
  setDayLabel(overviewDate);
  const showAll = $("#filter-mine")?.checked ?? false;
  renderTodaySales(data, showAll, currentUserId);
}

async function refreshBreakdown(date, type) {
  const payloadDate = type === 'day' 
    ? formatDateUTC(date)
    : type === 'week' 
      ? formatDateUTC(getStartOfISOWeekUTC(date))
      : `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}-01`;

  const response = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'breakdown', date: payloadDate, range: type })
  });

  const data = await response.json();

  

  // update lijst
  const list = document.getElementById('breakdown-list');
  list.innerHTML = '';
  data.rows.forEach(row => {
    const li = document.createElement('li');
    li.className = 'py-2 flex justify-between';
    li.innerHTML = `<span>${row.owner_name}</span><span>€${row.revenue.toFixed(2)}</span>`;
    list.appendChild(li);
  });

  document.getElementById('breakdown-total').textContent = `€${data.total.toFixed(2)}`;


  // Update overviewDate naar eerste dag van de selectie
if (type === 'day') {
  overviewDate = new Date(date);
} else if (type === 'week') {
  overviewDate = getStartOfISOWeekUTC(date);
} else if (type === 'month') {
  overviewDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

// Optioneel: refresh Overzicht automatisch
await refreshToday();
  updateBreakdownHeader(type, date);
}


// ---------------------
// Owner select
// ---------------------
async function populateOwnerSelect(defaultUserId) {
  const select = $("#owner-select");
  if (!select) return;
  const dataUsers = await api("list_users");
  select.innerHTML = "";
  dataUsers.users.forEach((u) => {
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
const imageUrlInput = $("input[name='image_url']");

imageInput?.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    preview.src = e.target.result;
    preview.classList.remove("hidden");
  };
  reader.readAsDataURL(file);

  const formData = new FormData();
  formData.append("image", file);
  formData.append("action", "upload_image");

  try {
    const res = await fetch(API_BASE, { method: "POST", body: formData });
    const data = await res.json();
    if (data.success) imageUrlInput.value = data.url;
    else alert("Upload fout: " + (data.error || "Onbekend"));
  } catch (err) {
    console.error("Upload error", err);
  }
});

// ---------------------
// Breakdown FAB Init
// ---------------------
function initBreakdownFAB() {
  const fabBtn = document.getElementById("breakdown-date-btn");
  const fabMenu = document.getElementById("breakdown-fab-menu");
  const dateInput = document.getElementById("breakdown-date-picker");
  const weekInput = document.getElementById("breakdown-week-picker");
  const monthInput = document.getElementById("breakdown-month-picker");
  

  let currentDate = new Date();

  fabBtn.addEventListener("click", () => {
    fabMenu.classList.toggle("hidden");
    dateInput.value = currentDate.toISOString().slice(0, 10);
    weekInput.value = getISOWeekString(currentDate); // corrigeert week input
    monthInput.value = currentDate.toISOString().slice(0, 7);
  });

  dateInput.addEventListener("change", async () => {
    if (!dateInput.value) return;
    currentDate = new Date(dateInput.value);
    await refreshBreakdown(currentDate, "day");
    fabMenu.classList.add("hidden");
  });

  weekInput.addEventListener("change", async () => {
  if (!weekInput.value) return;
  currentDate = getDateOfISOWeekUTC(weekInput.value);
  await refreshBreakdown(currentDate, "week");
  fabMenu.classList.add("hidden");
});

  monthInput.addEventListener("change", async () => {
  if (!monthInput.value) return;
  const [year, month] = monthInput.value.split("-").map(Number);
  currentDate = new Date(Date.UTC(year, month-1, 1)); // altijd 1e dag UTC
  await refreshBreakdown(currentDate, "month");
  fabMenu.classList.add("hidden");
});

  // Labels trigger hidden inputs
  fabMenu.querySelector("label[for='breakdown-date-picker']").addEventListener("click", () => dateInput.click());
  fabMenu.querySelector("label[for='breakdown-week-picker']").addEventListener("click", () => weekInput.click());
  fabMenu.querySelector("label[for='breakdown-month-picker']").addEventListener("click", () => monthInput.click());
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
      await refreshBreakdown(currentDate, "day");
      setActiveTab("home");

      const tabsContainer = $("#tabs");
      const logoutTab = $("#btn-logout");
      $(".tab[data-tab='admin']")?.remove();

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

  const paymentInput = document.getElementById("payment-method");
  const paymentIcon = document.getElementById("payment-icon");
  const paymentText = document.getElementById("payment-text");

  paymentInput?.addEventListener("change", () => {
    if (paymentInput.checked) {
      paymentIcon.className = "fa-solid fa-credit-card";
      paymentText.textContent = "Pin";
    } else {
      paymentIcon.className = "fa-solid fa-money-bill";
      paymentText.textContent = "Contant";
    }
  });


  $(".tabbar")?.querySelectorAll(".tab[data-tab]")?.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const tab = btn.dataset.tab;
      setActiveTab(tab);
      if (tab === "overzicht") await refreshToday();
      if (tab === "breakdown") await refreshBreakdown(currentDate, "day");
    });
  });

  $("#login-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#login-error")?.classList.add("hidden");
    const form = e.currentTarget;
    try {
      await api("login", { email: form.email.value.trim(), password: form.password.value });
      form.reset();
      await checkSession();
    } catch (err) {
      $("#login-error").textContent = err.message || "Inloggen mislukt";
      $("#login-error").classList.remove("hidden");
    }
  });

  $("#btn-logout")?.addEventListener("click", async () => {
    await api("logout");
    $("#screen-app").classList.add("hidden");
    $("#screen-login").classList.remove("hidden");
    $(".tab[data-tab='admin']")?.remove();
    preview.src = "";
    preview.classList.add("hidden");
    imageUrlInput.value = "";
  });

  $("#sale-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const payload = {
      description: form.description.value.trim(),
      price: parseMoney(form.price.value),
      owner_user_id: parseInt(form.owner_user_id.value, 10),
      cost: form.cost.value ? parseMoney(form.cost.value) : null,
      image_url: imageUrlInput.value || null,
      is_pin: form.payment_method.checked ? 1 : 0 
    };


    if (!payload.description || payload.price == null || isNaN(payload.owner_user_id)) {
      alert("Controleer je invoer.");
      return;
    }
    try {
      await api("add_sale", payload);
      form.reset();
      preview.src = "";
      preview.classList.add("hidden");
      imageUrlInput.value = "";
      if (currentUserId) form.owner_user_id.value = currentUserId;
      await refreshToday();
      await refreshBreakdown(currentDate);
      setActiveTab("overzicht");
    } catch (err) {
      alert(err.message || "Fout bij opslaan.");
    }
  });

  $("#filter-mine")?.addEventListener("change", refreshToday);

  document.addEventListener("click", async (e) => {
    if (!e.target.closest("#btn-settle")) return;
    if (!confirm("Alle verkopen verrekenen?")) return;
    try {
      const res = await api("process_settlement");
      const resultDiv = $("#settlement-result");
      resultDiv.innerHTML = "<h3 class='font-semibold mb-2'>Verrekende bedragen:</h3>";
      if (res.settlements) {
        for (const key in res.settlements) {
          const [from, to] = key.split("_");
          const amount = res.settlements[key].amount;
          const p = document.createElement("p");
          p.textContent = `${from} → ${to}: ${formatEuro(amount)}`;
          resultDiv.appendChild(p);
        }
      }
    } catch (err) {
      alert(err.message || "Fout bij afrekenen");
    }
  });

  await checkSession();
});



// ----------------------
// Update header
// ----------------------
function updateBreakdownHeader(type, date) {
  const label = document.getElementById('day-label');
  if (!label) return;

  if (type === 'day') {
    label.textContent = date.toLocaleDateString('nl-NL', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
  } else if (type === 'week') {
    const start = getStartOfISOWeekUTC(date);
    const end = getEndOfISOWeekUTC(date);
    const weekNumber = getISOWeekNumberUTC(date);
    label.textContent = `Week ${weekNumber} (${start.toLocaleDateString('nl-NL')} t/m ${end.toLocaleDateString('nl-NL')})`;
  } else if (type === 'month') {
    label.textContent = date.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });
  }
}


// ----------------------
// Datum helpers
// ----------------------
// Dag string in YYYY-MM-DD
function formatDateUTC(date) {
  return date.toISOString().slice(0,10); // altijd in UTC
}

// Begin van de ISO-week (maandag)
function getStartOfISOWeekUTC(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  return d;
}

// Eind van ISO-week (zondag)
function getEndOfISOWeekUTC(date) {
  const start = getStartOfISOWeekUTC(date);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return end;
}

// ISO-week nummer
function getISOWeekNumberUTC(date) {
  const tempDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  tempDate.setUTCDate(tempDate.getUTCDate() + 4 - (tempDate.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tempDate.getUTCFullYear(), 0, 1));
  return Math.ceil((((tempDate - yearStart) / 86400000) + 1) / 7);
}

// ISO week string: YYYY-Www
function getISOWeekStringUTC(date) {
  const weekNo = getISOWeekNumberUTC(date);
  return `${date.getUTCFullYear()}-W${weekNo.toString().padStart(2,"0")}`;
}

// Date van ISO week string: YYYY-Www → maandag van die week
function getDateOfISOWeekUTC(weekStr) {
  const [year, week] = weekStr.split("-W").map(Number);
  const simple = new Date(Date.UTC(year,0,1 + (week-1)*7));
  const dow = simple.getUTCDay();
  const monday = new Date(simple);
  if (dow <= 4) monday.setUTCDate(simple.getUTCDate() - dow + 1);
  else monday.setUTCDate(simple.getUTCDate() + 8 - dow);
  return monday;
}