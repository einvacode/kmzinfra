const companySettingsForm = document.getElementById("companySettingsForm");
const settingsMessage = document.getElementById("settingsMessage");
const fieldStaffForm = document.getElementById("fieldStaffForm");
const fieldStaffList = document.getElementById("fieldStaffList");
const fieldStaffMessage = document.getElementById("fieldStaffMessage");
const refreshFieldStaffBtn = document.getElementById("refreshFieldStaffBtn");
const checkUpdateBtn = document.getElementById("checkUpdateBtn");
const applyUpdateBtn = document.getElementById("applyUpdateBtn");
const updateMessage = document.getElementById("updateMessage");
const adminAccountForm = document.getElementById("adminAccountForm");
const selectedUserId = document.getElementById("selected_user_id");
const adminUsername = document.getElementById("admin_username");
const adminNewPassword = document.getElementById("admin_new_password");
const refreshUsersBtn = document.getElementById("refreshUsersBtn");
const adminAccountMessage = document.getElementById("adminAccountMessage");
const userList = document.getElementById("userList");

let cachedUsers = [];

function escapeHtml(text) {
    return String(text)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function setMessage(message, isError = false) {
    settingsMessage.textContent = message;
    settingsMessage.classList.toggle("error-text", isError);
}

function setFieldStaffMessage(message, isError = false) {
    if (!fieldStaffMessage) {
        return;
    }
    fieldStaffMessage.textContent = message;
    fieldStaffMessage.classList.toggle("error-text", isError);
}

function setUpdateMessage(message, isError = false) {
    if (!updateMessage) {
        return;
    }
    updateMessage.textContent = message;
    updateMessage.classList.toggle("error-text", isError);
}

function setAdminAccountMessage(message, isError = false) {
    if (!adminAccountMessage) {
        return;
    }
    adminAccountMessage.textContent = message;
    adminAccountMessage.classList.toggle("error-text", isError);
}

function renderUserOptions() {
    if (!selectedUserId) {
        return;
    }

    if (cachedUsers.length === 0) {
        selectedUserId.innerHTML = '<option value="">Belum ada akun</option>';
        adminUsername.value = "";
        return;
    }

    selectedUserId.innerHTML = cachedUsers
        .map((user) => `<option value="${user.id}">${escapeHtml(user.username)} (ID ${user.id})</option>`)
        .join("");

    const selected = cachedUsers[0];
    selectedUserId.value = String(selected.id);
    adminUsername.value = selected.username;
}

function renderUserList() {
    if (!userList) {
        return;
    }

    if (cachedUsers.length === 0) {
        userList.innerHTML = '<p class="muted">Belum ada akun login.</p>';
        return;
    }

    userList.innerHTML = cachedUsers
        .map((user) => {
            return `
                <article class="list-item">
                    <h3>${escapeHtml(user.username)}</h3>
                    <p class="meta">User ID: ${user.id} | Dibuat: ${escapeHtml(user.created_at || "-")}</p>
                    <div class="row-actions">
                        <button data-action="pick-user" data-id="${user.id}">Pilih</button>
                    </div>
                </article>
            `;
        })
        .join("");
}

function applySelectedUserToForm(userId) {
    const selected = cachedUsers.find((user) => user.id === Number(userId));
    if (!selected) {
        return;
    }

    selectedUserId.value = String(selected.id);
    adminUsername.value = selected.username;
}

async function loadUsers() {
    const response = await fetch("/api/users");
    const result = await response.json();
    if (!response.ok || !result.ok) {
        throw new Error(result.message || "Gagal mengambil data akun login.");
    }

    cachedUsers = result.data;
    renderUserOptions();
    renderUserList();
}

async function updateUserAccount() {
    const id = Number(selectedUserId.value);
    if (!id) {
        throw new Error("Pilih akun yang ingin diubah.");
    }

    const username = adminUsername.value.trim();
    const newPassword = adminNewPassword.value;

    if (!username) {
        throw new Error("Username admin wajib diisi.");
    }

    const response = await fetch(`/api/users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            username,
            new_password: newPassword
        })
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
        throw new Error(result.message || "Gagal memperbarui akun.");
    }

    adminNewPassword.value = "";
    setAdminAccountMessage("Akun admin berhasil diperbarui.");
    await loadUsers();
    applySelectedUserToForm(id);
}

function renderFieldStaffList(items) {
    if (!fieldStaffList) {
        return;
    }

    if (items.length === 0) {
        fieldStaffList.innerHTML = '<p class="muted">Belum ada ID teknisi/operator lapangan.</p>';
        return;
    }

    fieldStaffList.innerHTML = items
        .map((item) => {
            const statusText = Number(item.is_active) === 1 ? "AKTIF" : "NON AKTIF";
            return `
                <article class="list-item">
                    <h3>${escapeHtml(item.staff_id)} - ${escapeHtml(item.full_name)}</h3>
                    <p class="meta">${escapeHtml(item.role)} | ${escapeHtml(statusText)} | ${escapeHtml(item.phone || "-")}</p>
                    <p class="meta">${escapeHtml(item.notes || "-")}</p>
                    <div class="row-actions">
                        <button data-action="delete-staff" data-id="${item.id}">Hapus</button>
                    </div>
                </article>
            `;
        })
        .join("");
}

async function loadFieldStaff() {
    const response = await fetch("/api/field-staff");
    const result = await response.json();
    if (!response.ok || !result.ok) {
        throw new Error(result.message || "Gagal mengambil data teknisi/operator.");
    }
    renderFieldStaffList(result.data);
}

async function createFieldStaff() {
    if (!fieldStaffForm) {
        return;
    }

    const payload = {
        staff_id: document.getElementById("staff_id").value.trim(),
        full_name: document.getElementById("full_name").value.trim(),
        role: document.getElementById("role").value,
        phone: document.getElementById("phone").value.trim(),
        notes: document.getElementById("staff_notes").value.trim(),
        is_active: document.getElementById("is_active").value === "1"
    };

    const response = await fetch("/api/field-staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
        throw new Error(result.message || "Gagal menambah ID lapangan.");
    }

    fieldStaffForm.reset();
    document.getElementById("role").value = "TEKNISI";
    document.getElementById("is_active").value = "1";
    setFieldStaffMessage("ID teknisi/operator berhasil ditambahkan.");
    await loadFieldStaff();
}

async function deleteFieldStaff(id) {
    const response = await fetch(`/api/field-staff/${id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok || !result.ok) {
        throw new Error(result.message || "Gagal menghapus ID lapangan.");
    }
    await loadFieldStaff();
}

async function checkSystemUpdate() {
    const response = await fetch("/api/system/update-status");
    const result = await response.json();
    if (!response.ok || !result.ok) {
        throw new Error(result.message || "Gagal mengecek status update.");
    }

    const data = result.data;
    if (!data.repository_found) {
        setUpdateMessage(data.message || "Repository git tidak ditemukan.", true);
        return;
    }

    const localShort = (data.local_hash || "").slice(0, 8);
    const remoteShort = (data.remote_hash || "").slice(0, 8);
    const base = `Branch: ${data.branch || "-"} | Local: ${localShort || "-"} | Remote: ${remoteShort || "-"}`;

    if (data.has_update) {
        const tail = data.can_update
            ? "Update tersedia. Klik 'Update Sekarang'."
            : "Update tersedia, tapi web update nonaktif di server (set KMZINFRA_ENABLE_WEB_UPDATE=1).";
        setUpdateMessage(`${base} | ${tail}`, !data.can_update);
        return;
    }

    setUpdateMessage(`${base} | Aplikasi sudah versi terbaru.`);
}

async function applySystemUpdate() {
    const response = await fetch("/api/system/apply-update", { method: "POST" });
    const result = await response.json();
    if (!response.ok || !result.ok) {
        throw new Error(result.message || "Gagal menjalankan update aplikasi.");
    }

    const data = result.data || {};
    const pullOutput = (data.pull_output || "").replace(/\s+/g, " ").trim();
    const shortPull = pullOutput ? ` | Git: ${pullOutput.slice(0, 140)}` : "";
    setUpdateMessage(`${data.message || "Update berhasil."}${shortPull}`);
}

companySettingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const payload = {
        company_name: document.getElementById("company_name").value.trim(),
        company_address: document.getElementById("company_address").value.trim(),
        company_phone: document.getElementById("company_phone").value.trim(),
        company_email: document.getElementById("company_email").value.trim(),
        landing_title: document.getElementById("landing_title").value.trim(),
        landing_tagline: document.getElementById("landing_tagline").value.trim(),
        landing_description: document.getElementById("landing_description").value.trim(),
        landing_button_text: document.getElementById("landing_button_text").value.trim(),
        landing_button_url: document.getElementById("landing_button_url").value.trim()
    };

    try {
        const response = await fetch("/api/company-settings", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const result = await response.json();

        if (!response.ok || !result.ok) {
            throw new Error(result.message || "Gagal menyimpan pengaturan.");
        }

        setMessage("Pengaturan berhasil disimpan.");
    } catch (error) {
        setMessage(error.message, true);
    }
});

if (fieldStaffForm) {
    fieldStaffForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        try {
            await createFieldStaff();
        } catch (error) {
            setFieldStaffMessage(error.message, true);
        }
    });
}

