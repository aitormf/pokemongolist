import { LitElement, html } from "lit";
import { api } from "../api.js";
import { toast } from "../app.js";

const SOURCE_LABELS = {
  game_master: "Game Master",
  translations: "Traducciones",
  assets: "Assets (shiny)",
};

const SOURCE_DESCRIPTIONS = {
  game_master: "Datos de Pokémon del juego (stats, movimientos, tipos)",
  translations: "Nombres de Pokémon en todos los idiomas",
  assets: "Detección de qué Pokémon tienen shiny disponible",
};

class SourceUpdater extends LitElement {
  static properties = {
    _sources: { type: Array, state: true },
    _loading: { type: Boolean, state: true },
    _updating: { type: Object, state: true },
    _checking: { type: Boolean, state: true },
  };

  createRenderRoot() { return this; }

  constructor() {
    super();
    this._sources = [];
    this._loading = true;
    this._updating = {};
    this._checking = false;
  }

  async connectedCallback() {
    super.connectedCallback();
    await this._load();
  }

  async _load() {
    this._loading = true;
    try {
      this._sources = await api.sourcesStatus();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      this._loading = false;
    }
  }

  async _checkVersions() {
    this._checking = true;
    try {
      await api.checkVersions();
      await this._load();
      toast("Versiones actualizadas");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      this._checking = false;
    }
  }

  async _update(sourceName) {
    this._updating = { ...this._updating, [sourceName]: true };
    try {
      let result;
      if (sourceName === "game_master") result = await api.updateGameMaster();
      else if (sourceName === "translations") result = await api.updateTranslations();
      else if (sourceName === "assets") result = await api.updateAssets();

      toast(`${SOURCE_LABELS[sourceName]} actualizado`);
      await this._load();
    } catch (err) {
      toast(`Error: ${err.message}`, "error");
    } finally {
      const updated = { ...this._updating };
      delete updated[sourceName];
      this._updating = updated;
    }
  }

  render() {
    if (this._loading) return html`<span class="spinner"></span>`;

    return html`
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
          <h3 style="font-size:1rem">Fuentes de datos</h3>
          <button class="btn btn-ghost" @click=${this._checkVersions} ?disabled=${this._checking}>
            ${this._checking ? html`<span class="spinner"></span>` : "↻ Comprobar versiones"}
          </button>
        </div>

        <div class="card" style="padding:0">
          ${this._sources.map((s) => this._sourceRow(s))}
        </div>
      </div>
    `;
  }

  _sourceRow(s) {
    const isUpdating = !!this._updating[s.source_name];
    return html`
      <div class="source-row">
        <div style="flex:1">
          <div class="source-name">${SOURCE_LABELS[s.source_name] ?? s.source_name}</div>
          <div style="font-size:0.75rem;color:var(--color-text-muted)">${SOURCE_DESCRIPTIONS[s.source_name] ?? ""}</div>
        </div>
        <div class="source-version">
          <div>Local: <strong>${s.local_version ?? "—"}</strong></div>
          <div>Remoto: <strong>${s.remote_version ?? "—"}</strong></div>
          ${s.last_updated_at ? html`
            <div style="font-size:0.7rem;color:var(--color-text-muted)">
              Actualizado: ${new Date(s.last_updated_at).toLocaleString()}
            </div>
          ` : ""}
        </div>
        <div style="display:flex;flex-direction:column;gap:0.5rem;align-items:flex-end">
          ${s.update_available
            ? html`<span class="update-badge">Actualización disponible</span>`
            : s.local_version
              ? html`<span class="up-to-date-badge">Al día</span>`
              : html`<span style="font-size:0.75rem;color:var(--color-text-muted)">Sin datos locales</span>`}
          <button
            class="btn btn-secondary"
            style="font-size:0.8rem"
            @click=${() => this._update(s.source_name)}
            ?disabled=${isUpdating}
          >
            ${isUpdating
              ? html`<span class="spinner" style="width:14px;height:14px;border-width:2px"></span> Actualizando...`
              : "Actualizar"}
          </button>
        </div>
      </div>
    `;
  }
}

customElements.define("source-updater", SourceUpdater);
