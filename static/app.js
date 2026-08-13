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
const resetLinkBtn = document.getElementById("resetLinkBtn");
const exportKmzBtn = document.getElementById("exportKmzBtn");
const linkListContainer = document.getElementById("linkListContainer");
const linkId = document.getElementById("linkId");
const linkModeBadge = document.getElementById("linkModeBadge");
const linkCount = document.getElementById("linkCount");
const compactModeBtn = document.getElementById("compactModeBtn");
const editPointsOnMapBtn = document.getElementById("editPointsOnMapBtn");
const editRouteGeometryBtn = document.getElementById("editRouteGeometryBtn");
const closeFormPanelBtn = document.getElementById("closeFormPanelBtn");
const formPanel = document.querySelector(".form-panel");
const formPanelBackdrop = document.getElementById("formPanelBackdrop");
const summaryInfraCount = document.getElementById("summaryInfraCount");
const summaryAssetCount = document.getElementById("summaryAssetCount");
const summaryTypeCount = document.getElementById("summaryTypeCount");
const summaryRouteCount = document.getElementById("summaryRouteCount");

const fieldId = document.getElementById("itemId");
const fieldName = document.getElementById("name");
const fieldType = document.getElementById("infra_type");
const fieldAssetName = document.getElementById("asset_name");
const fieldLat = document.getElementById("latitude");
const fieldLng = document.getElementById("longitude");
const fieldAddress = document.getElementById("address");
const fieldNotes = document.getElementById("notes");
const fieldStatus = document.getElementById("status");
const isFieldStaff = document.body.dataset.fieldStaff === "1";

const map = L.map("map").setView([-2.5, 118], 5);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

const markerLayer = L.layerGroup().addTo(map);
const userLocationLayer = L.layerGroup().addTo(map);
const lineLayer = new L.FeatureGroup().addTo(map);
const routeEditControl = new L.Control.Draw({
    edit: {
        featureGroup: lineLayer,
        edit: true,
        remove: false
    },
    draw: false
});
map.addControl(routeEditControl);

let cachedData = [];
let allInfraData = [];
let assetTypes = [];
let infraTypes = [];
let infraLinks = [];
let isCompactMode = false;
let isPointEditMode = false;
let isRouteGeometryEditMode = false;

function isMapRoutesPage() {
    return document.body.classList.contains("map-routes-page");
}

function openFormPanelModal() {
    if (!isMapRoutesPage() || !formPanel) {
        return;
    }

    formPanel.classList.add("is-modal-open");
    if (formPanelBackdrop) {
        formPanelBackdrop.hidden = false;
    }
}

function closeFormPanelModal() {
    if (!isMapRoutesPage() || !formPanel) {
        return;
    }

    formPanel.classList.remove("is-modal-open");
    if (formPanelBackdrop) {
        formPanelBackdrop.hidden = true;
    }
}

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

function updatePointEditButton() {
    if (!editPointsOnMapBtn) {
        return;
    }
    editPointsOnMapBtn.textContent = `Edit Titik: ${isPointEditMode ? "On" : "Off"}`;
}

function updateRouteGeometryEditButton() {
    if (!editRouteGeometryBtn) {
        return;
    }
    editRouteGeometryBtn.textContent = `Edit Bentuk Jalur: ${isRouteGeometryEditMode ? "On" : "Off"}`;

    const editToolbar = routeEditControl?._toolbars?.edit;
    if (!editToolbar) {
        return;
    }

    if (isRouteGeometryEditMode) {
        map.dragging.disable();
        map.doubleClickZoom.disable();
        map.scrollWheelZoom.disable();
        map.boxZoom.disable();
        map.keyboard.disable();
        map.touchZoom.disable();
        editToolbar.enable();
        return;
    }

    map.dragging.enable();
    map.doubleClickZoom.enable();
    map.scrollWheelZoom.enable();
    map.boxZoom.enable();
    map.keyboard.enable();
    map.touchZoom.enable();
    editToolbar.disable();
    if (editToolbar._activeMode) {
        editToolbar._activeMode.handler.disable();
    }
}

