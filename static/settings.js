const companySettingsForm = document.getElementById("companySettingsForm");
const settingsMessage = document.getElementById("settingsMessage");

function setMessage(message, isError = false) {
    settingsMessage.textContent = message;
    settingsMessage.classList.toggle("error-text", isError);
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
