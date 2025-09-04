// Minimal front-end SPA
const $ = (sel) => document.querySelector(sel);

const api = async (action, payload = {}, method = "POST") => {
  const opts = { method, headers: {} };
  if (method === "POST") {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify({ action, ...payload });
  }
  const res = await fetch("/flea/api/api.php", opts); // let op /flea/
  if (!res.ok) throw new Error("Serverfout");
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
};

function formatEuro(value) {
  if (value == null) return "";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number(value));
}

function setActiveTab(name) {
  document.querySelectorAll("section[id^='view-']").forEach(s => s.classList.add("hidden"));
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  $(`#view-${name}`)?.classList.remove("hidden");
  document.querySelector(`.tab[data-tab='${name}']`)?.classList.add("active");
}

// ---------------------
// TODAY SALES
// ---------------------
function renderTodaySales(data, showAll, currentUserId) {
  const list = $("#today-list");
  const empty = $("#today-empty");
  list.innerHTML = "";

  const colors = [
    "bg-indigo-500", "bg-emerald-500", "bg-rose-500",
    "bg-amber-500", "bg-sky-500", "bg-purple-500",
    "bg-fuchsia-500", "bg-teal-500"
  ];

  function colorForUser(userId) {
    return colors[userId % colors.length];
  }

  const filteredSales = showAll
    ? data.sales
    : data.sales.filter((s) => s.cashier_user_id == currentUserId);

  if (!filteredSales.length) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  // Modal setup (once, outside the loop)
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

    modal.addEventListener("click", (e) => {
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
    const initial = sale.cashier_name.charAt(0).toUpperCase();
    const avatar = document.createElement("div");
    avatar.className = `flex items-center justify-center w-10 h-10 rounded-full text-white font-bold ${colorForUser(
      sale.cashier_user_id
    )}`;
    avatar.textContent = initial;

    // Text block
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

    // Alleen een rightBlock als er thumbnail of delete is
    if ((sale.image_url && sale.image_url.trim() !== "") || sale.cashier_user_id === currentUserId) {
      const rightBlock = document.createElement("div");
      rightBlock.className = "grid grid-cols-[auto,20px] items-center gap-2";

     // Thumbnail (optioneel)
      if (sale.image_url && sale.image_url.trim() !== "") {
        const thumb = document.createElement("img");
        const imagePath = sale.image_url.trim();
        const fullPath = imagePath.startsWith("/flea") ? imagePath : "/flea" + imagePath;

        thumb.className = "w-12 h-12 object-cover rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer transition-opacity duration-300";
        thumb.src = "/flea/api/uploads/placeholder.png"; // transparant placeholder
        thumb.style.opacity = 0.5; // optioneel iets zichtbaar zodat ruimte duidelijk is

        // async load
        const imgLoader = new Image();
        imgLoader.src = fullPath;
        imgLoader.onload = () => {
          thumb.src = fullPath;
          thumb.style.opacity = 1; // fade-in effect
        };

        thumb.addEventListener("click", () => {
          modalImg.src = thumb.src;
          modal.classList.remove("hidden");
          requestAnimationFrame(() => {
            modal.style.opacity = 1;
          });
        });

        rightBlock.appendChild(thumb);
      }

      // Delete button óf placeholder
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
        rightBlock.appendChild(btn);
      } else {
        const placeholder = document.createElement("div");
        placeholder.className = "w-5"; // zelfde breedte als prullenbak
        rightBlock.appendChild(placeholder);
      }

      li.appendChild(rightBlock);
    }

    list.appendChild(li);
  });
}





// ---------------------
// GLOBAL STATE
// ---------------------
let currentUserId = null;
let currentDate = new Date();

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function setDayLabel(d) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const dateStr = d.toISOString().slice(0, 10);
  const opts = { weekday: 'long', day: 'numeric', month: 'long' };
  let label = d.toLocaleDateString('nl-NL', opts);
  if (dateStr === todayStr) label += " (vandaag)";
  $("#day-label").textContent = label;
}

// ---------------------
// REFRESH FUNCTIONS
// ---------------------
async function refreshBreakdown(day) {
  setDayLabel(day);
  const dateStr = day.toISOString().slice(0, 10);
  const data = await api("breakdown", { date: dateStr });
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

async function refreshToday() {
  const data = await api("list_sales", { date: new Date().toISOString().slice(0, 10) });
  const showAll = $("#filter-mine")?.checked ?? false;
  renderTodaySales(data, showAll, currentUserId);
}

// ---------------------
// OWNER SELECT
// ---------------------
async function populateOwnerSelect(defaultUserId) {
  const select = $("#owner-select");
  if (!select) return;

  const dataUsers = await api("list_users");
  select.innerHTML = '';
  dataUsers.users.forEach(u => {
    const option = document.createElement('option');
    option.value = u.id.toString();
    option.textContent = u.name;
    select.appendChild(option);
  });

  if (defaultUserId) select.value = defaultUserId.toString();
}

// ---------------------
// IMAGE HANDLING
// ---------------------
const imageInput = document.getElementById('image-upload');
const preview = document.getElementById('image-preview');
const imageUrlInput = document.querySelector('input[name="image_url"]');

imageInput.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  // Preview
  const reader = new FileReader();
  reader.onload = e => {
    preview.src = e.target.result;
    preview.classList.remove('hidden');
  };
  reader.readAsDataURL(file);

  // Upload naar API
  const formData = new FormData();
  formData.append('image', file);
  formData.append('action', 'upload_image');

  try {
    const res = await fetch('/flea/api/api.php', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.success) {
      imageUrlInput.value = data.url;
      console.log('Upload gelukt:', data.url);
    } else {
      alert('Upload fout: ' + (data.error || 'Onbekend'));
    }
  } catch (err) {
    console.error('Upload error', err);
  }
});

