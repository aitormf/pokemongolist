import { LitElement, html, css } from "lit";
import { api, setToken } from "../api.js";

class LoginPage extends LitElement {
  static properties = {
    error: { type: String },
    loading: { type: Boolean },
  };

  // Use light DOM so global CSS applies
  createRenderRoot() { return this; }

  constructor() {
    super();
    this.error = "";
    this.loading = false;
  }

  async _submit(e) {
    e.preventDefault();
    this.error = "";
    this.loading = true;
    const form = e.target;
    const username = form.username.value.trim();
    const password = form.password.value;
    try {
      const data = await api.login(username, password);
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
    return html`
      <div class="auth-container">
        <h1>Iniciar sesión</h1>
        ${this.error ? html`<div class="auth-error">${this.error}</div>` : ""}
        <form class="card" @submit=${this._submit}>
          <div class="form-group">
            <label for="username">Usuario</label>
            <input id="username" name="username" type="text" autocomplete="username" required />
          </div>
          <div class="form-group">
            <label for="password">Contraseña</label>
            <input id="password" name="password" type="password" autocomplete="current-password" required />
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%" ?disabled=${this.loading}>
            ${this.loading ? html`<span class="spinner"></span>` : "Entrar"}
          </button>
        </form>
      </div>
    `;
  }
}

customElements.define("login-page", LoginPage);
