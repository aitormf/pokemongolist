import { LitElement, html } from "lit";
import { api } from "../api.js";

class ResetPasswordPage extends LitElement {
  static properties = {
    _error: { type: String, state: true },
    _loading: { type: Boolean, state: true },
    _done: { type: Boolean, state: true },
    _token: { type: String, state: true },
  };

  createRenderRoot() { return this; }

  constructor() {
    super();
    this._error = "";
    this._loading = false;
    this._done = false;
    this._token = "";
  }

  connectedCallback() {
    super.connectedCallback();
    const hash = window.location.hash;
    const hashParams = new URLSearchParams(hash.split("?")[1] ?? "");
    this._token =
      this.dataset.token ||
      hashParams.get("token") ||
      new URLSearchParams(window.location.search).get("token") ||
      "";
  }

  async _submit(e) {
    e.preventDefault();
    this._error = "";
    const form = e.target;
    const newPassword = form.new_password.value;
    const confirm = form.confirm.value;

    if (newPassword !== confirm) {
      this._error = "Las contraseñas no coinciden";
      return;
    }

    this._loading = true;
    try {
      await api.resetPassword(this._token, newPassword);
      this._done = true;
    } catch (err) {
      this._error = err.message;
    } finally {
      this._loading = false;
    }
  }

  render() {
    if (!this._token) {
      return html`
        <div class="auth-container">
          <h1>Resetear contraseña</h1>
          <div class="auth-error">Enlace no válido o incompleto.</div>
          <p style="text-align:center;margin-top:1rem;font-size:0.85rem">
            <a href="#/login">Volver al login</a>
          </p>
        </div>
      `;
    }

    if (this._done) {
      return html`
        <div class="auth-container">
          <h1>Contraseña actualizada</h1>
          <div class="card" style="text-align:center;padding:1.5rem">
            <p style="margin-bottom:1rem">Tu contraseña ha sido cambiada correctamente.</p>
            <a href="#/login" class="btn btn-primary">Iniciar sesión</a>
          </div>
        </div>
      `;
    }

    return html`
      <div class="auth-container">
        <h1>Nueva contraseña</h1>
        ${this._error ? html`<div class="auth-error">${this._error}</div>` : ""}
        <form class="card" @submit=${this._submit}>
          <div class="form-group">
            <label>Nueva contraseña</label>
            <input name="new_password" type="password" minlength="6" autocomplete="new-password" required />
          </div>
          <div class="form-group">
            <label>Confirmar contraseña</label>
            <input name="confirm" type="password" autocomplete="new-password" required />
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%" ?disabled=${this._loading}>
            ${this._loading ? html`<span class="spinner"></span>` : "Guardar contraseña"}
          </button>
        </form>
        <p style="text-align:center;margin-top:1rem;font-size:0.85rem;color:var(--color-text-muted)">
          <a href="#/login">Volver al login</a>
        </p>
      </div>
    `;
  }
}

customElements.define("reset-password-page", ResetPasswordPage);
