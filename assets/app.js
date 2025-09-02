// Minimal front-end SPA
const $ = (sel) => document.querySelector(sel);

const api = async (action, payload = {}, method = "POST") => {
  const opts = { method, headers: {} };
  if (method === "POST") {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify({ action, ...payload });
  }
  const res = await fetch("api/api.php", opts);
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
  $(`#view-${name}`).classList.remove("hidden");
  document.querySelector(`.tab[data-tab='${name}']`)?.classList.add("active");
}

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

  filteredSales.forEach(sale => {
    const li = document.createElement("li");
    li.className = "flex items-center gap-3 py-2";

    const initial = sale.cashier_name.charAt(0).toUpperCase();
    const avatar = document.createElement("div");
    avatar.className = `flex items-center justify-center w-10 h-10 rounded-full text-white font-bold ${colorForUser(
      sale.cashier_user_id
    )}`;
    avatar.textContent = initial;

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

    if (sale.cashier_user_id === currentUserId) {
      const btn = document.createElement("button");
      btn.className = "text-rose-600 hover:text-rose-700 ml-auto";
      btn.title = "Verwijderen";
      btn.dataset.id = sale.id;
      btn.innerHTML = `<i class="fa-solid fa-trash"></i>`;
      btn.addEventListener("click", async () => {
        if (!confirm("Verkoop verwijderen?")) return;
        await api("delete_sale", { id: sale.id });
        await refreshToday();
        await refreshBreakdown(currentDate);
      });
      li.appendChild(btn);
    }

    list.appendChild(li);
  });
}

// Global state
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

// JS
async function checkSession() {
  try {
    const me = await api("me");

    if (me?.user) {
      currentUserId = me.user.id;

      // Toon app, verberg login
      $("#screen-login").classList.add("hidden");
      $("#screen-app").classList.remove("hidden");

      // Owner select vullen
      await populateOwnerSelect(currentUserId);

      // Datum en data refresh
      currentDate = new Date();
      await refreshToday();
      await refreshBreakdown(currentDate);
      setActiveTab("home");

      // --------------------------
      // Admin-tab management
      // --------------------------
      const tabsContainer = document.getElementById("tabs");
      const logoutTab = document.getElementById("btn-logout");

      // Verwijder bestaande admin-tab als die er is
      const existingAdminTab = document.querySelector(".tab[data-tab='admin']");
      if (existingAdminTab) existingAdminTab.remove();

      // Voeg admin-tab toe alleen als user admin is
      if (me.user.is_admin && tabsContainer && logoutTab) {
        const adminTab = document.createElement("button");
        adminTab.className = "tab flex flex-col items-center text-sm";
        adminTab.dataset.tab = "admin";

        // Icoon en label
        adminTab.innerHTML = `<i class="fa-solid fa-cash-register"></i><span>Admin</span>`;

        // Plaats links van logout
        tabsContainer.insertBefore(adminTab, logoutTab);

        // Tab switch listener
        adminTab.addEventListener("click", () => setActiveTab("admin"));
      }

    } else {
      // Geen user, toon login
      $("#screen-login").classList.remove("hidden");
      $("#screen-app").classList.add("hidden");
    }
  } catch (e) {
    // Fout bij API call, toon login
    $("#screen-login").classList.remove("hidden");
    $("#screen-app").classList.add("hidden");
  }
}


document.addEventListener("DOMContentLoaded", async () => {
  $("#filter-mine")?.addEventListener("change", refreshToday);
  await checkSession();
});


async function refreshToday() {
  const data = await api("list_sales", { date: new Date().toISOString().slice(0, 10) });
  const showAll = $("#filter-mine")?.checked ?? false;
  renderTodaySales(data, showAll, currentUserId);
}

// Globale delegatie voor de verreken knop
document.addEventListener("click", async (e) => {
  if (e.target.closest("#btn-settle")) {
    console.log("🔔 Verreken knop aangeklikt");
    if (!confirm("Alle verkopen verrekenen?")) return;

    try {
      const res = await api("process_settlement");
      console.log("🔔 Response van server:", res);

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
      console.error("❌ Fout bij verrekenen:", err);
      alert(err.message || "Fout bij verrekenen");
    }
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  // Tab navigation
  document.querySelectorAll(".tabbar .tab[data-tab]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const tab = btn.getAttribute("data-tab");
      setActiveTab(tab);
      if (tab === "overzicht") await refreshToday();
      if (tab === "breakdown") await refreshBreakdown(currentDate);
    });
  });

  // Login form
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

  // Verberg app en toon login
  $("#screen-app").classList.add("hidden");
  $("#screen-login").classList.remove("hidden");

  // Verwijder admin-tab als die bestaat
  const adminTab = document.querySelector(".tab[data-tab='admin']");
  if (adminTab) adminTab.remove();
});
  // Create sale
  $("#sale-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const payload = {
      description: form.description.value.trim(),
      price: parseFloat(form.price.value),
      owner_user_id: parseInt(form.owner_user_id.value, 10),
      cost: form.cost.value ? parseFloat(form.cost.value) : null
    };
    if (!payload.description || isNaN(payload.price) || isNaN(payload.owner_user_id)) {
      alert("Controleer je invoer.");
      return;
    }
    try {
      await api("add_sale", payload);
      form.reset();
      if (currentUserId) form.owner_user_id.value = currentUserId;

      await refreshToday();
      await refreshBreakdown(currentDate);
      setActiveTab("overzicht");
    } catch (err) {
      alert(err.message || "Fout bij opslaan.");
    }
  });

  // Breakdown day nav
  $("#day-prev").addEventListener("click", async () => {
    currentDate = addDays(currentDate, -1);
    await refreshBreakdown(currentDate);
  });
  $("#day-next").addEventListener("click", async () => {
    const today = new Date();
    if (currentDate.toDateString() !== today.toDateString()) {
      currentDate = addDays(currentDate, 1);
      await refreshBreakdown(currentDate);
    }
  });

  // Filter toggle
  $("#filter-mine")?.addEventListener("change", refreshToday);

  await checkSession();
});
