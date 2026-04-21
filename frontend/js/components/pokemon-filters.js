import { LitElement, html } from "lit";

/**
 * <pokemon-filters>
 * Emite evento "filters-changed" con { flagFilters: string[], users: int[] }
 * cuando el usuario cambia algún filtro.
 *
 * Propiedades:
 *   users — array de { id, username } de todos los usuarios
 */
class PokemonFilters extends LitElement {
  static properties = {
    users: { type: Array },
    _selectedFlags: { type: Array, state: true },
    _selectedUsers: { type: Array, state: true },
  };

  createRenderRoot() { return this; }

  constructor() {
    super();
    this.users = [];
    this._selectedFlags = [];
    this._selectedUsers = [];
  }

  _emitChange() {
    this.dispatchEvent(
      new CustomEvent("filters-changed", {
        bubbles: true,
        detail: {
          flagFilters: [...this._selectedFlags],
          users: [...this._selectedUsers],
        },
      })
    );
  }

  _toggleFlag(flag) {
    if (this._selectedFlags.includes(flag)) {
      this._selectedFlags = this._selectedFlags.filter((f) => f !== flag);
    } else {
      this._selectedFlags = [...this._selectedFlags, flag];
    }
    this._emitChange();
  }

  _toggleUser(userId) {
    if (this._selectedUsers.includes(userId)) {
      this._selectedUsers = this._selectedUsers.filter((u) => u !== userId);
    } else {
      this._selectedUsers = [...this._selectedUsers, userId];
    }
    this._emitChange();
  }

  _clearAll() {
    this._selectedFlags = [];
    this._selectedUsers = [];
    this._emitChange();
  }

  _flagChip(flag, label) {
    const active = this._selectedFlags.includes(flag);
    return html`
      <span
        class="flag-chip flag-${flag} ${active ? "active" : ""}"
        style="cursor:pointer"
        @click=${() => this._toggleFlag(flag)}
      >${label}</span>
    `;
  }

  render() {
    const hasFilters = this._selectedFlags.length || this._selectedUsers.length;
    return html`
      <div class="filters-panel">
        <div class="filters-title">Filtros</div>

        <div class="filters-section">
          <h4>Por flag</h4>
          <div style="display:flex;flex-wrap:wrap;gap:0.375rem">
            ${this._flagChip("quiero", "❤️ Quiero")}
            ${this._flagChip("tengo_100", "💎 100")}
            ${this._flagChip("tengo_shiny", "✨ Shiny")}
          </div>
          <p style="font-size:0.7rem;color:var(--color-text-muted);margin-top:0.5rem">
            Con múltiples flags se muestra la intersección.
          </p>
        </div>

        ${this.users.length
          ? html`
            <div class="filters-section">
              <h4>Por usuario</h4>
              ${this.users.map(
                (u) => html`
                  <label class="user-checkbox">
                    <input
                      type="checkbox"
                      .checked=${this._selectedUsers.includes(u.id)}
                      @change=${() => this._toggleUser(u.id)}
                    />
                    ${u.username}
                  </label>
                `
              )}
              <p style="font-size:0.7rem;color:var(--color-text-muted);margin-top:0.5rem">
                Con múltiples usuarios se muestra la intersección.
              </p>
            </div>
          `
          : ""}

        ${hasFilters
          ? html`
            <button class="btn btn-ghost" style="width:100%;margin-top:0.5rem" @click=${this._clearAll}>
              Limpiar filtros
            </button>
          `
          : ""}
      </div>
    `;
  }
}

customElements.define("pokemon-filters", PokemonFilters);
