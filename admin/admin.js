// ---------------------
// Dynamisch base path
// ---------------------
const BASE_PATH = window.location.pathname.replace(/\/[^/]*$/, "");
console.log("BASE_PATH:", BASE_PATH);

const API_BASE = BASE_PATH.replace(/\/admin$/, '') + '/api/api.php';
console.log("API_BASE:", API_BASE);

const UPLOADS_BASE = BASE_PATH.replace(/\/admin$/, '') + '/env/uploads/';

// ---------------------
// Helper API
// ---------------------
async function api(action, payload = {}, method = 'POST') {
  const opts = { method };
  if (method === 'POST') {
    if (payload instanceof FormData) {
      opts.body = payload;
    } else {
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
        <input type="text" value="${u.iban || ''}" 
               data-userid="${u.id}" 
               class="iban-input w-full border rounded px-2 py-1 focus:ring focus:ring-blue-300">
      </td>
      <td class="px-4 py-2 flex justify-between items-center">
        <!-- Links: QR preview + file input -->
        <div class="flex items-center space-x-2">
          <img src="${qrSrc}" class="qr-preview w-16 h-16 object-contain rounded border">
          <input type="file" data-userid="${u.id}" class="qr-upload text-sm">
        </div>
        <!-- Rechts: Opslaan button -->
        <div>
          <button class="user-save-btn hidden p-2 rounded hover:bg-green-600 text-white"
                  data-userid="${u.id}" title="Opslaan">
            💾
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  }
}


async function loadOwnerMapping() {
    const data = await api('list_mappings');
    const tbody = document.getElementById('config-tbody');
    tbody.innerHTML = '';

    // bestaande mappings
    for (const m of data.mappings) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="px-4 py-2 font-medium">${m.owner_name}</td>
            <td class="px-4 py-2 flex justify-between items-center">
                <span>${m.qr_user_name || '-'}</span>
                <button class="delete-mapping-btn text-red-500 hover:text-red-700"
                        data-ownerid="${m.owner_id}" title="Verwijderen">
                    <!-- Prullenbak SVG -->
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5-4h4m-4 0a1 1 0 00-1 1v1h6V4a1 1 0 00-1-1m-4 0h4" />
                    </svg>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    }

    // dropdowns vullen
    const owners = await api('list_users');
    const qrUsers = owners.users.filter(u => u.qr_url);

    const ownerSelect = document.getElementById('new-owner');
    const qrUserSelect = document.getElementById('new-qr-user');

    ownerSelect.innerHTML = '<option value="">-- Kies owner --</option>';
    owners.users.forEach(u => {
        ownerSelect.innerHTML += `<option value="${u.id}">${u.name}</option>`;
    });

    qrUserSelect.innerHTML = '<option value="">-- Kies gebruiker --</option>';
    qrUsers.forEach(u => {
        qrUserSelect.innerHTML += `<option value="${u.id}">${u.name}</option>`;
    });
}