if (refreshFieldStaffBtn) {
    refreshFieldStaffBtn.addEventListener("click", async () => {
        try {
            await loadFieldStaff();
            setFieldStaffMessage("Daftar teknisi/operator diperbarui.");
        } catch (error) {
            setFieldStaffMessage(error.message, true);
        }
    });
}

if (fieldStaffList) {
    fieldStaffList.addEventListener("click", async (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
            return;
        }

        if (target.dataset.action !== "delete-staff") {
            return;
        }

        const id = Number(target.dataset.id);
        if (!id) {
            return;
        }

        const yes = window.confirm("Hapus ID teknisi/operator ini?");
        if (!yes) {
            return;
        }

        try {
            await deleteFieldStaff(id);
            setFieldStaffMessage("Data teknisi/operator berhasil dihapus.");
        } catch (error) {
            setFieldStaffMessage(error.message, true);
        }
    });
}

if (checkUpdateBtn) {
    checkUpdateBtn.addEventListener("click", async () => {
        try {
            await checkSystemUpdate();
        } catch (error) {
            setUpdateMessage(error.message, true);
        }
    });
}

if (applyUpdateBtn) {
    applyUpdateBtn.addEventListener("click", async () => {
        const yes = window.confirm("Jalankan update aplikasi dari GitHub sekarang?");
        if (!yes) {
            return;
        }

        try {
            await applySystemUpdate();
            await checkSystemUpdate();
        } catch (error) {
            setUpdateMessage(error.message, true);
        }
    });
}