function infrastructureMarkerIcon(infraType) {
    const color = markerColor(infraType);
    return L.divIcon({
        className: "infra-map-marker",
        html: `<span style="background:${color}"></span>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9]
    });
}

function escapeHtml(text) {
    return String(text)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function actionIcon(action, label, id, extraClass = "") {
    const icons = {
        focus: "&#9673;",
        "focus-link": "&#9673;",
        edit: "&#9998;",
        "edit-point": "&#9998;",
        "edit-link": "&#9998;",
        "edit-asset": "&#9998;",
        "edit-infra": "&#9998;",
        delete: "&#128465;",
        "delete-link": "&#128465;",
        "delete-asset": "&#128465;",
        "delete-infra": "&#128465;"
    };
    const className = `icon-action ${extraClass}`.trim();
    return `<button type="button" class="${className}" data-action="${action}" data-id="${id}" aria-label="${label}" title="${label}">${icons[action] || "&#8226;"}</button>`;
}

function openInfraEditForm(item, marker = null) {
    fillForm(item);
    openFormPanelModal();
    if (isMapRoutesPage()) {
        window.setTimeout(() => fieldName.focus(), 0);
    } else {
        form.scrollIntoView({ behavior: "smooth", block: "start" });
        fieldName.focus();
    }
    if (marker) {
        marker.closePopup();
    }
}

function renderSummary() {
    if (summaryInfraCount) {
        summaryInfraCount.textContent = String(allInfraData.length);
    }
    if (summaryAssetCount) {
        summaryAssetCount.textContent = String(assetTypes.length);
    }
    if (summaryTypeCount) {
        summaryTypeCount.textContent = String(infraTypes.length);
    }
    if (summaryRouteCount) {
        summaryRouteCount.textContent = String(infraLinks.length);
    }
}

function resetForm() {
    fieldId.value = "";
    form.reset();
    fieldStatus.value = "AKTIF";
    renderInfraTypeOptions();
    refreshAssetControls();
    modeBadge.textContent = "Mode: Tambah";
    closeFormPanelModal();
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
                        ${actionIcon("edit-infra", "Edit jenis infrastruktur", item.id)}
                        ${actionIcon("delete-infra", "Hapus jenis infrastruktur", item.id, "danger")}
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
                        ${actionIcon("edit-asset", "Edit jenis aset", asset.id)}
                        ${actionIcon("delete-asset", "Hapus jenis aset", asset.id, "danger")}
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

function selectedInfrastructureType() {
    return filterType?.value || "";
}

function filteredLinks() {
    const selectedType = selectedInfrastructureType();
    if (!selectedType) {
        return infraLinks;
    }

    return infraLinks.filter(
        (link) => link.from_type === selectedType || link.to_type === selectedType
    );
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

    filteredLinks().forEach((link) => {
        const line = L.polyline(
            link.route_coordinates || [
                [link.from_latitude, link.from_longitude],
                [link.to_latitude, link.to_longitude]
            ],
            {
                color: "#0ea5e9",
                weight: 3,
                opacity: 0.85,
                linkId: link.id
            }
        ).addTo(lineLayer);

        const title = link.line_name || `${link.from_name} -> ${link.to_name}`;
        line.bindPopup(`<strong>${escapeHtml(title)}</strong><br>${escapeHtml(link.from_name)} -> ${escapeHtml(link.to_name)}`);

        if (!line._kmzRouteDragBound) {
            line.on("mousedown", (event) => {
                if (!isRouteGeometryEditMode) {
                    return;
                }

                const linkIdValue = Number(line.options.linkId);
                if (!linkIdValue) {
                    return;
                }

                event.originalEvent.preventDefault();
                const startLatLng = event.latlng;
                const originalLatLngs = line.getLatLngs().map((latLng) => L.latLng(latLng.lat, latLng.lng));
                let moved = false;

                const handleMove = (moveEvent) => {
                    const deltaLat = moveEvent.latlng.lat - startLatLng.lat;
                    const deltaLng = moveEvent.latlng.lng - startLatLng.lng;
                    const nextLatLngs = originalLatLngs.map((point) => L.latLng(point.lat + deltaLat, point.lng + deltaLng));
                    line.setLatLngs(nextLatLngs);
                    moved = true;
                };

                const handleUp = async () => {
                    map.off("mousemove", handleMove);
                    map.off("mouseup", handleUp);
                    if (!moved) {
                        return;
                    }

                    try {
                        await saveRouteGeometry(linkIdValue, line.getLatLngs());
                        await loadInfraLinks();
                    } catch (error) {
                        window.alert(error.message);
                        await loadInfraLinks();
                    }
                };

                map.on("mousemove", handleMove);
                map.on("mouseup", handleUp);
            });
            line._kmzRouteDragBound = true;
        }
    });
}

async function saveRouteGeometry(linkIdValue, latLngs) {
    const routeGeometry = latLngs.map((latLng) => [latLng.lat, latLng.lng]);
    const response = await fetch(`/api/infra-links/${linkIdValue}/geometry`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ route_geometry: routeGeometry })
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
        throw new Error(result.message || "Gagal menyimpan bentuk jalur.");
    }
}

map.on(L.Draw.Event.EDITED, async (event) => {
    try {
        const saves = [];
        event.layers.eachLayer((layer) => {
            const linkIdValue = Number(layer.options.linkId);
            if (linkIdValue) {
                saves.push(saveRouteGeometry(linkIdValue, layer.getLatLngs()));
            }
        });
        await Promise.all(saves);
        await loadInfraLinks();
    } catch (error) {
        window.alert(error.message);
        await loadInfraLinks();
    }
});

function renderLinkList() {
    if (!linkListContainer) {
        return;
    }

    const links = filteredLinks();
    if (linkCount) {
        linkCount.textContent = `${links.length} jalur`;
    }

    if (links.length === 0) {
        const selectedType = selectedInfrastructureType();
        linkListContainer.innerHTML = selectedType
            ? `<p class="muted">Belum ada jalur yang terhubung dengan jenis ${escapeHtml(selectedType)}.</p>`
            : '<p class="muted">Belum ada jalur. Tambahkan koneksi antar titik.</p>';
        return;
    }

    linkListContainer.innerHTML = links
        .map((link) => {
            const title = link.line_name || `${link.from_name} -> ${link.to_name}`;
            return `
                <article class="list-item">
                    <h3>${escapeHtml(title)}</h3>
                    <p class="meta">${escapeHtml(link.from_name)} (${escapeHtml(link.from_type)}) -> ${escapeHtml(link.to_name)} (${escapeHtml(link.to_type)})</p>
                    <div class="row-actions">
                        ${actionIcon("focus-link", "Lihat jalur pada peta", link.id)}
                        ${actionIcon("edit-link", "Edit jalur", link.id)}
                        ${actionIcon("delete-link", "Hapus jalur", link.id, "danger")}
                    </div>
                </article>
            `;
        })
        .join("");
}

function resetLinkForm() {
    if (!linkId || !linkModeBadge || !addLinkBtn) {
        return;
    }

    linkId.value = "";
    linkName.value = "";
    linkModeBadge.textContent = "Mode: Tambah";
    addLinkBtn.textContent = "Tambah Jalur";
}

function fillLinkForm(link) {
    if (!linkId || !linkModeBadge || !addLinkBtn) {
        return;
    }

    linkId.value = String(link.id);
    linkFromId.value = String(link.from_infra_id);
    linkToId.value = String(link.to_infra_id);
    linkName.value = link.line_name || "";
    linkModeBadge.textContent = "Mode: Edit";
    addLinkBtn.textContent = "Simpan Perubahan Jalur";
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
        const marker = L.marker([item.latitude, item.longitude], {
            draggable: isPointEditMode,
            icon: infrastructureMarkerIcon(item.infra_type)
        }).addTo(markerLayer);

        const popup = `
            <div class="popup-card">
                <strong>${escapeHtml(item.name)}</strong><br>
                Tipe: ${escapeHtml(item.infra_type)}<br>
                Aset: ${escapeHtml(item.asset_name || "-")}<br>
                Status: ${escapeHtml(item.status || "-")}<br>
                Lat/Lng: ${item.latitude}, ${item.longitude}
                <div class="row-actions popup-actions" style="margin-top:8px">
                    ${actionIcon("edit-point", "Edit titik", item.id)}
                </div>
            </div>
        `;
        marker.bindPopup(popup);
        marker.on("popupopen", () => {
            const popupElement = marker.getPopup() && marker.getPopup().getElement ? marker.getPopup().getElement() : null;
            if (!popupElement) {
                return;
            }

            const handlePopupClick = async (event) => {
                const target = event.target;
                if (!(target instanceof HTMLElement)) {
                    return;
                }

                const action = target.dataset.action;
                if (action !== "edit-point") {
                    return;
                }

                openInfraEditForm(item, marker);
            };

            popupElement.addEventListener("click", handlePopupClick);
            marker.once("popupclose", () => {
                popupElement.removeEventListener("click", handlePopupClick);
            });
        });
        marker.on("dragend", async () => {
            const latLng = marker.getLatLng();
            try {
                await updateInfrastructureCoordinates(item.id, latLng.lat, latLng.lng);
                await loadAllInfraData();
                await loadData();
                await loadInfraLinks();
            } catch (error) {
                window.alert(error.message);
                marker.setLatLng([item.latitude, item.longitude]);
            }
        });
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
                        ${actionIcon("focus", "Lihat titik pada peta", item.id)}
                        ${actionIcon("edit", "Edit titik", item.id)}
                        ${actionIcon("delete", "Hapus titik", item.id, "danger")}
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
    renderSummary();
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
    renderSummary();
}

async function loadAllInfraData() {
    const response = await fetch("/api/infra");
    const result = await response.json();

    if (!result.ok) {
        throw new Error(result.message || "Gagal mengambil data titik infrastruktur.");
    }

    allInfraData = result.data;
    renderLinkPointOptions();
    renderSummary();
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
    renderSummary();
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

async function updateInfrastructureCoordinates(id, latitude, longitude) {
    const response = await fetch(`/api/infra/${id}/coordinates`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude, longitude })
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
        throw new Error(result.message || "Gagal memperbarui koordinat titik.");
    }
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

async function updateInfraLink(id) {
    const fromId = Number(linkFromId.value);
    const toId = Number(linkToId.value);
    if (!fromId || !toId) {
        throw new Error("Pilih titik asal dan tujuan jalur.");
    }

    const response = await fetch(`/api/infra-links/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            from_infra_id: fromId,
            to_infra_id: toId,
            line_name: linkName.value.trim()
        })
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
        throw new Error(result.message || "Gagal memperbarui jalur.");
    }

    resetLinkForm();
    await loadInfraLinks();
}