// ---------------------
// Event listeners
// ---------------------
document.addEventListener('DOMContentLoaded', async () => {
  const loginPage = document.getElementById('login-page');
  const dashboard = document.getElementById('dashboard');

  // Check sessie
  const me = await api('me');
  if (me.user) showDashboard();
  else loginPage.classList.remove('hidden');

  // Login
  document.getElementById('login-btn').addEventListener('click', async () => {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const res = await api('login', { email, password });
    if (res.ok) showDashboard();
    else showToast(res.error || 'Login mislukt', 'error');
  });

  // Logout
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await api('logout');
    dashboard.classList.add('hidden');
    loginPage.classList.remove('hidden');
  });

  // ---------------------
  // Dashboard tonen
  // ---------------------
  async function showDashboard() {
    loginPage.classList.add('hidden');
    dashboard.classList.remove('hidden');

    // Activeer standaard de gebruikers-tab
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.add('hidden'));
    const usersTab = document.getElementById('tab-users');
    usersTab.classList.remove('hidden');

    // Update tab knoppen
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.replace('bg-blue-500', 'bg-gray-300');
      b.classList.replace('text-white', 'text-black');
    });
    const usersBtn = document.querySelector('.tab-btn[data-tab="users"]');
    if (usersBtn) {
      usersBtn.classList.replace('bg-gray-300', 'bg-blue-500');
      usersBtn.classList.replace('text-black', 'text-white');
    }

    // Data laden
    await loadUsers();
    await loadOwnerMapping();

    adjustTabHeight();
  }

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-content').forEach(tc => tc.classList.add('hidden'));
      document.getElementById(`tab-${tab}`).classList.remove('hidden');

      document.querySelectorAll('.tab-btn').forEach(b => b.classList.replace('bg-blue-500', 'bg-gray-300'));
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.replace('text-white', 'text-black'));

      btn.classList.replace('bg-gray-300', 'bg-blue-500');
      btn.classList.replace('text-black', 'text-white');
    });
  });

  // ---------------------
  // Body click events
  // ---------------------
  document.body.addEventListener('click', async e => {
    // Gebruiker opslaan
    const saveBtn = e.target.closest('.user-save-btn');
    if (saveBtn) {
      const tr = saveBtn.closest('tr');
      const userId = saveBtn.dataset.userid;
      const ibanInput = tr.querySelector('input.iban-input');
      const fileInput = tr.querySelector('input.qr-upload');
      const img = tr.querySelector('img.qr-preview');

      const qr_url = fileInput.dataset.qrurl || img.src;
      const filename = qr_url.split('/').pop();
      const iban = ibanInput.value;

      const res = await api('update_user', { id: parseInt(userId), iban, qr_url: filename });
      if (res.success) showToast('Gebruiker opgeslagen!', 'success');
      else showToast(res.error || 'Onbekend', 'error');

      await loadUsers();
      return;
    }

    // Mapping toevoegen
    const addBtn = e.target.closest('#add-mapping-btn');
    if (addBtn) {
      const ownerId = document.getElementById('new-owner').value;
      const qrUserId = document.getElementById('new-qr-user').value;
      if (!ownerId || !qrUserId) return showToast('Selecteer beide velden!', 'error');

      const res = await api('update_mapping', { owner_user_id: parseInt(ownerId), qr_user_id: parseInt(qrUserId) });
      if (res.success) showToast('Mapping toegevoegd!', 'success');
      else showToast(res.error || 'Onbekend', 'error');

      await loadOwnerMapping();
      return;
    }

    // Mapping verwijderen
    const delBtn = e.target.closest('.delete-mapping-btn');
    if (delBtn) {
      const ownerId = parseInt(delBtn.dataset.ownerid);
      if (!confirm('Weet je zeker dat je deze mapping wilt verwijderen?')) return;

      const res = await api('delete_mapping', { owner_user_id: ownerId });
      if (res.success) showToast('Mapping verwijderd!', 'success');
      else showToast(res.error || 'Onbekend', 'error');

      await loadOwnerMapping();
      return;
    }
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

  // ---------------------
  // Input / file change voor user-save
  // ---------------------
  document.body.addEventListener('input', e => {
    if (e.target.classList.contains('iban-input')) {
      const tr = e.target.closest('tr');
      const btn = tr.querySelector('.user-save-btn');
      btn.classList.remove('hidden');
    }
  });

  document.body.addEventListener('change', e => {
    if (e.target.classList.contains('qr-upload')) {
      const tr = e.target.closest('tr');
      const btn = tr.querySelector('.user-save-btn');
      btn.classList.remove('hidden');
    }
  });

  // Tab hoogte aanpassen om hobbelen te voorkomen
  function adjustTabHeight() {
    const container = document.getElementById('tabs-container');
    let maxHeight = 0;
    document.querySelectorAll('.tab-content').forEach(tc => {
      tc.classList.remove('hidden');
      maxHeight = Math.max(maxHeight, tc.offsetHeight);
      tc.classList.add('hidden');
    });
    container.style.minHeight = maxHeight + 'px';
  }
});