if (selectedUserId) {
    selectedUserId.addEventListener("change", () => {
        applySelectedUserToForm(selectedUserId.value);
    });
}

if (adminAccountForm) {
    adminAccountForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        try {
            await updateUserAccount();
        } catch (error) {
            setAdminAccountMessage(error.message, true);
        }
    });
}

if (refreshUsersBtn) {
    refreshUsersBtn.addEventListener("click", async () => {
        try {
            await loadUsers();
            setAdminAccountMessage("Daftar akun login diperbarui.");
        } catch (error) {
            setAdminAccountMessage(error.message, true);
        }
    });
}

if (userList) {
    userList.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
            return;
        }

        if (target.dataset.action !== "pick-user") {
            return;
        }

        const id = Number(target.dataset.id);
        if (!id) {
            return;
        }

        applySelectedUserToForm(id);
        setAdminAccountMessage("Akun dipilih. Silakan ubah username/password lalu simpan.");
    });
}

(async function initFieldStaffPanel() {
    if (!fieldStaffList) {
        return;
    }

    try {
        await loadFieldStaff();
    } catch (error) {
        setFieldStaffMessage(error.message, true);
    }
})();

(async function initUpdatePanel() {
    if (!updateMessage) {
        return;
    }

    try {
        await checkSystemUpdate();
    } catch (error) {
        setUpdateMessage(error.message, true);
    }
})();

(async function initUserPanel() {
    if (!userList || !selectedUserId) {
        return;
    }

    try {
        await loadUsers();
    } catch (error) {
        setAdminAccountMessage(error.message, true);
    }
})();
