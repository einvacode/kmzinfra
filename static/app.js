const form = document.getElementById("infraForm");
const listContainer = document.getElementById("listContainer");
const itemCount = document.getElementById("itemCount");
const modeBadge = document.getElementById("modeBadge");
const resetBtn = document.getElementById("resetBtn");
const filterType = document.getElementById("filterType");
const gpsBtn = document.getElementById("gpsBtn");
const gpsCenterBtn = document.getElementById("gpsCenterBtn");
const addAssetBtn = document.getElementById("addAssetBtn");
const assetTypeList = document.getElementById("assetTypeList");
const newAssetName = document.getElementById("newAssetName");
const addInfraTypeBtn = document.getElementById("addInfraTypeBtn");
const newInfraType = document.getElementById("newInfraType");
const infraTypeList = document.getElementById("infraTypeList");
const linkFromId = document.getElementById("linkFromId");
const linkToId = document.getElementById("linkToId");
const linkName = document.getElementById("linkName");
const addLinkBtn = document.getElementById("addLinkBtn");
const exportKmzBtn = document.getElementById("exportKmzBtn");
const linkListContainer = document.getElementById("linkListContainer");
const compactModeBtn = document.getElementById("compactModeBtn");

const fieldId = document.getElementById("itemId");
const fieldName = document.getElementById("name");
const fieldType = document.getElementById("infra_type");
const fieldAssetName = document.getElementById("asset_name");
const fieldLat = document.getElementById("latitude");
const fieldLng = document.getElementById("longitude");
const fieldAddress = document.getElementById("address");
const fieldNotes = document.getElementById("notes");
const fieldStatus = document.getElementById("status");

const map = L.map("map").setView([-2.5, 118], 5);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

const markerLayer = L.layerGroup().addTo(map);
const userLocationLayer = L.layerGroup().addTo(map);
const lineLayer = L.layerGroup().addTo(map);
let cachedData = [];
let allInfraData = [];
let assetTypes = [];
let infraTypes = [];
let infraLinks = [];
let isCompactMode = false;

