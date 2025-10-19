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
let filterToggle = null;

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
function renderPurchases(purchases) {
  const list = $("#today-list");
  const empty = $("#today-empty");
  list.innerHTML = "";

  if (!purchases || purchases.length === 0) {
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");

  purchases.forEach((p) => {
    const li = document.createElement("li");
    li.className = "flex items-center gap-3 py-2";

    // … bestaande beschrijving/subinfo code …

    // QR-handmatig koppelen knop
    if (!p.qr_id) {
      const qrBtn = document.createElement("button");
      qrBtn.className = "ml-auto text-sm bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-lg shrink-0";
      qrBtn.textContent = "QR koppelen";
      qrBtn.addEventListener("click", () => attachQrToPurchase(p.id));
      li.appendChild(qrBtn);
    }

    list.appendChild(li);
  });
}

// ---------------------
// QR koppelen 
// ---------------------
async function attachQrToPurchase(purchaseId) {
  try {
    // Dynamisch importeren zodat het alleen wordt geladen bij gebruik
    const { startQrScanIOS } = await import("./qr/qrScanner.js");

    // Start overlay-scanner
    const qrValue = await startQrScanIOS();

    if (!qrValue) return;

    // Verstuur naar de API
    await api("attach_qr", { id: purchaseId, qr_id: qrValue });
    alert("QR-code gekoppeld!");
    await refreshPurchases();
  } catch (err) {
    if (err.message !== "Scan geannuleerd") {
      console.error("Fout bij koppelen QR (debug):", err);
      alert("Fout bij koppelen QR: " + (err?.message || JSON.stringify(err)));
    }
    console.warn("QR-scan afgebroken of mislukt:", err);
  }
}
// ---------------------
// Refresh purchases
// ---------------------
async function refreshPurchases() {
  try {
    const data = await api("list_purchases");

    const filteredPurchases = filterToggle?.checked
      ? data.purchases.filter(p => !p.qr_id)
      : data.purchases;

    renderPurchases(filteredPurchases);
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
    if (me?.user) {
      currentUserId = me.user.id;
      $("#screen-login").classList.add("hidden");
      $("#screen-app").classList.remove("hidden");

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
  filterToggle = document.getElementById("filter-qr");

  filterToggle?.addEventListener("change", refreshPurchases);
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
      cost: parseMoney(form.price.value) || 0,
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
