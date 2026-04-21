import { LitElement, html } from "lit";

class AdminPanel extends LitElement {
  static properties = {
    _tab: { type: String, state: true },
  };

  createRenderRoot() { return this; }

  constructor() {
    super();
    this._tab = "users";
  }

  render() {
    return html`
      <div>
        <h2 style="font-size:1.25rem;margin-bottom:1.25rem">Panel de administración</h2>

        <div class="admin-tabs">
          ${["users", "invites", "sources"].map((tab) => {
            const labels = { users: "Usuarios", invites: "Invitaciones", sources: "Fuentes de datos" };
            return html`
              <button
                class="admin-tab ${this._tab === tab ? "active" : ""}"
                @click=${() => { this._tab = tab; }}
              >${labels[tab]}</button>
            `;
          })}
        </div>

        <div>
          ${this._tab === "users" ? html`<user-manager></user-manager>` : ""}
          ${this._tab === "invites" ? html`<invite-creator></invite-creator>` : ""}
          ${this._tab === "sources" ? html`<source-updater></source-updater>` : ""}
        </div>
      </div>
    `;
  }
}

customElements.define("admin-panel", AdminPanel);