function isLocalhostHost(hostname) {
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function isGpsContextAllowed() {
    if (window.isSecureContext) {
        return true;
    }
    return isLocalhostHost(window.location.hostname);
}

function getGpsBlockedReason() {
    const isHttp = window.location.protocol === "http:";
    const isLocal = isLocalhostHost(window.location.hostname);
    if (isHttp && !isLocal) {
        return "Akses GPS di browser mobile umumnya ditolak jika aplikasi dibuka via HTTP dari IP jaringan lokal. Gunakan HTTPS atau akses dari localhost.";
    }
    return "Akses GPS diblokir oleh browser atau pengaturan privasi perangkat.";
}

map.on("click", (event) => {
    const { lat, lng } = event.latlng;
    fieldLat.value = lat.toFixed(6);
    fieldLng.value = lng.toFixed(6);
});

function refreshMapLayout() {
    window.setTimeout(() => {
        map.invalidateSize();
    }, 120);
}

function setCompactButtonText() {
    if (!compactModeBtn) {
        return;
    }
    compactModeBtn.textContent = `Compact Mode: ${isCompactMode ? "On" : "Off"}`;
}

function applyCompactMode(enabled) {
    isCompactMode = enabled;
    document.body.classList.toggle("compact-ui", isCompactMode);
    setCompactButtonText();
    window.localStorage.setItem("kmzinfra-compact-mode", isCompactMode ? "1" : "0");
    refreshMapLayout();
}

window.addEventListener("resize", refreshMapLayout);
window.addEventListener("orientationchange", refreshMapLayout);

function markerColor(infraType) {
    if (infraType === "TIANG") return "#0f766e";
    if (infraType === "ODP_FIBER_OPTIK") return "#e85d04";
    if (infraType === "CLOSURE") return "#1d4ed8";
    return "#475569";
}

function escapeHtml(text) {
    return String(text)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function resetForm() {
    fieldId.value = "";
    form.reset();
    fieldStatus.value = "AKTIF";
    renderInfraTypeOptions();
    refreshAssetControls();
    modeBadge.textContent = "Mode: Tambah";
}

function renderInfraTypeOptions() {
    const previousType = fieldType.value;
    const selectedFilter = filterType.value;

    if (infraTypes.length === 0) {
        fieldType.innerHTML = '<option value="">Belum ada tipe, tambahkan dulu</option>';
        filterType.innerHTML = '<option value="">Semua Tipe</option>';
        return;
    }

    const optionsHtml = infraTypes
        .map((item) => `<option value="${escapeHtml(item.infra_type)}">${escapeHtml(item.infra_type)}</option>`)
        .join("");

    fieldType.innerHTML = optionsHtml;
    filterType.innerHTML = '<option value="">Semua Tipe</option>' + optionsHtml;

    const hasPreviousType = infraTypes.some((item) => item.infra_type === previousType);
    fieldType.value = hasPreviousType ? previousType : infraTypes[0].infra_type;

    const hasPreviousFilter = infraTypes.some((item) => item.infra_type === selectedFilter);
    filterType.value = hasPreviousFilter ? selectedFilter : "";
}

function renderInfraTypeList() {
    if (infraTypes.length === 0) {
        infraTypeList.innerHTML = '<p class="muted">Belum ada jenis infrastruktur.</p>';
        return;
    }

    infraTypeList.innerHTML = infraTypes
        .map(
            (item) => `
                <div class="asset-type-item">
                    <strong>${escapeHtml(item.infra_type)}</strong>
                    <div class="row-actions">
                        <button type="button" data-action="edit-infra" data-id="${item.id}">Edit</button>
                        <button type="button" data-action="delete-infra" data-id="${item.id}">Hapus</button>
                    </div>
                </div>
            `
        )
        .join("");
}

function getAssetsByType(infraType) {
    return assetTypes.filter((asset) => asset.infra_type === infraType);
}

function renderAssetSelect(selectedAssetName = "") {
    const selectedType = fieldType.value;
    if (!selectedType) {
        fieldAssetName.innerHTML = '<option value="">Pilih tipe infrastruktur dulu</option>';
        return;
    }

    const assets = getAssetsByType(selectedType);

    if (assets.length === 0) {
        fieldAssetName.innerHTML = '<option value="">Belum ada aset, tambahkan dulu</option>';
        return;
    }

    fieldAssetName.innerHTML = assets
        .map((asset) => `<option value="${escapeHtml(asset.asset_name)}">${escapeHtml(asset.asset_name)}</option>`)
        .join("");

    const hasSelected = assets.some((asset) => asset.asset_name === selectedAssetName);
    if (selectedAssetName && hasSelected) {
        fieldAssetName.value = selectedAssetName;
        return;
    }

    fieldAssetName.value = assets[0].asset_name;
}

function renderAssetTypeList() {
    const selectedType = fieldType.value;
    const assets = getAssetsByType(selectedType);

    if (assets.length === 0) {
        assetTypeList.innerHTML = '<p class="muted">Belum ada jenis aset untuk tipe ini.</p>';
        return;
    }

    assetTypeList.innerHTML = assets
        .map(
            (asset) => `
                <div class="asset-type-item">
                    <strong>${escapeHtml(asset.asset_name)}</strong>
                    <div class="row-actions">
                        <button type="button" data-action="edit-asset" data-id="${asset.id}">Edit</button>
                        <button type="button" data-action="delete-asset" data-id="${asset.id}">Hapus</button>
                    </div>
                </div>
            `
        )
        .join("");
}

function refreshAssetControls(selectedAssetName = "") {
    renderAssetSelect(selectedAssetName);
    renderAssetTypeList();
}

function renderLinkPointOptions() {
    if (!linkFromId || !linkToId) {
        return;
    }

    const previousFrom = linkFromId.value;
    const previousTo = linkToId.value;

    if (allInfraData.length === 0) {
        linkFromId.innerHTML = '<option value="">Belum ada titik</option>';
        linkToId.innerHTML = '<option value="">Belum ada titik</option>';
        return;
    }

    const optionHtml = allInfraData
        .map((item) => {
            const label = `${escapeHtml(item.name)} | ${escapeHtml(item.infra_type)} | ${escapeHtml(item.asset_name || "-")}`;
            return `<option value="${item.id}">${label}</option>`;
        })
        .join("");

    linkFromId.innerHTML = optionHtml;
    linkToId.innerHTML = optionHtml;

    const hasPrevFrom = allInfraData.some((item) => String(item.id) === previousFrom);
    const hasPrevTo = allInfraData.some((item) => String(item.id) === previousTo);
    linkFromId.value = hasPrevFrom ? previousFrom : String(allInfraData[0].id);
    linkToId.value = hasPrevTo ? previousTo : String(allInfraData[Math.min(1, allInfraData.length - 1)].id);
}

function renderLinkLines() {
    lineLayer.clearLayers();

    infraLinks.forEach((link) => {
        const line = L.polyline(
            [
                [link.from_latitude, link.from_longitude],
                [link.to_latitude, link.to_longitude]
            ],
            {
                color: "#0ea5e9",
                weight: 3,
                opacity: 0.85
            }
        ).addTo(lineLayer);

        const title = link.line_name || `${link.from_name} -> ${link.to_name}`;
        line.bindPopup(`<strong>${escapeHtml(title)}</strong><br>${escapeHtml(link.from_name)} -> ${escapeHtml(link.to_name)}`);
    });
}

function renderLinkList() {
    if (!linkListContainer) {
        return;
    }

    if (infraLinks.length === 0) {
        linkListContainer.innerHTML = '<p class="muted">Belum ada jalur. Tambahkan koneksi antar titik.</p>';
        return;
    }

    linkListContainer.innerHTML = infraLinks
        .map((link) => {
            const title = link.line_name || `${link.from_name} -> ${link.to_name}`;
            return `
                <article class="list-item">
                    <h3>${escapeHtml(title)}</h3>
                    <p class="meta">${escapeHtml(link.from_name)} (${escapeHtml(link.from_type)}) -> ${escapeHtml(link.to_name)} (${escapeHtml(link.to_type)})</p>
                    <div class="row-actions">
                        <button data-action="focus-link" data-id="${link.id}">Lihat Jalur</button>
                        <button data-action="delete-link" data-id="${link.id}">Hapus</button>
                    </div>
                </article>
            `;
        })
        .join("");
}

function setCoordinates(lat, lng) {
    fieldLat.value = Number(lat).toFixed(6);
    fieldLng.value = Number(lng).toFixed(6);
}

function renderUserLocation(lat, lng, accuracy) {
    userLocationLayer.clearLayers();

    const marker = L.marker([lat, lng]).addTo(userLocationLayer);
    marker.bindPopup(`Posisi Anda<br>Lat/Lng: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);

    L.circle([lat, lng], {
        radius: accuracy,
        color: "#1d4ed8",
        fillColor: "#93c5fd",
        fillOpacity: 0.2,
        weight: 1
    }).addTo(userLocationLayer);
}

function geolocationErrorMessage(error) {
    if (!error) {
        return "Gagal mengambil lokasi GPS.";
    }

    if (error.code === 1) {
        if (!isGpsContextAllowed()) {
            return getGpsBlockedReason();
        }
        return "Izin lokasi ditolak. Aktifkan izin lokasi pada browser handphone Anda.";
    }
    if (error.code === 2) {
        return "Lokasi tidak tersedia. Coba pindah ke area dengan sinyal GPS lebih baik.";
    }
    if (error.code === 3) {
        return "Permintaan lokasi timeout. Coba lagi.";
    }

    return error.message || "Gagal mengambil lokasi GPS.";
}

function requestGpsLocation({ focusMap }) {
    if (!("geolocation" in navigator)) {
        window.alert("Browser ini tidak mendukung geolocation.");
        return;
    }

    if (!isGpsContextAllowed()) {
        window.alert(getGpsBlockedReason());
        return;
    }

    modeBadge.textContent = "Mode: Mengambil GPS...";

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const accuracy = position.coords.accuracy || 20;

            setCoordinates(lat, lng);
            renderUserLocation(lat, lng, accuracy);

            if (focusMap) {
                map.flyTo([lat, lng], 17, { duration: 0.8 });
            }

            modeBadge.textContent = "Mode: Tambah";
        },
        (error) => {
            modeBadge.textContent = "Mode: Tambah";
            window.alert(geolocationErrorMessage(error));
        },
        {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0
        }
    );
}

function fillForm(item) {
    fieldId.value = String(item.id);
    fieldName.value = item.name;
    fieldType.value = item.infra_type;
    refreshAssetControls(item.asset_name || "");
    fieldLat.value = item.latitude;
    fieldLng.value = item.longitude;
    fieldAddress.value = item.address || "";
    fieldNotes.value = item.notes || "";
    fieldStatus.value = item.status || "AKTIF";
    modeBadge.textContent = "Mode: Edit";
}

function renderMarkers(items) {
    markerLayer.clearLayers();

    items.forEach((item) => {
        const marker = L.circleMarker([item.latitude, item.longitude], {
            radius: 8,
            color: markerColor(item.infra_type),
            weight: 2,
            fillOpacity: 0.82
        }).addTo(markerLayer);

        const popup = `
            <strong>${escapeHtml(item.name)}</strong><br>
            Tipe: ${escapeHtml(item.infra_type)}<br>
            Aset: ${escapeHtml(item.asset_name || "-")}<br>
            Status: ${escapeHtml(item.status || "-")}<br>
            Lat/Lng: ${item.latitude}, ${item.longitude}
        `;
        marker.bindPopup(popup);
        marker.on("click", () => fillForm(item));
    });
}

function renderList(items) {
    itemCount.textContent = `${items.length} data`;
    if (items.length === 0) {
        listContainer.innerHTML = '<p class="muted">Belum ada data titik infrastruktur.</p>';
        return;
    }

    listContainer.innerHTML = items
        .map((item) => {
            return `
                <article class="list-item">
                    <h3>${escapeHtml(item.name)}</h3>
                    <p class="meta">${escapeHtml(item.infra_type)} | ${escapeHtml(item.asset_name || "-")} | ${escapeHtml(item.status || "-")}</p>
                    <p class="meta">${item.latitude}, ${item.longitude}</p>
                    <div class="row-actions">
                        <button data-action="focus" data-id="${item.id}">Lihat</button>
                        <button data-action="edit" data-id="${item.id}">Edit</button>
                        <button data-action="delete" data-id="${item.id}">Hapus</button>
                    </div>
                </article>
            `;
        })
        .join("");
}

async function loadAssetTypes() {
    const response = await fetch("/api/asset-types");
    const result = await response.json();

    if (!result.ok) {
        throw new Error(result.message || "Gagal mengambil data jenis aset.");
    }

    assetTypes = result.data;
    refreshAssetControls(fieldAssetName.value || "");
}

async function loadInfraTypes() {
    const response = await fetch("/api/infra-types");
    const result = await response.json();
    if (!result.ok) {
        throw new Error(result.message || "Gagal mengambil jenis infrastruktur.");
    }

    infraTypes = result.data;
    renderInfraTypeOptions();
    renderInfraTypeList();
}

async function loadAllInfraData() {
    const response = await fetch("/api/infra");
    const result = await response.json();

    if (!result.ok) {
        throw new Error(result.message || "Gagal mengambil data titik infrastruktur.");
    }

    allInfraData = result.data;
    renderLinkPointOptions();
}

async function loadInfraLinks() {
    const response = await fetch("/api/infra-links");
    const result = await response.json();
    if (!result.ok) {
        throw new Error(result.message || "Gagal mengambil data jalur.");
    }

    infraLinks = result.data;
    renderLinkLines();
    renderLinkList();
}

async function loadData() {
    const typeValue = filterType.value;
    const url = typeValue ? `/api/infra?infra_type=${encodeURIComponent(typeValue)}` : "/api/infra";

    const response = await fetch(url);
    const result = await response.json();

    if (!result.ok) {
        throw new Error(result.message || "Gagal mengambil data.");
    }

    cachedData = result.data;
    renderMarkers(cachedData);
    renderList(cachedData);
}

async function saveData(event) {
    event.preventDefault();

    const payload = {
        name: fieldName.value.trim(),
        infra_type: fieldType.value,
        asset_name: fieldAssetName.value,
        latitude: fieldLat.value,
        longitude: fieldLng.value,
        address: fieldAddress.value.trim(),
        notes: fieldNotes.value.trim(),
        status: fieldStatus.value
    };

    const editingId = fieldId.value;
    const endpoint = editingId ? `/api/infra/${editingId}` : "/api/infra";
    const method = editingId ? "PUT" : "POST";

    const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    const result = await response.json();

    if (!response.ok || !result.ok) {
        throw new Error(result.message || "Gagal menyimpan data.");
    }

    resetForm();
    await loadAllInfraData();
    await loadData();
    await loadInfraLinks();
}

async function addAssetType() {
    const assetNameValue = newAssetName.value.trim().toUpperCase();
    if (!assetNameValue) {
        throw new Error("Nama aset wajib diisi.");
    }

    const payload = {
        infra_type: fieldType.value,
        asset_name: assetNameValue
    };

    const response = await fetch("/api/asset-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
        throw new Error(result.message || "Gagal menambah aset.");
    }

    newAssetName.value = "";
    await loadAssetTypes();
    fieldAssetName.value = assetNameValue;
}

async function addInfraType() {
    const typeValue = newInfraType.value.trim().toUpperCase();
    if (!typeValue) {
        throw new Error("Nama jenis infrastruktur wajib diisi.");
    }

    const response = await fetch("/api/infra-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ infra_type: typeValue })
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
        throw new Error(result.message || "Gagal menambah jenis infrastruktur.");
    }

    newInfraType.value = "";
    await loadInfraTypes();
    fieldType.value = typeValue;
    await loadAssetTypes();
}

async function removeAssetType(id) {
    const response = await fetch(`/api/asset-types/${id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok || !result.ok) {
        throw new Error(result.message || "Gagal menghapus aset.");
    }

    await loadAssetTypes();
}

async function updateAssetType(id, assetName) {
    const response = await fetch(`/api/asset-types/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset_name: assetName })
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
        throw new Error(result.message || "Gagal memperbarui aset.");
    }

    await loadAssetTypes();
    await loadAllInfraData();
    await loadData();
    await loadInfraLinks();
}

async function removeInfraType(id) {
    const response = await fetch(`/api/infra-types/${id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok || !result.ok) {
        throw new Error(result.message || "Gagal menghapus jenis infrastruktur.");
    }

    await loadInfraTypes();
    await loadAssetTypes();
    await loadData();
}

async function updateInfraType(id, infraTypeName) {
    const response = await fetch(`/api/infra-types/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ infra_type: infraTypeName })
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
        throw new Error(result.message || "Gagal memperbarui jenis infrastruktur.");
    }

    await loadInfraTypes();
    fieldType.value = infraTypeName;
    filterType.value = infraTypeName;
    await loadAssetTypes();
    await loadAllInfraData();
    await loadData();
    await loadInfraLinks();
}

async function addInfraLink() {
    const fromId = Number(linkFromId.value);
    const toId = Number(linkToId.value);
    if (!fromId || !toId) {
        throw new Error("Pilih titik asal dan tujuan jalur.");
    }

    const payload = {
        from_infra_id: fromId,
        to_infra_id: toId,
        line_name: linkName.value.trim()
    };

    const response = await fetch("/api/infra-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
        throw new Error(result.message || "Gagal menambah jalur.");
    }

    linkName.value = "";
    await loadInfraLinks();
}

async function removeInfraLink(id) {
    const response = await fetch(`/api/infra-links/${id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok || !result.ok) {
        throw new Error(result.message || "Gagal menghapus jalur.");
    }

    await loadInfraLinks();
}

async function deleteData(id) {
    const response = await fetch(`/api/infra/${id}`, { method: "DELETE" });
    const result = await response.json();

    if (!response.ok || !result.ok) {
        throw new Error(result.message || "Gagal menghapus data.");
    }

    if (fieldId.value === String(id)) {
        resetForm();
    }

    await loadAllInfraData();
    await loadData();
    await loadInfraLinks();
}

listContainer.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
        return;
    }

    const action = target.dataset.action;
    const id = Number(target.dataset.id);

    if (!action || !id) {
        return;
    }

    const item = cachedData.find((data) => data.id === id);
    if (!item) {
        return;
    }

    try {
        if (action === "focus") {
            map.flyTo([item.latitude, item.longitude], 16, { duration: 0.7 });
            return;
        }

        if (action === "edit") {
            fillForm(item);
            map.flyTo([item.latitude, item.longitude], 16, { duration: 0.7 });
            return;
        }

        if (action === "delete") {
            const yes = window.confirm(`Hapus titik ${item.name}?`);
            if (yes) {
                await deleteData(id);
            }
        }
    } catch (error) {
        window.alert(error.message);
    }
});

form.addEventListener("submit", async (event) => {
    try {
        await saveData(event);
    } catch (error) {
        window.alert(error.message);
    }
});

assetTypeList.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
        return;
    }

    try {
        const action = target.dataset.action;
        const id = Number(target.dataset.id);
        if (!id) {
            return;
        }

        if (action === "delete-asset") {
            const yes = window.confirm("Hapus jenis aset ini?");
            if (!yes) {
                return;
            }
            await removeAssetType(id);
            return;
        }

        if (action === "edit-asset") {
            const current = assetTypes.find((asset) => asset.id === id);
            if (!current) {
                return;
            }

            const edited = window.prompt("Ubah nama jenis aset:", current.asset_name || "");
            if (edited === null) {
                return;
            }

            const newName = edited.trim().toUpperCase();
            if (!newName) {
                window.alert("Nama aset tidak boleh kosong.");
                return;
            }

            await updateAssetType(id, newName);
        }
    } catch (error) {
        window.alert(error.message);
    }
});

