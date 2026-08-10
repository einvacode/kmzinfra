const companySettingsForm = document.getElementById("companySettingsForm");
const settingsMessage = document.getElementById("settingsMessage");
const fieldStaffForm = document.getElementById("fieldStaffForm");
const fieldStaffList = document.getElementById("fieldStaffList");
const fieldStaffMessage = document.getElementById("fieldStaffMessage");
const refreshFieldStaffBtn = document.getElementById("refreshFieldStaffBtn");

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
