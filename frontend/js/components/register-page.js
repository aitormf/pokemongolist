import { LitElement, html } from "lit";
import { api, setToken } from "../api.js";

class RegisterPage extends LitElement {
  static properties = {
    error: { type: String },
    loading: { type: Boolean },
    token: { type: String },
  };

  createRenderRoot() { return this; }

  constructor() {
    super();
    this.error = "";
    this.loading = false;
    this.token = "";
  }

  connectedCallback() {
    super.connectedCallback();
    // Token puede venir del atributo data-token (puesto por el router) o del hash/query
    const hash = window.location.hash;
    const hashParams = new URLSearchParams(hash.split("?")[1] ?? "");
    this.token =
      this.dataset.token ||
      hashParams.get("token") ||
      new URLSearchParams(window.location.search).get("token") ||
      "";
  }

  async _submit(e) {
    e.preventDefault();
    this.error = "";
    this.loading = true;
    const form = e.target;
    const username = form.username.value.trim();
    const password = form.password.value;
    const confirm = form.confirm.value;

    if (password !== confirm) {
      this.error = "Las contraseñas no coinciden";
      this.loading = false;
      return;
    }

    try {
      const data = await api.register(this.token, username, password);
      setToken(data.access_token);
      window.dispatchEvent(new CustomEvent("auth:login"));
      window.location.hash = "#/";
    } catch (err) {
      this.error = err.message;
    } finally {
      this.loading = false;
    }
  }

  render() {
    if (!this.token) {
      return html`
        <div class="auth-container">
          <h1>Registro</h1>
          <div class="auth-error">Necesitas un link de invitación válido para registrarte.</div>
        </div>
      `;
    }

    return html`
      <div class="auth-container">
        <h1>Crear cuenta</h1>
        ${this.error ? html`<div class="auth-error">${this.error}</div>` : ""}
        <form class="card" @submit=${this._submit}>
          <div class="form-group">
            <label>Usuario</label>
            <input name="username" type="text" minlength="3" maxlength="32" required />
          </div>
          <div class="form-group">
            <label>Contraseña</label>
            <input name="password" type="password" minlength="6" required />
          </div>
          <div class="form-group">
            <label>Confirmar contraseña</label>
            <input name="confirm" type="password" required />
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%" ?disabled=${this.loading}>
            ${this.loading ? html`<span class="spinner"></span>` : "Registrarse"}
          </button>
        </form>
        <p style="text-align:center;margin-top:1rem;font-size:0.85rem;color:var(--color-text-muted)">
          ¿Ya tienes cuenta? <a href="#/login">Iniciar sesión</a>
        </p>
      </div>
    `;
  }
}

customElements.define("register-page", RegisterPage);
