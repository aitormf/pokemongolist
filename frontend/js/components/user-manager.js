import { LitElement, html } from "lit";
import { api } from "../api.js";
import { store, toast } from "../app.js";

class UserManager extends LitElement {
  static properties = {
    _users: { type: Array, state: true },
    _loading: { type: Boolean, state: true },
  };

  createRenderRoot() { return this; }

  constructor() {
    super();
    this._users = [];
    this._loading = true;
  }

  async connectedCallback() {
    super.connectedCallback();
    await this._load();
  }

  async _load() {
    this._loading = true;
    try {
      this._users = await api.listUsers();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      this._loading = false;
    }
  }

  async _changeRole(user) {
    const newRole = user.role === "admin" ? "user" : "admin";
    if (!confirm(`¿Cambiar rol de ${user.username} a ${newRole}?`)) return;
    try {
      await api.changeRole(user.id, newRole);
      toast(`Rol actualizado a ${newRole}`);
      await this._load();
    } catch (err) {
      toast(err.message, "error");
    }
  }

  async _delete(user) {
    if (!confirm(`¿Eliminar usuario "${user.username}"? Esta acción no se puede deshacer.`)) return;
    try {
      await api.deleteUser(user.id);
      toast(`Usuario ${user.username} eliminado`);
      await this._load();
    } catch (err) {
      toast(err.message, "error");
    }
  }

  render() {
    if (this._loading) return html`<span class="spinner"></span>`;

    return html`
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
          <h3 style="font-size:1rem">Usuarios (${this._users.length})</h3>
        </div>
        <div class="card" style="padding:0;overflow:hidden">
          <table>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Creado</th>
                <th>Idioma</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${this._users.map((u) => html`
                <tr>
                  <td style="font-weight:600">${u.username}</td>
                  <td>
                    <span style="
                      font-size:0.75rem;
                      padding:0.15rem 0.5rem;
                      border-radius:999px;
                      background:${u.role === "admin" ? "rgba(233,69,96,0.2)" : "rgba(255,255,255,0.05)"};
                      color:${u.role === "admin" ? "var(--color-primary)" : "var(--color-text-muted)"};
                      border:1px solid ${u.role === "admin" ? "var(--color-primary)" : "var(--color-border)"};
                    ">${u.role}</span>
                  </td>
                  <td style="color:var(--color-text-muted);font-size:0.8rem">
                    ${new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td style="color:var(--color-text-muted);font-size:0.8rem">${u.language}</td>
                  <td>
                    ${u.id !== store.user?.id ? html`
                      <div style="display:flex;gap:0.5rem">
                        <button class="btn btn-ghost" style="font-size:0.75rem;padding:0.25rem 0.5rem"
                          @click=${() => this._changeRole(u)}>
                          ${u.role === "admin" ? "→ user" : "→ admin"}
                        </button>
                        <button class="btn btn-danger" style="font-size:0.75rem;padding:0.25rem 0.5rem"
                          @click=${() => this._delete(u)}>
                          Eliminar
                        </button>
                      </div>
                    ` : html`<span style="font-size:0.75rem;color:var(--color-text-muted)">Tú</span>`}
                  </td>
                </tr>
              `)}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }
}

customElements.define("user-manager", UserManager);
