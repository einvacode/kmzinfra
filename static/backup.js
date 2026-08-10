const createBackupBtn = document.getElementById("createBackupBtn");
const refreshBackupBtn = document.getElementById("refreshBackupBtn");
const backupSelect = document.getElementById("backupSelect");
const downloadBackupBtn = document.getElementById("downloadBackupBtn");
const restoreBackupBtn = document.getElementById("restoreBackupBtn");
const backupInfo = document.getElementById("backupInfo");

let backups = [];

function escapeHtml(text) {
    return String(text)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatBytes(bytes) {
    if (!bytes || bytes < 1024) {
        return `${bytes || 0} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function renderBackupOptions() {
    if (backups.length === 0) {
        backupSelect.innerHTML = '<option value="">Belum ada file backup</option>';
        backupInfo.textContent = "Belum ada file backup. Klik Buat Backup Sekarang.";
        return;
    }

    backupSelect.innerHTML = backups
        .map((item) => `<option value="${escapeHtml(item.filename)}">${escapeHtml(item.filename)}</option>`)
        .join("");

    const selected = backups[0];
    backupSelect.value = selected.filename;
    backupInfo.textContent = `Backup terbaru: ${selected.filename} (${formatBytes(selected.size)}) - ${selected.modified_at}`;
}

async function loadBackups() {
    const response = await fetch("/api/backup/list");
    const result = await response.json();
    if (!response.ok || !result.ok) {
        throw new Error(result.message || "Gagal mengambil daftar backup.");
    }

    backups = result.data;
    renderBackupOptions();
}

async function createBackup() {
    const response = await fetch("/api/backup/create", { method: "POST" });
    const result = await response.json();
    if (!response.ok || !result.ok) {
        throw new Error(result.message || "Gagal membuat backup.");
    }

    await loadBackups();
}

async function restoreBackup() {
    const filename = backupSelect.value;
    if (!filename) {
        throw new Error("Pilih file backup terlebih dulu.");
    }

    const response = await fetch("/api/backup/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename })
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
        throw new Error(result.message || "Gagal restore backup.");
    }

    await loadBackups();
}

refreshBackupBtn.addEventListener("click", async () => {
    try {
        await loadBackups();
    } catch (error) {
        window.alert(error.message);
    }
});

createBackupBtn.addEventListener("click", async () => {
    try {
        await createBackup();
        window.alert("Backup berhasil dibuat.");
    } catch (error) {
        window.alert(error.message);
    }
});

downloadBackupBtn.addEventListener("click", () => {
    const filename = backupSelect.value;
    if (!filename) {
        window.alert("Pilih file backup terlebih dulu.");
        return;
    }

    window.location.href = `/api/backup/download/${encodeURIComponent(filename)}`;
});

restoreBackupBtn.addEventListener("click", async () => {
    const filename = backupSelect.value;
    if (!filename) {
        window.alert("Pilih file backup terlebih dulu.");
        return;
    }

    const yes = window.confirm(`Restore backup ${filename}? Data aktif saat ini akan diganti.`);
    if (!yes) {
        return;
    }

    try {
        await restoreBackup();
        window.alert("Restore backup berhasil.");
    } catch (error) {
        window.alert(error.message);
    }
});

(async function init() {
    try {
        await loadBackups();
    } catch (error) {
        window.alert(error.message);
    }
})();
