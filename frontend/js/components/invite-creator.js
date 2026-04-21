import { LitElement, html } from "lit";
import { api } from "../api.js";
import { toast } from "../app.js";

class InviteCreator extends LitElement {
  static properties = {
    _invites: { type: Array, state: true },
    _loading: { type: Boolean, state: true },
    _creating: { type: Boolean, state: true },
  };

  createRenderRoot() { return this; }

  constructor() {
    super();
    this._invites = [];
    this._loading = true;
    this._creating = false;
  }

  async connectedCallback() {
    super.connectedCallback();
    await this._load();
  }

  async _load() {
    this._loading = true;
    try {
      this._invites = await api.listInvites();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      this._loading = false;
    }
  }

  async _create() {
    this._creating = true;
    try {
      await api.createInvite();
      await this._load();
      toast("Invitación creada");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      this._creating = false;
    }
  }

  async _delete(invite) {
    if (!confirm("¿Eliminar esta invitación?")) return;
    try {
      await api.deleteInvite(invite.id);
      await this._load();
      toast("Invitación eliminada");
    } catch (err) {
      toast(err.message, "error");
    }
  }

  _inviteLink(token) {
    return `${window.location.origin}/#/register?token=${token}`;
  }

  _copyLink(token) {
    navigator.clipboard.writeText(this._inviteLink(token))
      .then(() => toast("Link copiado al portapapeles"))
      .catch(() => toast("No se pudo copiar", "error"));
  }

  _status(inv) {
    if (inv.used_at) return html`<span style="color:var(--color-text-muted)">Usada</span>`;
    if (inv.expires_at && new Date(inv.expires_at) < new Date())
      return html`<span style="color:var(--color-danger)">Expirada</span>`;
    return html`<span style="color:var(--color-success)">Activa</span>`;
  }

  render() {
    if (this._loading) return html`<span class="spinner"></span>`;

    const pending = this._invites.filter((i) => !i.used_at && !(i.expires_at && new Date(i.expires_at) < new Date()));

    return html`
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
          <h3 style="font-size:1rem">Invitaciones</h3>
          <button class="btn btn-primary" @click=${this._create} ?disabled=${this._creating}>
            ${this._creating ? html`<span class="spinner"></span>` : "+ Nueva invitación"}
          </button>
        </div>

        ${pending.length ? html`
          <div class="card" style="margin-bottom:1rem">
            <div style="font-size:0.8rem;color:var(--color-text-muted);margin-bottom:0.5rem">Invitaciones activas — comparte estos links:</div>
            ${pending.map((inv) => html`
              <div class="invite-link-box" style="margin-bottom:0.5rem">
                <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                  ${this._inviteLink(inv.token)}
                </span>
                <button class="btn btn-secondary" style="padding:0.25rem 0.5rem;font-size:0.75rem"
                  @click=${() => this._copyLink(inv.token)}>
                  Copiar
                </button>
              </div>
            `)}
          </div>
        ` : ""}

        <div class="card" style="padding:0;overflow:hidden">
          <table>
            <thead>
              <tr>
                <th>Token</th>
                <th>Estado</th>
                <th>Creada</th>
                <th>Expira</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${this._invites.map((inv) => html`
                <tr>
                  <td style="font-family:monospace;font-size:0.75rem">${inv.token.slice(0, 8)}…</td>
                  <td>${this._status(inv)}</td>
                  <td style="font-size:0.8rem;color:var(--color-text-muted)">
                    ${new Date(inv.created_at).toLocaleDateString()}
                  </td>
                  <td style="font-size:0.8rem;color:var(--color-text-muted)">
                    ${inv.expires_at ? new Date(inv.expires_at).toLocaleDateString() : "—"}
                  </td>
                  <td>
                    ${!inv.used_at ? html`
                      <button class="btn btn-danger" style="font-size:0.75rem;padding:0.25rem 0.5rem"
                        @click=${() => this._delete(inv)}>
                        Eliminar
                      </button>
                    ` : ""}
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

customElements.define("invite-creator", InviteCreator);