// ---------------------
// SESSION CHECK
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

      // Admin tab
      const tabsContainer = document.getElementById("tabs");
      const logoutTab = document.getElementById("btn-logout");
      const existingAdminTab = document.querySelector(".tab[data-tab='admin']");
      if (existingAdminTab) existingAdminTab.remove();

      if (me.user.is_admin && tabsContainer && logoutTab) {
        const adminTab = document.createElement("button");
        adminTab.className = "tab flex flex-col items-center text-sm";
        adminTab.dataset.tab = "admin";
        adminTab.innerHTML = `<i class="fa-solid fa-cash-register"></i><span>Admin</span>`;
        tabsContainer.insertBefore(adminTab, logoutTab);
        adminTab.addEventListener("click", () => setActiveTab("admin"));
      }
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
// DOM CONTENT LOADED
// ---------------------
document.addEventListener("DOMContentLoaded", async () => {
  // Tabs
  document.querySelectorAll(".tabbar .tab[data-tab]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const tab = btn.getAttribute("data-tab");
      setActiveTab(tab);
      if (tab === "overzicht") await refreshToday();
      if (tab === "breakdown") await refreshBreakdown(currentDate);
    });
  });

  // Login
  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#login-error").classList.add("hidden");
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
  $("#btn-logout").addEventListener("click", async () => {
    await api("logout");
    $("#screen-app").classList.add("hidden");
    $("#screen-login").classList.remove("hidden");
    const adminTab = document.querySelector(".tab[data-tab='admin']");
    if (adminTab) adminTab.remove();

    // Reset preview en hidden input
    preview.src = "";
    preview.classList.add("hidden");
    imageUrlInput.value = "";
  });

  // Sale form
  $("#sale-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const payload = {
      description: form.description.value.trim(),
      price: parseMoney(form.price.value),
      owner_user_id: parseInt(form.owner_user_id.value, 10),
      cost: form.cost.value ? parseMoney(form.cost.value) : null,
      image_url: imageUrlInput.value || null
    };
    if (!payload.description || payload.price == null || isNaN(payload.owner_user_id)) {
      alert("Controleer je invoer.");
      return;
    }
    try {
      await api("add_sale", payload);
      form.reset();

      // Reset preview en hidden input
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


// Breakdown FAB toggle + menu
const fabBtn = $("#breakdown-date-btn");
const fabMenu = $("#breakdown-fab-menu");
const dateInput = $("#breakdown-date-picker");

// Toggle menu
fabBtn?.addEventListener("click", () => {
  fabMenu.classList.toggle("hidden");

  // Reset date input naar huidige datum
  dateInput.value = currentDate.toISOString().slice(0, 10);
});

// Week / Maand buttons
fabMenu?.querySelectorAll("button[data-range]").forEach(btn => {
  btn.addEventListener("click", async () => {
    const range = btn.dataset.range;
    fabMenu.classList.add("hidden");

    if (range === "week") {
      await refreshBreakdown(currentDate, "week");
    } else if (range === "month") {
      await refreshBreakdown(currentDate, "month");
    }
  });
});

// Dag handled via input change
dateInput.addEventListener("change", async () => {
  const value = dateInput.value;
  if (!value) return;
  const d = new Date(value);
  if (!isNaN(d)) {
    currentDate = d;
    await refreshBreakdown(currentDate, "day");
  }
  fabMenu.classList.add("hidden"); // sluit menu pas na datum gekozen
});

// Optioneel: reset value naar huidige datum bij openen menu
fabBtn?.addEventListener("click", () => {
  dateInput.value = currentDate.toISOString().slice(0,10);
});


  // Filter toggle
  $("#filter-mine")?.addEventListener("change", refreshToday);

  await checkSession();
});

// ---------------------
// VERREKEN KNOP
// ---------------------
document.addEventListener("click", async (e) => {
  if (e.target.closest("#btn-settle")) {
    if (!confirm("Alle verkopen verrekenen?")) return;
    try {
      const res = await api("process_settlement");
      const resultDiv = $("#settlement-result");
      resultDiv.innerHTML = "<h3 class='font-semibold mb-2'>Verrekende bedragen:</h3>";
      if (res.settlements) {
        for (const key in res.settlements) {
          const [from, to] = key.split("_");
          const amount = res.settlements[key].amount;
          resultDiv.innerHTML += `<div>${from} → ${to}: €${amount.toFixed(2)}</div>`;
        }
      }
    } catch (err) {
      alert(err.message || "Fout bij verrekenen");
    }
  }
});


// ---------------------
// HELPERS
// ---------------------
function parseMoney(value) {
  if (!value) return null;
  // verwijder spaties en vervang komma door punt
  value = value.replace(/\s+/g, '').replace(',', '.');
  let number = parseFloat(value);
  return isNaN(number) ? null : number;
}