// ---------------------
// Dynamisch base path
// ---------------------
const BASE_PATH = window.location.pathname.replace(/\/[^/]*$/, "");
const API_BASE = BASE_PATH.replace(/\/admin$/, '') + '/api/api.php';
const UPLOADS_BASE = BASE_PATH.replace(/\/admin$/, '') + '/env/uploads/';

// ---------------------
// Helper API
// ---------------------
async function api(action, payload = {}, method = 'POST') {
  const opts = { method };
  if (method === 'POST') {
    if (payload instanceof FormData) opts.body = payload;
    else {
      opts.body = JSON.stringify({ action, ...payload });
      opts.headers = { 'Content-Type': 'application/json' };
    }
  }
  const res = await fetch(API_BASE, opts);
  return res.json();
}

// ---------------------
// Toast notificaties
// ---------------------
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const colors = { success: 'bg-green-500', error: 'bg-red-500' };
  const toast = document.createElement('div');
  toast.className = `text-white px-4 py-2 rounded shadow ${colors[type]} animate-slide-in`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('opacity-0', 'transition', 'duration-500');
    setTimeout(() => toast.remove(), 500);
  }, 3000);
}

// ---------------------
// Gebruikers laden
// ---------------------
async function loadUsers() {
  const data = await api('list_users');
  const tbody = document.getElementById('users-tbody');
  tbody.innerHTML = '';

  for (const u of data.users) {
    const qrSrc = u.qr_url ? UPLOADS_BASE + u.qr_url : UPLOADS_BASE + 'placeholder.png';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="px-4 py-2 font-medium">${u.name}</td>
      <td class="px-4 py-2">
        <input type="text" value="${u.iban || ''}" data-userid="${u.id}" 
               class="iban-input w-full border rounded px-2 py-1 focus:ring focus:ring-blue-300">
      </td>
      <td class="px-4 py-2 flex justify-between items-center">
        <div class="flex items-center space-x-2">
          <img src="${qrSrc}" class="qr-preview w-16 h-16 object-contain rounded border">
          <input type="file" data-userid="${u.id}" class="qr-upload text-sm">
        </div>
        <div>
          <button class="user-save-btn hidden p-2 rounded hover:bg-green-600 text-white" data-userid="${u.id}" title="Opslaan">💾</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

// ---------------------
// Owner mappings laden
// ---------------------
async function loadOwnerMapping() {
  const tbody = document.getElementById('config-tbody');
  const tfoot = document.getElementById('mapping-tfoot');
  const ownerSelect = document.getElementById('new-owner');
  const qrUserSelect = document.getElementById('new-qr-user');

  // 1️⃣ Huidige mappings ophalen
  const data = await api('list_mappings');
  tbody.innerHTML = '';

  const mappedOwnerIds = new Set();

  // Bestaande mappings in de tabel plaatsen
  data.mappings.forEach(m => {
    mappedOwnerIds.add(m.owner_id);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="px-4 py-2 font-medium">${m.owner_name}</td>
      <td class="px-4 py-2 flex justify-between items-center">
        <span>${m.qr_user_name || '-'}</span>
        <button class="delete-mapping-btn text-red-500 hover:text-red-700" data-ownerid="${m.owner_id}" title="Verwijderen">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5-4h4m-4 0a1 1 0 00-1 1v1h6V4a1 1 0 00-1-1m-4 0h4" />
          </svg>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // 2️⃣ Alle users ophalen
  const allUsers = await api('list_users');
  if (!allUsers.users) return;

  // 3️⃣ Filter owners die nog geen mapping hebben
  const availableOwners = allUsers.users.filter(u => !mappedOwnerIds.has(u.id));

  if (availableOwners.length === 0) {
    // Geen beschikbare owners, verberg toevoeg-regel
    tfoot.style.display = 'none';
  } else {
    // Toon toevoeg-regel
    tfoot.style.display = '';

    // Owner dropdown vullen
    ownerSelect.innerHTML = '<option value="">-- Kies owner --</option>';
    availableOwners.forEach(u => ownerSelect.innerHTML += `<option value="${u.id}">${u.name}</option>`);

    // QR-user dropdown vullen (alleen users met qr_url)
    const qrUsers = allUsers.users.filter(u => u.qr_url);
    qrUserSelect.innerHTML = '<option value="">-- Kies gebruiker --</option>';
    qrUsers.forEach(u => qrUserSelect.innerHTML += `<option value="${u.id}">${u.name}</option>`);
  }
}


// ---------------------
// Tab logica
// ---------------------
function switchTab(tabName) {
  document.querySelectorAll('.tab-content').forEach(tc => tc.classList.add('hidden'));
  document.getElementById(`tab-${tabName}`).classList.remove('hidden');

  document.querySelectorAll('.tab-btn').forEach(b => {
    if (b.dataset.tab === tabName) {
      b.classList.replace('bg-gray-300', 'bg-blue-500');
      b.classList.replace('text-black', 'text-white');
    } else {
      b.classList.replace('bg-blue-500', 'bg-gray-300');
      b.classList.replace('text-white', 'text-black');
    }
  });

  adjustTabHeight();
}

// ---------------------
// Tab hoogte aanpassen
// ---------------------
function adjustTabHeight() {
  const container = document.getElementById('tabs-container');
  let maxHeight = 0;
  document.querySelectorAll('.tab-content').forEach(tc => {
    tc.style.display = 'block';
    maxHeight = Math.max(maxHeight, tc.offsetHeight);
    tc.style.display = tc.classList.contains('hidden') ? 'none' : 'block';
  });
  container.style.minHeight = maxHeight + 'px';
}

// ---------------------
// Dashboard tonen
// ---------------------
async function showDashboard() {
  document.getElementById('login-page').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');

  switchTab('users'); // standaard actieve tab
  await loadUsers();
  await loadOwnerMapping();
}

// ---------------------
// Event listeners
// ---------------------
document.addEventListener('DOMContentLoaded', async () => {
  // Check sessie
  const me = await api('me');
  if (me.user) await showDashboard();
  else document.getElementById('login-page').classList.remove('hidden');

  // Login
  document.getElementById('login-btn').addEventListener('click', async () => {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const res = await api('login', { email, password });
    if (res.ok) await showDashboard();
    else showToast(res.error || 'Login mislukt', 'error');
  });

  // Logout
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await api('logout');
    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('login-page').classList.remove('hidden');
  });

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

  // Body click events (opslaan / mapping toevoegen / verwijderen)
  document.body.addEventListener('click', async e => {
    const saveBtn = e.target.closest('.user-save-btn');
    const addBtn = e.target.closest('#add-mapping-btn');
    const delBtn = e.target.closest('.delete-mapping-btn');

    // Gebruiker opslaan
    if (saveBtn) {
      const tr = saveBtn.closest('tr');
      const userId = parseInt(saveBtn.dataset.userid);
      const iban = tr.querySelector('input.iban-input').value;
      const fileInput = tr.querySelector('input.qr-upload');
      const qr_url = fileInput.dataset.qrurl || tr.querySelector('img.qr-preview').src.split('/').pop();

      const res = await api('update_user', { id: userId, iban, qr_url });
      showToast(res.success ? 'Gebruiker opgeslagen!' : (res.error || 'Onbekend'), res.success ? 'success' : 'error');
      await loadUsers();
    }

    // Mapping toevoegen
    if (addBtn) {
      const ownerId = parseInt(document.getElementById('new-owner').value);
      const qrUserId = parseInt(document.getElementById('new-qr-user').value);
      if (!ownerId || !qrUserId) return showToast('Selecteer beide velden!', 'error');

      const res = await api('update_mapping', { owner_user_id: ownerId, qr_user_id: qrUserId });
      showToast(res.success ? 'Mapping toegevoegd!' : (res.error || 'Onbekend'), res.success ? 'success' : 'error');
      await loadOwnerMapping();
    }

    // Mapping verwijderen
    if (delBtn) {
      const ownerId = parseInt(delBtn.dataset.ownerid);
      if (!confirm('Weet je zeker dat je deze mapping wilt verwijderen?')) return;

      const res = await api('delete_mapping', { owner_user_id: ownerId });
      showToast(res.success ? 'Mapping verwijderd!' : (res.error || 'Onbekend'), res.success ? 'success' : 'error');
      await loadOwnerMapping();
    }
  });

  // Input / file events voor user-save knop
  document.body.addEventListener('input', e => {
    if (e.target.classList.contains('iban-input')) e.target.closest('tr').querySelector('.user-save-btn').classList.remove('hidden');
  });
  document.body.addEventListener('change', e => {
    if (e.target.classList.contains('qr-upload')) e.target.closest('tr').querySelector('.user-save-btn').classList.remove('hidden');
  });

  // QR upload
  document.body.addEventListener('change', async e => {
    if (!e.target.classList.contains('qr-upload')) return;
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('action', 'upload_image');
    formData.append('image', file);

    const res = await api('upload_image', formData);
    if (res.success) {
      const img = e.target.previousElementSibling;
      img.src = res.url;
      e.target.dataset.qrurl = res.url;
      showToast('QR geüpload!', 'success');
    } else showToast(res.error, 'error');
  });
});