addAssetBtn.addEventListener("click", async () => {
    try {
        await addAssetType();
    } catch (error) {
        window.alert(error.message);
    }
});

infraTypeList.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
        return;
    }

    try {
        const action = target.dataset.action;
        const id = Number(target.dataset.id);
        if (!id) {
            return;
        }

        if (action === "delete-infra") {
            const yes = window.confirm("Hapus jenis infrastruktur ini?");
            if (!yes) {
                return;
            }
            await removeInfraType(id);
            return;
        }

        if (action === "edit-infra") {
            const current = infraTypes.find((item) => item.id === id);
            if (!current) {
                return;
            }

            const edited = window.prompt("Ubah nama jenis infrastruktur:", current.infra_type || "");
            if (edited === null) {
                return;
            }

            const newType = edited.trim().toUpperCase();
            if (!newType) {
                window.alert("Nama jenis infrastruktur tidak boleh kosong.");
                return;
            }

            await updateInfraType(id, newType);
        }
    } catch (error) {
        window.alert(error.message);
    }
});

addInfraTypeBtn.addEventListener("click", async () => {
    try {
        await addInfraType();
    } catch (error) {
        window.alert(error.message);
    }
});

if (linkListContainer) {
    linkListContainer.addEventListener("click", async (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
            return;
        }

        const action = target.dataset.action;
        const id = Number(target.dataset.id);
        if (!action || !id) {
            return;
        }

        const link = infraLinks.find((item) => item.id === id);
        if (!link) {
            return;
        }

        try {
            if (action === "focus-link") {
                const bounds = L.latLngBounds(
                    [link.from_latitude, link.from_longitude],
                    [link.to_latitude, link.to_longitude]
                );
                map.fitBounds(bounds.pad(0.35));
                return;
            }

            if (action === "delete-link") {
                const yes = window.confirm("Hapus jalur ini?");
                if (!yes) {
                    return;
                }
                await removeInfraLink(id);
            }
        } catch (error) {
            window.alert(error.message);
        }
    });
}

