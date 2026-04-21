import { LitElement, html } from "lit";
import { api } from "../api.js";
import { store, toast } from "../app.js";

/**
 * <pokemon-list>
 * Componente principal que orquesta filtros, vista tabla/grid y carga de datos.
 */
class PokemonList extends LitElement {
  static properties = {
    _pokemon: { type: Array, state: true },
    _flags: { type: Object, state: true },
    _users: { type: Array, state: true },
    _loading: { type: Boolean, state: true },
    _view: { type: String, state: true },
    _flagFilters: { type: Array, state: true },
    _userFilters: { type: Array, state: true },
    _search: { type: String, state: true },
  };

  createRenderRoot() { return this; }

  constructor() {
    super();
    this._pokemon = [];
    this._flags = {};
    this._users = [];
    this._loading = true;
    this._view = localStorage.getItem("view") || "table";
    this._flagFilters = [];
    this._userFilters = [];
    this._search = "";
  }

  async connectedCallback() {
    super.connectedCallback();
    await this._loadData();

    // Actualizar flags en tiempo real cuando un flag-toggle cambia
    this.addEventListener("flag-changed", (e) => {
      const { formId, flagName, value } = e.detail;
      const username = store.user?.username;
      if (!username) return;
      const flags = { ...this._flags };
      if (!flags[formId]) flags[formId] = {};
      if (!flags[formId][username]) flags[formId][username] = {};
      if (value) {
        flags[formId][username][flagName] = true;
      } else {
        delete flags[formId][username][flagName];
      }
      this._flags = flags;
    });
  }

  async _loadData() {
    this._loading = true;
    try {
      const [flagsData] = await Promise.all([api.getAllFlags()]);
      this._flags = flagsData.flags;
      this._users = flagsData.users;

      await this._loadPokemon();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      this._loading = false;
    }
  }

  async _loadPokemon() {
    const params = {};
    if (this._flagFilters.length) params.flag_filter = this._flagFilters;
    if (this._userFilters.length) params.users = this._userFilters;
    this._pokemon = await api.listPokemon(params);
  }

  _onFiltersChanged(e) {
    this._flagFilters = e.detail.flagFilters;
    this._userFilters = e.detail.users;
    this._loadPokemon();
  }

  _setView(v) {
    this._view = v;
    localStorage.setItem("view", v);
  }

  get _filteredPokemon() {
    if (!this._search) return this._pokemon;
    const q = this._search.toLowerCase();
    return this._pokemon.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        String(p.pokedex_number).includes(q) ||
        p.pokemon_id.toLowerCase().includes(q)
    );
  }

  render() {
    if (this._loading) {
      return html`
        <div style="display:flex;justify-content:center;padding:4rem">
          <span class="spinner" style="width:40px;height:40px;border-width:3px"></span>
        </div>
      `;
    }

    return html`
      <div class="layout-with-filters">
        <pokemon-filters
          .users=${this._users}
          @filters-changed=${this._onFiltersChanged}
        ></pokemon-filters>

        <div class="content-area">
          <div class="view-controls">
            <input
              type="text"
              placeholder="Buscar Pokémon..."
              style="flex:1;max-width:300px"
              .value=${this._search}
              @input=${(e) => { this._search = e.target.value; }}
            />
            <button
              class="btn view-toggle-btn ${this._view === "table" ? "active" : ""}"
              title="Vista tabla"
              @click=${() => this._setView("table")}
            >☰</button>
            <button
              class="btn view-toggle-btn ${this._view === "grid" ? "active" : ""}"
              title="Vista tarjetas"
              @click=${() => this._setView("grid")}
            >⊞</button>
            <span style="font-size:0.8rem;color:var(--color-text-muted)">
              ${this._filteredPokemon.length} Pokémon
            </span>
          </div>

          ${this._view === "table"
            ? html`
              <pokemon-table
                .pokemon=${this._filteredPokemon}
                .flags=${this._flags}
                .users=${this._users}
                .currentUser=${store.user}
              ></pokemon-table>
            `
            : html`
              <div class="pokemon-grid">
                ${this._filteredPokemon.map(
                  (p) => html`
                    <pokemon-card
                      .pokemon=${p}
                      .flags=${this._flags?.[p.id] ?? {}}
                      .users=${this._users}
                      .currentUser=${store.user}
                    ></pokemon-card>
                  `
                )}
              </div>
            `}
        </div>
      </div>
    `;
  }
}

customElements.define("pokemon-list", PokemonList);