async function removeInfraLink(id) {
    const response = await fetch(`/api/infra-links/${id}`, { method: "DELETE" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) {
        throw new Error(result.message || "Gagal menghapus jalur.");
    }

    if (linkId?.value === String(id)) {
        resetLinkForm();
    }
    await loadInfraLinks();
    renderSummary();
}

async function deleteData(id) {
    const response = await fetch(`/api/infra/${id}`, { method: "DELETE" });
    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.ok) {
        throw new Error(result.message || "Gagal menghapus data.");
    }

    if (fieldId.value === String(id)) {
        resetForm();
    }

    await loadAllInfraData();
    await loadData();
    await loadInfraLinks();
    return Number(result.deleted_link_count || 0);
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
            openInfraEditForm(item);
            map.flyTo([item.latitude, item.longitude], 16, { duration: 0.7 });
            return;
        }

        if (action === "delete") {
            const connectedRoutes = infraLinks.filter(
                (link) => link.from_infra_id === id || link.to_infra_id === id
            ).length;
            const routeWarning = connectedRoutes
                ? ` ${connectedRoutes} jalur yang terhubung juga akan dihapus.`
                : "";
            const yes = window.confirm(`Hapus titik ${item.name}?${routeWarning} Tindakan ini tidak dapat dibatalkan.`);
            if (yes) {
                const deletedRoutes = await deleteData(id);
                const resultText = deletedRoutes
                    ? `Titik dan ${deletedRoutes} jalur terkait berhasil dihapus.`
                    : "Titik berhasil dihapus.";
                window.alert(resultText);
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

            if (action === "edit-link") {
                fillLinkForm(link);
                return;
            }

            if (action === "delete-link") {
                const routeName = link.line_name || `${link.from_name} ke ${link.to_name}`;
                const yes = window.confirm(`Hapus jalur "${routeName}"? Tindakan ini tidak dapat dibatalkan.`);
                if (!yes) {
                    return;
                }
                await removeInfraLink(id);
                window.alert("Jalur berhasil dihapus.");
            }
        } catch (error) {
            window.alert(error.message);
        }
    });
}

