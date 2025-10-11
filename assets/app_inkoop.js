// ======================
// Minimal Front-End SPA (Inkoop)
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
let overviewDate = new Date();
let submitBtn;
let currentUserId = null;

// ---------------------
// API helper
// ---------------------
const api = async (action, payload = {}, method = "POST") => {
  const opts = { method, headers: {} };
  if (method === "POST") {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify({ action, ...payload });
  }
  try {
    const res = await fetch(API_BASE, { ...opts, credentials: "include" });
    if (!res.ok) throw new Error("Serverfout");
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      if (data.error) throw new Error(data.error);
      return data;
    } catch {
      console.error("Invalid JSON response:", text);
      throw new Error("Ongeldige server response");
    }
  } catch (err) {
    throw err;
  }
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
    labelEl.textContent = "Vandaag ingekocht";
  } else {
    const opts = { weekday: "short", day: "numeric", month: "short" };
    labelEl.textContent = d.toLocaleDateString("nl-NL", opts);
  }
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
// Purchase rendering
// ---------------------
function renderPurchases(data) {
  const list = $("#today-list");
  const empty = $("#today-empty");
  list.innerHTML = "";

  if (!data.purchases || data.purchases.length === 0) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  data.purchases.forEach((p) => {
    const li = document.createElement("li");
    li.className = "flex items-center gap-3 py-2";

    const textBlock = document.createElement("div");
    textBlock.className = "flex flex-col";
    const desc = document.createElement("div");
    desc.className = "font-medium";
    desc.textContent = p.description;
    const sub = document.createElement("div");
    sub.className = "text-sm text-slate-500";
    let subText = `Inkoop: ${formatEuro(p.cost)}`;
    if (p.target_price) subText += ` • Streefprijs: ${formatEuro(p.target_price)}`;
    if (p.purchase_remarks) subText += ` • Opmerkingen: ${p.purchase_remarks}`;
    sub.textContent = subText;

    textBlock.appendChild(desc);
    textBlock.appendChild(sub);
    li.appendChild(textBlock);

    if (p.image_url) {
      const img = document.createElement("img");
      // Altijd gebruik UPLOADS_BASE
      img.src = p.image_url.startsWith("/")
        ? p.image_url
        : `${UPLOADS_BASE}${p.image_url}`;
      img.className = "w-16 h-16 object-cover rounded-lg";
      li.appendChild(img);
    }

    list.appendChild(li);
  });
}

// ---------------------
// Refresh purchases
// ---------------------
async function refreshPurchases() {
  try {
    const data = await api("list_purchases", { date: formatDateUTC(overviewDate) });
    console.log("refreshPurchases data:", data);  // debug
    setDayLabel(overviewDate);
    renderPurchases(data);
  } catch (err) {
    console.error("Refresh purchases failed:", err);
  }
}

// ---------------------
// Image handling
// ---------------------
const imageInput = document.getElementById("image-upload");
const preview = document.getElementById("image-preview");
const imageUrlInput = document.querySelector("input[name='image_url']");

imageInput?.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  setButtonLoading(true, "Uploaden…");

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
    const res = await fetch(API_BASE, { method: "POST", body: formData, credentials: "include" });
    const text = await res.text();
    const data = JSON.parse(text);
    if (data.success && data.filename) {
      uploadedImageUrl = `${UPLOADS_BASE}${data.filename}`;
      imageUrlInput.value = uploadedImageUrl;
    } else {
      uploadedImageUrl = null;
      imageUrlInput.value = "";
      alert("Upload fout: " + (data.error || "Onbekend"));
    }
  } catch {
    uploadedImageUrl = null;
    imageUrlInput.value = "";
    alert("Fout bij upload.");
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
    console.log("Session check:", me);
    if (me?.user) {
      currentUserId = me.user.id;  // <-- hier
      $("#screen-login").classList.add("hidden");
      $("#screen-app").classList.remove("hidden");

      // Zet hidden field voor owner_user_id
      const ownerInput = document.getElementById("owner_user_id");
      if (ownerInput) ownerInput.value = currentUserId;

      await refreshPurchases();
      setActiveTab("home");
    } else {
      $("#screen-login").classList.remove("hidden");
      $("#screen-app").classList.add("hidden");
    }
  } catch (err) {
    console.error("checkSession error:", err);
    $("#screen-login").classList.remove("hidden");
    $("#screen-app").classList.add("hidden");
  }
}

// ---------------------
// Date helpers
// ---------------------
function formatDateUTC(date) {
  return date.toISOString().slice(0, 10);
}

// ---------------------
// DOMContentLoaded
// ---------------------
document.addEventListener("DOMContentLoaded", async () => {
  paymentInput = document.getElementById("payment-method");
  paymentIcon = document.getElementById("payment-icon");
  paymentText = document.getElementById("payment-text");
  submitBtn = document.querySelector("#purchase-form button[type='submit']");

  const overviewLabel = $("#overview-label");
  const prevDayBtn = $("#prev-day");
  const nextDayBtn = $("#next-day");

  overviewLabel?.addEventListener("click", async () => {
    overviewDate = new Date();
    await refreshPurchases();
  });
  prevDayBtn?.addEventListener("click", async () => {
    overviewDate.setDate(overviewDate.getDate() - 1);
    await refreshPurchases();
  });
  nextDayBtn?.addEventListener("click", async () => {
    overviewDate.setDate(overviewDate.getDate() + 1);
    await refreshPurchases();
  });

  paymentInput?.addEventListener("change", updatePaymentLabel);

  $(".tabbar")?.querySelectorAll(".tab[data-tab]")?.forEach((btn) => {
    btn.addEventListener("click", async () => {
      setActiveTab(btn.dataset.tab);
      if (btn.dataset.tab === "overzicht") await refreshPurchases();
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
    preview.src = "";
    preview.classList.add("hidden");
    imageUrlInput.value = "";
  });

  $("#purchase-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const payload = {
      description: form.description.value.trim(),
      cost: parseMoney(form.price.value) || 0,   // nooit null
      owner_user_id: parseInt(form.owner_user_id.value, 10) || currentUserId,
      purchase_is_pin: form.payment_method.checked ? 1 : 0,
      purchase_remarks: form.purchase_remarks.value.trim() || null,
      target_price: parseMoney(form.target_price.value) || null,
      qr_id: null,
      image_url: uploadedImageUrl || null,
      purchased_at: new Date().toISOString().slice(0, 19).replace("T", " ")
    };
    if (!payload.description || payload.cost == null) {
      alert("Controleer je invoer.");
      return;
    }
    try {
      setButtonLoading(true, "Opslaan…");
      await api("add_purchase", payload);
      form.reset();
      updatePaymentLabel();
      preview.src = "";
      preview.classList.add("hidden");
      uploadedImageUrl = null;
      imageUrlInput.value = "";
      await refreshPurchases();
    } catch (err) {
      alert(err.message || "Fout bij opslaan.");
    } finally {
      setButtonLoading(false);
    }
  });

  await checkSession();
});
