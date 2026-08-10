const menuToggleButtons = document.querySelectorAll(".menu-toggle");
const bottomNav = document.querySelector(".bottom-nav");
let lastScrollY = window.scrollY;

function ensureAdminTopNav() {
    document.querySelectorAll(".menu-bar").forEach((menu) => {
        const adminLink = menu.querySelector('a[href="/admin-account"]');
        if (adminLink) {
            return;
        }

        const landingLink = menu.querySelector('a[target="_blank"]');
        const link = document.createElement("a");
        link.href = "/admin-account";
        link.textContent = "Admin";
        if (window.location.pathname === "/admin-account") {
            link.classList.add("active");
        }

        if (landingLink) {
            menu.insertBefore(link, landingLink);
        } else {
            menu.appendChild(link);
        }
    });
}

function ensureAdminBottomNav() {
    if (!bottomNav) {
        return;
    }

    const adminLink = bottomNav.querySelector('a[href="/admin-account"]');
    if (adminLink) {
        return;
    }

    const link = document.createElement("a");
    link.href = "/admin-account";
    link.innerHTML = '<span class="nav-icon">AD</span><span class="nav-label">Admin</span>';
    if (window.location.pathname === "/admin-account") {
        link.classList.add("active");
    }
    bottomNav.appendChild(link);
}

ensureAdminTopNav();
ensureAdminBottomNav();

menuToggleButtons.forEach((button) => {
    button.addEventListener("click", () => {
        const targetId = button.getAttribute("data-target");
        if (!targetId) {
            return;
        }

        const menu = document.getElementById(targetId);
        if (!menu) {
            return;
        }

        menu.classList.toggle("is-open");
    });
});

document.querySelectorAll(".menu-bar a").forEach((link) => {
    link.addEventListener("click", () => {
        document.querySelectorAll(".menu-bar.is-open").forEach((menu) => {
            menu.classList.remove("is-open");
        });
    });
});

window.addEventListener("scroll", () => {
    if (!bottomNav || window.innerWidth > 768) {
        return;
    }

    const currentY = window.scrollY;
    const delta = currentY - lastScrollY;

    if (currentY < 24) {
        bottomNav.classList.remove("is-hidden");
    } else if (delta > 8) {
        bottomNav.classList.add("is-hidden");
    } else if (delta < -8) {
        bottomNav.classList.remove("is-hidden");
    }

    lastScrollY = currentY;
});

window.addEventListener("resize", () => {
    if (window.innerWidth > 768) {
        document.querySelectorAll(".menu-bar.is-open").forEach((menu) => {
            menu.classList.remove("is-open");
        });
        if (bottomNav) {
            bottomNav.classList.remove("is-hidden");
        }
    }
});
