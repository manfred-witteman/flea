// ======================
// Minimal Front-End SPA (Home + Overzicht)
// ======================
const $ = (sel) => document.querySelector(sel);

// ---------------------
// Dynamic base paths
// ---------------------
const ROOT_PATH = window.location.pathname.split("/").filter(Boolean)[0];
const UPLOADS_BASE = "/flea_uploads/";
const API_BASE = "/" + ROOT_PATH + "/api/api.php";
let paymentInput, paymentIcon, paymentText;
let uploadedImageUrl = null;

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
  const labelEl = $("#overview-label");
  if (!labelEl) return;

  if (dateStr === todayStr) {
    labelEl.textContent = "Vandaag verkocht";
  } else {
    const opts = { weekday: "short", day: "numeric", month: "short" };
    labelEl.textContent = d.toLocaleDateString("nl-NL", opts);
  }
}

// ---------------------
// Sales rendering
// ---------------------
function renderTodaySales(data, showAll, currentUserId) {
  const list = $("#today-list");
  const empty = $("#today-empty");
  list.innerHTML = "";

  const colors = ["bg-indigo-500", "bg-emerald-500", "bg-rose-500", "bg-amber-500"];
  const colorForUser = (userId) => colors[userId % colors.length];

  const filteredSales = showAll ? data.sales : data.sales.filter((s) => s.cashier_user_id == currentUserId);

  if (!filteredSales.length) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  filteredSales.forEach((sale) => {
    const li = document.createElement("li");
    li.className = "flex items-center gap-3 py-2";

    // Avatar
    const avatar = document.createElement("div");
    avatar.className = `flex items-center justify-center w-10 h-10 rounded-full text-white font-bold ${colorForUser(sale.cashier_user_id)}`;
    avatar.textContent = sale.cashier_name.charAt(0).toUpperCase();

    // Text
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

    // Spacer
    const spacer = document.createElement("div");
    spacer.className = "flex-1";
    li.appendChild(spacer);

    // Payment icon
    const paymentBlock = document.createElement("div");
    paymentBlock.className = "flex items-center gap-2";
    if (sale.is_pin === 1) {
      const paymentIconEl = document.createElement("i");
      paymentIconEl.className = "fa-solid fa-credit-card text-green-600";
      paymentBlock.appendChild(paymentIconEl);
    }
    if (paymentBlock.children.length > 0) li.appendChild(paymentBlock);

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
const imageInput = document.getElementById("image-upload");
const preview = document.getElementById("image-preview");
const imageUrlInput = document.querySelector("input[name='image_url']");
const submitBtn = document.querySelector("#purchase-form button[type='submit']");

imageInput?.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  setButtonLoading(true, "Uploaden…");

  // Preview
  const reader = new FileReader();
  reader.onload = (e) => {
    preview.src = e.target.result;
    preview.classList.remove("hidden");
  };
  reader.readAsDataURL(file);

  // Upload
  const formData = new FormData();
  formData.append("image", file);
  formData.append("action", "upload_image");

  try {
    const res = await fetch(API_BASE, { method: "POST", body: formData });
    const data = await res.json();

    if (data.success && data.filename) {
      uploadedImageUrl = `/uploads/${data.filename}`;
      imageUrlInput.value = uploadedImageUrl;
    } else {
      uploadedImageUrl = null;
      imageUrlInput.value = "";
      alert("Upload fout: " + (data.error || "Onbekend"));
    }
  } catch (err) {
    uploadedImageUrl = null;
    imageUrlInput.value = "";
    alert("Er is een fout opgetreden bij het uploaden.");
  } finally {
    setButtonLoading(false);
  }
});

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
      await refreshToday();
      setActiveTab("home");
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
  paymentInput = document.getElementById("payment-method");
  paymentIcon = document.getElementById("payment-icon");
  paymentText = document.getElementById("payment-text");

  const overviewLabel = $("#overview-label");
  const prevDayBtn = $("#prev-day");
  const nextDayBtn = $("#next-day");

  overviewLabel?.addEventListener("click", async () => {
    overviewDate = new Date();
    await refreshToday();
  });

  prevDayBtn?.addEventListener("click", async () => {
    overviewDate.setDate(overviewDate.getDate() - 1);
    await refreshToday();
  });

  nextDayBtn?.addEventListener("click", async () => {
    overviewDate.setDate(overviewDate.getDate() + 1);
    await refreshToday();
  });

  paymentInput?.addEventListener("change", updatePaymentLabel);

  // Tab switching: alleen home + overzicht
  $(".tabbar")?.querySelectorAll(".tab[data-tab]")?.forEach((btn) => {
    btn.addEventListener("click", async () => {
      setActiveTab(btn.dataset.tab);
      if (btn.dataset.tab === "overzicht") await refreshToday();
    });
  });

  // Login form
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

  // Logout
  $("#btn-logout")?.addEventListener("click", async () => {
    await api("logout");
    $("#screen-app").classList.add("hidden");
    $("#screen-login").classList.remove("hidden");
    preview.src = "";
    preview.classList.add("hidden");
    imageUrlInput.value = "";
  });

  // Purchase form
  $("#purchase-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;

    const payload = {
      description: form.description.value.trim(),
      price: parseMoney(form.price.value),
      owner_user_id: parseInt(form.owner_user_id.value, 10),
      image_url: uploadedImageUrl || null,
      is_pin: form.payment_method.checked ? 1 : 0
    };
    if (!payload.description || payload.price == null || isNaN(payload.owner_user_id)) {
      alert("Controleer je invoer.");
      return;
    }

    try {
      setButtonLoading(true, "Opslaan…");
      await api("add_sale", payload);
      form.reset();
      updatePaymentLabel();
      preview.src = "";
      preview.classList.add("hidden");
      uploadedImageUrl = null;
      imageUrlInput.value = "";
      if (currentUserId) form.owner_user_id.value = currentUserId;

      await refreshToday();
      setActiveTab("overzicht");
    } catch (err) {
      alert(err.message || "Fout bij opslaan.");
    } finally {
      setButtonLoading(false);
    }
  });

  $("#filter-mine")?.addEventListener("change", refreshToday);

  await checkSession();
});

// ---------------------
// Payment label update
// ---------------------
function updatePaymentLabel() {
  if (!paymentInput) return;
  if (paymentInput.checked) {
    paymentIcon.className = "fa-solid fa-credit-card";
    paymentText.textContent = "Pin";
  } else {
    paymentIcon.className = "fa-solid fa-money-bill";
    paymentText.textContent = "Contant";
  }
}

// ---------------------
// Date helpers
// ---------------------
function formatDateUTC(date) {
  return date.toISOString().slice(0, 10);
}

function setButtonLoading(isLoading, text = "Opslaan") {
  if (!submitBtn) return;

  if (isLoading) {
    submitBtn.disabled = true;
    submitBtn.classList.add("btn-loader", "opacity-80", "cursor-not-allowed");
    submitBtn.innerHTML = `<span class="spinner"></span><span class="btn-text">${text}</span>`;
  } else {
    submitBtn.disabled = false;
    submitBtn.classList.remove("btn-loader", "opacity-80", "cursor-not-allowed");
    submitBtn.textContent = text;
  }
}
