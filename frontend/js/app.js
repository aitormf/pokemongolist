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
  const navUser = document.getElementById("nav-user");
  const navAdmin = document.getElementById("nav-admin");
  const navLogout = document.getElementById("nav-logout");

  if (store.user) {
    navUser.textContent = store.user.username;
    navAdmin.style.display = store.user.role === "admin" ? "inline" : "none";
    navLogout.style.display = "inline";
  } else {
    navUser.textContent = "";
    navAdmin.style.display = "none";
    navLogout.style.display = "none";
  }
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

  // Navigation handlers
  document.getElementById("nav-logout")?.addEventListener("click", () => {
    clearToken();
    store.user = null;
    updateNav();
    window.location.hash = "#/login";
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
