// ---------------------
// Dynamisch base path
// ---------------------
const BASE_PATH = window.location.pathname.replace(/\/[^/]*$/, "");
const API_BASE = BASE_PATH.replace(/\/admin$/, '') + '/api/api.php';
const UPLOADS_BASE = BASE_PATH.replace(/\/admin$/, '') + '/env/uploads/';

let allUsersResp = null; // Globale users response

// ---------------------
// Helper API met logging
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

  console.log('[API REQUEST]', action, payload);
  const res = await fetch(API_BASE, opts);
  const data = await res.json();
  console.log('[API RESPONSE]', action, data);
  return data;
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
// Gebruikers laden (uit versie 1)
// ---------------------
async function loadUsers() {
  const data = await api('list_users');
  const tbody = document.getElementById('users-tbody');
  tbody.innerHTML = '';

  for (const u of data.users) {
    const qrSrc = u.qr_url || UPLOADS_BASE + 'placeholder.png';
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
// Owner mappings laden (uit versie 2)
// ---------------------
async function loadOwnerMapping() {
  const tbody = document.getElementById('config-tbody');
  const tfoot = document.getElementById('mapping-tfoot');
  const ownerSelect = document.getElementById('new-owner');
  const qrUserSelect = document.getElementById('new-qr-user');

  const mappingData = await api('list_mappings');
  tbody.innerHTML = '';
  const mappedOwnerIds = new Set();

  // Alle users ophalen en globaal bewaren
  allUsersResp = await api('list_users');
  if (!allUsersResp.users) return;

  // Bestaande mappings renderen
  mappingData.mappings.forEach(m => {
    mappedOwnerIds.add(m.owner_id);
    appendMappingRow(m, allUsersResp.users, true); // bestaande mappings = label
  });

  // Nieuwe mapping opties
  const availableOwners = allUsersResp.users.filter(u => !mappedOwnerIds.has(u.id));
  if (!availableOwners.length) {
    tfoot.style.display = 'none';
  } else {
    tfoot.style.display = '';
    ownerSelect.innerHTML = '<option value="">-- Kies owner --</option>';
    availableOwners.forEach(u => ownerSelect.innerHTML += `<option value="${u.id}">${u.name}</option>`);

    qrUserSelect.innerHTML = '<option value="">-- Scan van papier --</option>';
    allUsersResp.users.filter(u => u.qr_url).forEach(u => qrUserSelect.innerHTML += `<option value="${u.id}">${u.name}</option>`);
  }
}

// ---------------------
// Append mapping row helper
// ---------------------
function appendMappingRow(mapping, users, isExisting = true) {
  const tbody = document.getElementById('config-tbody');
  const tr = document.createElement('tr');

  // QR-label of -- Scan van papier --
  const qrLabel = mapping.qr_user_id
    ? users.find(u => u.id === mapping.qr_user_id)?.name || '-- Scan van papier --'
    : '-- Scan van papier --';

  tr.innerHTML = `
    <td class="px-4 py-2 font-medium">${mapping.owner_name}</td>
    <td class="px-4 py-2 flex justify-between items-center">
      ${isExisting 
        ? `<span class="qr-label">${qrLabel}</span>` 
        : `<select class="mapping-qr-user" data-ownerid="${mapping.owner_id}">
            <option value="">-- Scan van papier --</option>
          </select>`
      }
      <button class="delete-mapping-btn text-red-500 hover:text-red-700" data-ownerid="${mapping.owner_id}" title="Verwijderen">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5-4h4m-4 0a1 1 0 00-1 1v1h6V4a1 1 0 00-1-1m-4 0h4" />
        </svg>
      </button>
    </td>
  `;
  tbody.appendChild(tr);

  if (!isExisting) {
    const qrSelect = tr.querySelector('.mapping-qr-user');
    users.filter(u => u.qr_url).forEach(u => {
      const option = document.createElement('option');
      option.value = u.id;
      option.textContent = u.name;
      if (mapping.qr_user_id === u.id) option.selected = true;
      qrSelect.appendChild(option);
    });
  }
}

// ---------------------
// Tabs
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
  switchTab('users');
  await loadUsers();
  await loadOwnerMapping();
}

// ---------------------
// DOMContentLoaded events
// ---------------------
document.addEventListener('DOMContentLoaded', async () => {
  const me = await api('me');
  if (me.user) await showDashboard();
  else document.getElementById('login-page').classList.remove('hidden');

  // Login / Logout
  document.getElementById('login-btn').addEventListener('click', async () => {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const res = await api('login', { email, password });
    if (res.ok) await showDashboard();
    else showToast(res.error || 'Login mislukt', 'error');
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await api('logout');
    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('login-page').classList.remove('hidden');
  });

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

  // Body click events
  document.body.addEventListener('click', async e => {
    // Save user (versie 1)
    const saveBtn = e.target.closest('.user-save-btn');
    if (saveBtn) {
      const tr = saveBtn.closest('tr');
      const userId = parseInt(saveBtn.dataset.userid);
      const iban = tr.querySelector('.iban-input').value;
      const fileInput = tr.querySelector('input.qr-upload');
      const qr_url = fileInput.dataset.qrurl || tr.querySelector('img.qr-preview').src.split('/').pop();

      const res = await api('update_user', { id: userId, iban, qr_url });
      showToast(res.success ? 'Gebruiker opgeslagen!' : (res.error || 'Onbekend'), res.success ? 'success' : 'error');
      await loadUsers();
    }

    // Add mapping (versie 2)
    const addBtn = e.target.closest('#add-mapping-btn');
    if (addBtn) {
      const ownerSelect = document.getElementById('new-owner');
      const qrUserSelect = document.getElementById('new-qr-user');

      const owner_user_id = ownerSelect.value ? parseInt(ownerSelect.value) : null;
      if (!owner_user_id) return showToast('Selecteer een owner!', 'error');

      const qr_user_id = qrUserSelect.value ? parseInt(qrUserSelect.value) : null;

      try {
        const res = await api('update_mapping', { owner_user_id, qr_user_id });
        if (res.success) {
          showToast('Mapping toegevoegd!', 'success');
          const newMapping = { owner_id: owner_user_id, qr_user_id, owner_name: ownerSelect.selectedOptions[0].text };
          appendMappingRow(newMapping, allUsersResp.users, false);
          ownerSelect.value = "";
          qrUserSelect.value = "";
        } else {
          showToast(res.error || 'Onbekend probleem bij toevoegen mapping', 'error');
        }
      } catch (err) {
        console.error('Fout bij update_mapping:', err);
        showToast('Fout bij toevoegen mapping', 'error');
      }
    }

    // Delete mapping (versie 2)
    const delBtn = e.target.closest('.delete-mapping-btn');
    if (delBtn) {
      const ownerId = parseInt(delBtn.dataset.ownerid);
      if (!confirm('Weet je zeker dat je deze mapping wilt verwijderen?')) return;

      const res = await api('delete_mapping', { owner_user_id: ownerId });
      if (res.success) {
        showToast('Mapping verwijderd!', 'success');
        await loadOwnerMapping();
      } else showToast(res.error || 'Onbekend probleem bij verwijderen mapping', 'error');
    }
  });

  // Input / file events voor user-save knop (versie 1)
  document.body.addEventListener('input', e => {
    if (e.target.classList.contains('iban-input')) e.target.closest('tr').querySelector('.user-save-btn').classList.remove('hidden');
  });
  document.body.addEventListener('change', e => {
    if (e.target.classList.contains('qr-upload')) e.target.closest('tr').querySelector('.user-save-btn').classList.remove('hidden');
  });

  // QR upload (versie 1)
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
