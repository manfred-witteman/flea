// ======================
// Flea Market SPA (Inkoop) – Refactored
// ======================
const $ = (sel) => document.querySelector(sel);

// ---------------------
// Paths & globals
// ---------------------
const ROOT_PATH = window.location.pathname.split("/").filter(Boolean)[0];
const UPLOADS_BASE = "/flea_uploads/";
const API_BASE = `/${ROOT_PATH}/api/api.php`;

let currentUserId = null;
let uploadedImageUrl = null;
let submitBtn;
let paymentInput, paymentIcon, paymentText;
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
};

// ---------------------
// Formatters
// ---------------------
const formatEuro = (val) => val != null ? new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number(val)) : "";
const parseMoney = (val) => {
  if (!val) return null;
  const num = parseFloat(val.replace(/\s+/g, "").replace(",", "."));
  return isNaN(num) ? null : num;
};

// ---------------------
// UI helpers
// ---------------------
const setActiveTab = (name) => {
  document.querySelectorAll("section[id^='view-']").forEach(s => s.classList.add("hidden"));
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  $(`#view-${name}`)?.classList.remove("hidden");
  document.querySelector(`.tab[data-tab='${name}']`)?.classList.add("active");
};

const setButtonLoading = (loading, text = "Opslaan") => {
  if (!submitBtn) return;
  if (loading) {
    submitBtn.disabled = true;
    submitBtn.classList.add("btn-loader", "opacity-80", "cursor-not-allowed");
    submitBtn.innerHTML = `<span class="spinner"></span><span class="btn-text">${text}</span>`;
  } else {
    submitBtn.disabled = false;
    submitBtn.classList.remove("btn-loader", "opacity-80", "cursor-not-allowed");
    submitBtn.textContent = text;
  }
};

// ---------------------
// Payment toggle
// ---------------------
const updatePaymentLabel = () => {
  if (!paymentInput) return;
  if (paymentInput.checked) {
    paymentIcon.className = "fa-solid fa-credit-card";
    paymentText.textContent = "Pin";
  } else {
    paymentIcon.className = "fa-solid fa-money-bill";
    paymentText.textContent = "Contant";
  }
};


// ---------------------
// Purchases rendering (foto links, + knop indien geen foto)
// ---------------------
const renderPurchases = (purchases, containerId) => {
  const list = document.getElementById(containerId);
  const empty = list.nextElementSibling;
  list.innerHTML = "";

  if (!purchases || purchases.length === 0) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  purchases.forEach((p) => {
    const li = document.createElement("li");
    li.className = "flex items-center gap-3 py-2";

    // Thumbnail of + knop (links)
    const thumbSlot = document.createElement("div");
    thumbSlot.className = "w-12 h-12 flex-shrink-0";
    
    if (p.image_url) {
      const thumb = document.createElement("img");
      thumb.src = p.image_url.startsWith("http") ? p.image_url : UPLOADS_BASE + p.image_url.replace(/^\/+/, "");
      thumb.className = "w-12 h-12 object-cover rounded-xl border border-slate-200 cursor-pointer";
      thumbSlot.appendChild(thumb);
    } else {
      // Geen foto → + knop
      const addBtn = document.createElement("div");
      addBtn.className = "w-12 h-12 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 cursor-pointer hover:bg-slate-100";
      addBtn.innerHTML = `<i class="fa-solid fa-plus text-lg"></i>`;
      addBtn.addEventListener("click", async () => {
        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = "image/*";
        fileInput.click();

        fileInput.onchange = async (e) => {
          const file = e.target.files[0];
          if (!file) return;

          // 🔄 spinner tonen in plaats van plus-icoon
          addBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-lg text-slate-500"></i>`;
          addBtn.classList.add("opacity-70", "cursor-wait");

          try {
            const formData = new FormData();
            formData.append("image", file);
            formData.append("action", "upload_image");

            const res = await fetch(API_BASE, { method: "POST", body: formData });
            const data = await res.json();

            if (data.success && data.filename) {
              const filename = data.filename;

              // 📤 update in database
              await api("update_purchase", { id: p.id, image_url: filename });

              // 💾 thumbnail plaatsen
              p.image_url = `${UPLOADS_BASE}${filename}`;
              thumbSlot.innerHTML = "";
              const newThumb = document.createElement("img");
              newThumb.src = p.image_url;
              newThumb.className = "w-12 h-12 object-cover rounded-xl border border-slate-200 cursor-pointer";
              thumbSlot.appendChild(newThumb);
            } else {
              alert("Upload fout: " + (data.error || "Onbekend"));
              // herstel plus-icoon
              addBtn.innerHTML = `<i class="fa-solid fa-plus text-lg"></i>`;
            }
          } catch (err) {
            console.error("Upload fout:", err);
            alert("Fout bij upload of opslaan.");
            addBtn.innerHTML = `<i class="fa-solid fa-plus text-lg"></i>`;
          } finally {
            addBtn.classList.remove("opacity-70", "cursor-wait");
          }
        };
      });


      thumbSlot.appendChild(addBtn);
    }
    li.appendChild(thumbSlot);

    // Tekstblok (rechts)
    const textBlock = document.createElement("div");
    textBlock.className = "flex flex-col flex-1";
    const desc = document.createElement("div");
    desc.className = "font-medium";
    desc.textContent = p.description;
    const sub = document.createElement("div");
    sub.className = "text-sm text-slate-500";
    sub.textContent = `${formatEuro(p.cost)}${p.purchased_at ? " • " + new Date(p.purchased_at).toLocaleDateString("nl-NL") : ""}`;
    textBlock.appendChild(desc);
    textBlock.appendChild(sub);

    li.appendChild(textBlock);

    // QR knop (indien nog niet gekoppeld)
    if (!p.qr_id) {
      const btn = document.createElement("button");
      btn.className = "ml-2 bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700 flex-shrink-0";
      btn.textContent = "QR koppelen";
      btn.addEventListener("click", () => attachQrToPurchase(p.id));
      li.appendChild(btn);
    }

    list.appendChild(li);
  });
};


