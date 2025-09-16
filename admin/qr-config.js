// ---------------------
// Dynamisch base path bepalen vanuit admin/
// ---------------------
const BASE_PATH = window.location.pathname.replace(/\/[^/]*$/, "");
const API_BASE = BASE_PATH + "/../api/api.php";      // gaat één map omhoog naar api
const UPLOADS_BASE = BASE_PATH + "/../env/uploads/"; // gaat één map omhoog naar uploads

// Helper om API aan te roepen
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

// Gebruikers laden
async function loadUsers() {
    const data = await api('list_users');
    const tbody = document.getElementById('users-tbody');
    tbody.innerHTML = '';

    for (const u of data.users) {
        const qrSrc = u.qr_url ? UPLOADS_BASE + u.qr_url : UPLOADS_BASE + 'placeholder.png';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${u.name}</td>
            <td><input type="text" value="${u.iban || ''}" data-userid="${u.id}" class="iban-input"></td>
            <td>
                <img src="${qrSrc}" class="qr-preview" style="width:60px;height:60px;">
                <input type="file" data-userid="${u.id}" class="qr-upload">
                <button class="user-save-btn" data-userid="${u.id}">Opslaan</button>
            </td>
        `;
        tbody.appendChild(tr);
    }
}

// Owner → QR mapping laden
async function loadOwnerMapping() {
    const data = await api('list_mappings');
    const tbody = document.getElementById('config-tbody');
    tbody.innerHTML = '';

    // Bestaande mappings
    for (const m of data.mappings) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${m.owner_name}</td>
            <td>
                ${m.qr_user_name || '-'}
                <button class="delete-mapping-btn" data-ownerid="${m.owner_id}">Verwijderen</button>
            </td>
        `;
        tbody.appendChild(tr);
    }

    // Toevoegen-rij
    const owners = await api('list_users'); // alle actieve users
    const usersWithQR = owners.users.filter(u => u.qr_url); // alleen users met QR

    const trAdd = document.createElement('tr');
    trAdd.innerHTML = `
        <td>
            <select id="new-owner">
                <option value="">-- Kies owner --</option>
                ${owners.users.map(u => `<option value="${u.id}">${u.name}</option>`).join('')}
            </select>
        </td>
        <td>
            <select id="new-qr-user">
                <option value="">-- Kies gebruiker --</option>
                ${usersWithQR.map(u => `<option value="${u.id}">${u.name}</option>`).join('')}
            </select>
            <button id="add-mapping-btn">Toevoegen</button>
        </td>
    `;
    tbody.appendChild(trAdd);
}


// Event listeners
document.addEventListener('DOMContentLoaded', async () => {
    await loadUsers();
    await loadOwnerMapping();

    // Eén click listener voor alles
    document.body.addEventListener('click', async e => {

        // =====================
        // Gebruiker opslaan
        // =====================
        if (e.target.classList.contains('user-save-btn')) {
            const tr = e.target.closest('tr');
            const userId = e.target.dataset.userid;
            const ibanInput = tr.querySelector('input.iban-input');
            const fileInput = tr.querySelector('input.qr-upload');
            const img = tr.querySelector('img.qr-preview');

            // Als QR nieuw is geüpload
            const qr_url = fileInput.dataset.qrurl || img.src;
            const filename = qr_url.split('/').pop();

            const iban = ibanInput.value;

            const res = await api('update_user', { id: parseInt(userId), iban, qr_url: filename });
            if (res.success) {
                alert('Gebruiker opgeslagen!');
                await loadUsers();
            } else {
                alert('Fout: ' + (res.error || 'Onbekend'));
            }
        }

        

        // =====================
        // QR opslaan bij bestaande mapping
        // =====================
        if (e.target.classList.contains('owner-save-btn')) {
            const tr = e.target.closest('tr');
            const ownerId = e.target.dataset.ownerid;
            const inputFile = tr.querySelector('input.owner-qr-upload');
            const img = tr.querySelector('img.qr-preview');

            const qr_url = inputFile.dataset.qrurl || img.src;
            const filename = qr_url.split('/').pop();

            const res = await api('update_mapping', { owner_user_id: parseInt(ownerId), qr_user_filename: filename });
            if (res.success) {
                alert('QR mapping opgeslagen!');
                await loadOwnerMapping();
            } else {
                alert('Fout: ' + (res.error || 'Onbekend'));
            }
        }

        // =====================
        // Mapping toevoegen
        // =====================
        if (e.target.id === 'add-mapping-btn') {
            const ownerId = document.getElementById('new-owner').value;
            const qrUserId = document.getElementById('new-qr-user').value;
            if (!ownerId || !qrUserId) return alert('Selecteer beide velden!');

            const res = await api('update_mapping', {
                owner_user_id: parseInt(ownerId),
                qr_user_id: parseInt(qrUserId)
            });
            if (res.success) {
                alert('Mapping toegevoegd!');
                await loadOwnerMapping();
            } else {
                alert('Fout: ' + (res.error || 'Onbekend'));
            }
        }

        // =====================
        // Mapping verwijderen
        // =====================
        if (e.target.classList.contains('delete-mapping-btn')) {
            const ownerId = parseInt(e.target.dataset.ownerid);
            if (!confirm('Weet je zeker dat je deze mapping wilt verwijderen?')) return;

            const res = await api('delete_mapping', { owner_user_id: ownerId });
            if (res.success) {
                alert('Mapping verwijderd!');
                await loadOwnerMapping();
            } else {
                alert('Fout: ' + (res.error || 'Onbekend'));
            }
        }
    });

    // QR upload voor gebruiker en owner
    document.body.addEventListener('change', async e => {
        if (!e.target.classList.contains('qr-upload') && !e.target.classList.contains('owner-qr-upload')) return;

        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('action', 'upload_image');
        formData.append('image', file);

        const res = await api('upload_image', formData);
        if (res.success) {
            const img = e.target.previousElementSibling;
            img.src = res.url;
            e.target.dataset.qrurl = res.url; // tijdelijk opslaan
        } else {
            alert(res.error);
        }
    });
});
