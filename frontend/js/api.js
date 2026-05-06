/**
 * API client — thin wrapper over fetch().
 * Token is stored in localStorage and attached to every request.
 */

const API_BASE = "/api";

export function getToken() {
  return localStorage.getItem("token");
}

export function setToken(token) {
  localStorage.setItem("token", token);
}

export function clearToken() {
  localStorage.removeItem("token");
}

async function request(method, path, body = null) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body !== null) opts.body = JSON.stringify(body);

  const res = await fetch(API_BASE + path, opts);

  if (res.status === 401) {
    clearToken();
    window.location.hash = "#/login";
    throw new Error("No autenticado");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Error desconocido");
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export const api = {
  // Auth
  login: (username, password) =>
    request("POST", "/auth/login", { username, password }),
  register: (token, username, password) =>
    request("POST", "/auth/register", { token, username, password }),
  me: () => request("GET", "/auth/me"),
  updateLanguage: (language) =>
    request("PATCH", "/auth/me/language", { language }),

  // Pokémon
  listPokemon: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.flag_filter) {
      for (const f of params.flag_filter) qs.append("flag_filter", f);
    }
    if (params.users) {
      for (const u of params.users) qs.append("users", u);
    }
    const q = qs.toString();
    return request("GET", `/pokemon${q ? "?" + q : ""}`);
  },
  getPokemon: (formId) => request("GET", `/pokemon/${encodeURIComponent(formId)}`),

  // Flags
  getAllFlags: () => request("GET", "/flags"),
  setFlag: (formId, flagName) =>
    request("PUT", `/flags/${encodeURIComponent(formId)}/${flagName}`),
  unsetFlag: (formId, flagName) =>
    request("DELETE", `/flags/${encodeURIComponent(formId)}/${flagName}`),

  // Admin
  listUsers: () => request("GET", "/admin/users"),
  changeRole: (userId, role) =>
    request("PATCH", `/admin/users/${userId}/role`, { role }),
  deleteUser: (userId) => request("DELETE", `/admin/users/${userId}`),
  generateResetToken: (userId) => request("POST", `/admin/users/${userId}/reset-token`),
  resetPassword: (token, newPassword) =>
    request("POST", "/auth/reset-password", { token, new_password: newPassword }),
  listInvites: () => request("GET", "/admin/invites"),
  createInvite: () => request("POST", "/admin/invites"),
  deleteInvite: (inviteId) => request("DELETE", `/admin/invites/${inviteId}`),
  sourcesStatus: () => request("GET", "/admin/sources/status"),
  checkVersions: () => request("POST", "/admin/sources/check"),
  updateGameMaster: () => request("POST", "/admin/sources/update/game_master"),
  updateTranslations: () => request("POST", "/admin/sources/update/translations"),
  updateAssets: () => request("POST", "/admin/sources/update/assets"),
};