// ---------------------
// QR handling
// ---------------------
const attachQrToPurchase = async (id) => {
  try {
    const { startQrScanIOS } = await import("./qr/qrScanner.js");
    const qrValue = await startQrScanIOS();
    if (!qrValue) return;
    await api("attach_qr", { id, qr_id: qrValue });
    //alert("QR-code gekoppeld!");
    refreshPurchases();
  } catch (err) {
    if (err.message !== "Scan geannuleerd") alert("Fout bij koppelen QR: " + (err.message || err));
  }
};

// ---------------------
// Refresh purchases
// ---------------------
const refreshPurchases = async () => {
  try {
    const data = await api("list_purchases");
    const filtered = filterToggle?.checked
      ? data.purchases.filter(p => !p.qr_id)
      : data.purchases;
    renderPurchases(filtered, "today-list");
  } catch (err) {
    console.error("Refresh purchases failed:", err);
  }
};

// ---------------------
// Image upload
// ---------------------
const setupImageUpload = () => {
  const input = document.getElementById("image-upload");
  const preview = document.getElementById("image-preview");
  const hiddenInput = document.querySelector("input[name='image_url']");

  input?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setButtonLoading(true, "Uploaden…");

    const reader = new FileReader();
    reader.onload = (ev) => {
      preview.src = ev.target.result;
      preview.classList.remove("hidden");
    };
    reader.readAsDataURL(file);

    const formData = new FormData();
    formData.append("image", file);
    formData.append("action", "upload_image");

    try {
      const res = await fetch(API_BASE, { method: "POST", body: formData, credentials: "include" });
      const data = await res.json();
      if (data.success && data.filename) {
        uploadedImageUrl = `${UPLOADS_BASE}${data.filename}`;
        hiddenInput.value = uploadedImageUrl;
      } else {
        uploadedImageUrl = null;
        hiddenInput.value = "";
        alert("Upload fout: " + (data.error || "Onbekend"));
      }
    } catch {
      uploadedImageUrl = null;
      hiddenInput.value = "";
      alert("Fout bij upload.");
    } finally {
      setButtonLoading(false);
    }
  });
};

// ---------------------
// Session
// ---------------------
const checkSession = async () => {
  try {
    const me = await api("me");
    if (me?.user) {
      currentUserId = me.user.id;
      $("#screen-login").classList.add("hidden");
      $("#screen-app").classList.remove("hidden");
      $("#owner_user_id").value = currentUserId;
      await refreshPurchases();
      setActiveTab("home");
    } else {
      $("#screen-login").classList.remove("hidden");
      $("#screen-app").classList.add("hidden");
    }
  } catch {
    $("#screen-login").classList.remove("hidden");
    $("#screen-app").classList.add("hidden");
  }
};

// ---------------------
// Init DOM
// ---------------------
document.addEventListener("DOMContentLoaded", async () => {
  paymentInput = $("#payment-method");
  paymentIcon = $("#payment-icon");
  paymentText = $("#payment-text");
  submitBtn = $("#purchase-form button[type='submit']");
  filterToggle = $("#filter-qr");

  paymentInput?.addEventListener("change", updatePaymentLabel);
  filterToggle?.addEventListener("change", refreshPurchases);

  setupImageUpload();

  $(".tabbar")?.querySelectorAll(".tab[data-tab]")?.forEach(btn => {
    btn.addEventListener("click", () => {
      setActiveTab(btn.dataset.tab);
      if (btn.dataset.tab === "overzicht") refreshPurchases();
    });
  });

  $("#login-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#login-error")?.classList.add("hidden");
    try {
      await api("login", {
        email: e.target.email.value.trim(),
        password: e.target.password.value
      });
      e.target.reset();
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
    $("#image-preview").src = "";
    $("#image-preview").classList.add("hidden");
    $("input[name='image_url']").value = "";
  });

  $("#purchase-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
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

    if (!payload.description || payload.cost == null) return alert("Controleer je invoer.");

    try {
      setButtonLoading(true, "Opslaan…");
      await api("add_purchase", payload);
      form.reset();
      updatePaymentLabel();
      $("#image-preview").src = "";
      $("#image-preview").classList.add("hidden");
      uploadedImageUrl = null;
      $("input[name='image_url']").value = "";
      refreshPurchases();
    } catch (err) {
      alert(err.message || "Fout bij opslaan.");
    } finally {
      setButtonLoading(false);
    }
  });

  await checkSession();
});