if (addLinkBtn) {
    addLinkBtn.addEventListener("click", async () => {
        try {
            const editingId = Number(linkId?.value);
            if (editingId) {
                await updateInfraLink(editingId);
            } else {
                await addInfraLink();
            }
        } catch (error) {
            window.alert(error.message);
        }
    });
}

if (resetLinkBtn) {
    resetLinkBtn.addEventListener("click", resetLinkForm);
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

if (editPointsOnMapBtn) {
    editPointsOnMapBtn.addEventListener("click", () => {
        isPointEditMode = !isPointEditMode;
        updatePointEditButton();
        renderMarkers(cachedData);
    });
}

if (editRouteGeometryBtn) {
    editRouteGeometryBtn.addEventListener("click", () => {
        isRouteGeometryEditMode = !isRouteGeometryEditMode;
        updateRouteGeometryEditButton();
    });
}

if (closeFormPanelBtn) {
    closeFormPanelBtn.addEventListener("click", () => {
        resetForm();
    });
}

if (formPanelBackdrop) {
    formPanelBackdrop.addEventListener("click", () => {
        resetForm();
    });
}

fieldType.addEventListener("change", () => {
    const selectedAsset = fieldAssetName.value;
    refreshAssetControls(selectedAsset);
});

resetBtn.addEventListener("click", resetForm);
filterType.addEventListener("change", async () => {
    try {
        await loadData();
        renderLinkLines();
        renderLinkList();
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
        updatePointEditButton();
        updateRouteGeometryEditButton();

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
