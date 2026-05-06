/**
 * SPA router mínimo — gestiona navegación por hash y estado global.
 */
import { getToken, clearToken, api } from "./api.js";

// Estado global compartido por componentes
export const store = {
  user: null,
  allFlags: null,  // { flags, users }
};

export function toast(msg, type = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

async function loadUser() {
  if (!getToken()) return null;
  try {
    store.user = await api.me();
    return store.user;
  } catch {
    clearToken();
    return null;
  }
}

function updateNav() {
  const navUser    = document.getElementById("nav-user");
  const navAdmin   = document.getElementById("nav-admin");
  const navLogout  = document.getElementById("nav-logout");
  // mobile menu mirrors
  const menuUser   = document.getElementById("nav-menu-user");
  const menuAdmin  = document.getElementById("nav-menu-admin");
  const menuLogout = document.getElementById("nav-menu-logout");

  if (store.user) {
    const isAdmin = store.user.role === "admin";
    navUser.textContent  = store.user.username;
    navAdmin.style.display  = isAdmin ? "inline" : "none";
    navLogout.style.display = "inline";

    menuUser.textContent    = store.user.username;
    menuAdmin.style.display  = isAdmin ? "flex" : "none";
    menuLogout.style.display = "flex";
  } else {
    navUser.textContent  = "";
    navAdmin.style.display  = "none";
    navLogout.style.display = "none";

    menuUser.textContent    = "";
    menuAdmin.style.display  = "none";
    menuLogout.style.display = "none";
  }
}

function closeNavMenu() {
  const menu = document.getElementById("nav-menu");
  if (menu) menu.hidden = true;
}

async function route() {
  const hash = window.location.hash || "#/";
  const main = document.getElementById("main-content");

  // Pages that don't require auth
  if (hash.startsWith("#/login")) {
    main.innerHTML = `<login-page></login-page>`;
    return;
  }
  if (hash.startsWith("#/register")) {
    // El token viene en el hash como #/register?token=xxx
    const hashParams = new URLSearchParams(hash.split("?")[1] ?? "");
    const token = hashParams.get("token") ?? new URLSearchParams(window.location.search).get("token") ?? "";
    main.innerHTML = `<register-page data-token="${token}"></register-page>`;
    return;
  }
  if (hash.startsWith("#/reset-password")) {
    const hashParams = new URLSearchParams(hash.split("?")[1] ?? "");
    const token = hashParams.get("token") ?? "";
    main.innerHTML = `<reset-password-page data-token="${token}"></reset-password-page>`;
    return;
  }

  // Require auth for everything else
  if (!store.user) {
    window.location.hash = "#/login";
    return;
  }

  if (hash.startsWith("#/admin")) {
    if (store.user.role !== "admin") {
      window.location.hash = "#/";
      return;
    }
    main.innerHTML = `<admin-panel></admin-panel>`;
    return;
  }

  // Default: pokemon list
  main.innerHTML = `<pokemon-list></pokemon-list>`;
}

// Bootstrap
(async () => {
  await loadUser();
  updateNav();

  // Desktop logout
  document.getElementById("nav-logout")?.addEventListener("click", () => {
    clearToken();
    store.user = null;
    updateNav();
    window.location.hash = "#/login";
  });

  // Mobile logout
  document.getElementById("nav-menu-logout")?.addEventListener("click", () => {
    closeNavMenu();
    clearToken();
    store.user = null;
    updateNav();
    window.location.hash = "#/login";
  });

  // Hamburger toggle
  document.getElementById("nav-hamburger")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const menu = document.getElementById("nav-menu");
    if (menu) menu.hidden = !menu.hidden;
  });

  // Close menu on outside click
  document.addEventListener("click", (e) => {
    const menu = document.getElementById("nav-menu");
    if (!menu || menu.hidden) return;
    if (!menu.contains(e.target) && e.target.id !== "nav-hamburger") {
      menu.hidden = true;
    }
  });

  // Close menu on nav link click
  document.getElementById("nav-menu")?.addEventListener("click", (e) => {
    if (e.target.classList.contains("nav-menu-link")) closeNavMenu();
  });

  window.addEventListener("hashchange", async () => {
    await loadUser();
    updateNav();
    route();
  });

  // Refresh user & nav on auth events
  window.addEventListener("auth:login", async () => {
    await loadUser();
    updateNav();
    route();
  });

  route();
})();