if (addLinkBtn) {
    addLinkBtn.addEventListener("click", async () => {
        try {
            await addInfraLink();
        } catch (error) {
            window.alert(error.message);
        }
    });
}

if (exportKmzBtn) {
    exportKmzBtn.addEventListener("click", () => {
        window.location.href = "/api/kmz/export";
    });
}

if (compactModeBtn) {
    compactModeBtn.addEventListener("click", () => {
        applyCompactMode(!isCompactMode);
    });
}

fieldType.addEventListener("change", () => {
    refreshAssetControls();
});

resetBtn.addEventListener("click", resetForm);
filterType.addEventListener("change", async () => {
    try {
        await loadData();
    } catch (error) {
        window.alert(error.message);
    }
});

gpsBtn.addEventListener("click", () => {
    requestGpsLocation({ focusMap: false });
});

gpsCenterBtn.addEventListener("click", () => {
    requestGpsLocation({ focusMap: true });
});

(async function init() {
    try {
        const compactModeSaved = window.localStorage.getItem("kmzinfra-compact-mode") === "1";
        applyCompactMode(compactModeSaved);

        if (!isGpsContextAllowed()) {
            window.setTimeout(() => {
                window.alert("Peringatan GPS: aplikasi Anda sedang dibuka pada koneksi yang tidak aman untuk geolocation mobile (HTTP non-localhost). Silakan gunakan HTTPS agar tombol GPS bisa dipakai.");
            }, 350);
        }

        await loadInfraTypes();
        await loadAssetTypes();
        resetForm();
        await loadAllInfraData();
        await loadData();
        await loadInfraLinks();
        refreshMapLayout();
    } catch (error) {
        window.alert(error.message);
    }
})();
