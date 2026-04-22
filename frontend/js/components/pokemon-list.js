import { LitElement, html } from "lit";
import { api } from "../api.js";
import { store, toast } from "../app.js";

// Traducción de tipos al español para búsqueda
const TYPE_ES = {
  NORMAL: "normal", FIRE: "fuego", WATER: "agua", ELECTRIC: "eléctrico",
  GRASS: "planta", ICE: "hielo", FIGHTING: "lucha", POISON: "veneno",
  GROUND: "tierra", FLYING: "volador", PSYCHIC: "psíquico", BUG: "bicho",
  ROCK: "roca", GHOST: "fantasma", DRAGON: "dragón", DARK: "siniestro",
  STEEL: "acero", FAIRY: "hada",
};

/**
 * <pokemon-list>
 * Componente principal que orquesta filtros, vista tabla/grid y carga de datos.
 */
class PokemonList extends LitElement {
  static properties = {
    _pokemon:      { type: Array,   state: true },
    _flags:        { type: Object,  state: true },
    _users:        { type: Array,   state: true },
    _loading:      { type: Boolean, state: true },
    _view:         { type: String,  state: true },
    _flagFilters:  { type: Array,   state: true },
    _userFilters:  { type: Array,   state: true },
    _search:       { type: String,  state: true },
    _filtersOpen:  { type: Boolean, state: true },
  };

  createRenderRoot() { return this; }

  constructor() {
    super();
    this._pokemon     = [];
    this._flags       = {};
    this._users       = [];
    this._loading     = true;
    this._view        = this._initialView();
    this._flagFilters = [];
    this._userFilters = [];
    this._search      = "";
    this._filtersOpen = false;
  }

  _initialView() {
    // En móvil siempre tarjetas; en desktop respetar preferencia guardada
    if (window.innerWidth <= 768) return "grid";
    return localStorage.getItem("view") || "grid";
  }

  async connectedCallback() {
    super.connectedCallback();
    await this._loadData();

    this.addEventListener("flag-changed", (e) => {
      const { formId, flagName, value } = e.detail;
      const username = store.user?.username;
      if (!username) return;
      const flags = { ...this._flags };
      if (!flags[formId])          flags[formId] = {};
      if (!flags[formId][username]) flags[formId][username] = {};
      if (value) {
        flags[formId][username][flagName] = true;
      } else {
        delete flags[formId][username][flagName];
      }
      this._flags = flags;
    });

    // Cerrar filtros al hacer clic fuera del panel
    document.addEventListener("click", this._handleOutsideClick);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("click", this._handleOutsideClick);
  }

  _handleOutsideClick = (e) => {
    if (!this._filtersOpen) return;
    const panel = this.querySelector(".filters-dropdown");
    const btn   = this.querySelector(".filter-toggle-btn");
    if (panel && !panel.contains(e.target) && btn && !btn.contains(e.target)) {
      this._filtersOpen = false;
    }
  };

  async _loadData() {
    this._loading = true;
    try {
      const flagsData = await api.getAllFlags();
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

  get _activeFilterCount() {
    return this._flagFilters.length + this._userFilters.length;
  }

  get _filteredPokemon() {
    if (!this._search) return this._pokemon;
    const raw = this._search.trim().toLowerCase();
    // Permitir prefijo # para número de pokédex (ej: #25 → Pikachu)
    const q = raw.startsWith("#") ? raw.slice(1) : raw;
    const typeMatch = (type) => {
      if (!type) return false;
      return type.toLowerCase().includes(q) || (TYPE_ES[type] || "").includes(q);
    };
    return this._pokemon.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        String(p.pokedex_number).includes(q) ||
        p.pokemon_id.toLowerCase().includes(q) ||
        typeMatch(p.type1) ||
        typeMatch(p.type2)
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

    const count = this._activeFilterCount;
    const filterLabel = count ? `Filtros (${count})` : "Filtros";

    return html`
      <!-- Toolbar sticky -->
      <div class="list-toolbar">
        <div class="filter-toggle-btn-wrap">
          <button
            class="btn btn-ghost filter-toggle-btn ${this._filtersOpen ? "active" : ""} ${count ? "has-badge" : ""}"
            @click=${(e) => { e.stopPropagation(); this._filtersOpen = !this._filtersOpen; }}
          >
            <span class="filter-icon">⚙</span>
            <span class="filter-label">${filterLabel}</span>
          </button>

          <!-- Dropdown filtros (móvil) -->
          ${this._filtersOpen ? html`
            <div class="filters-dropdown" @click=${(e) => e.stopPropagation()}>
              <pokemon-filters
                .users=${this._users}
                @filters-changed=${this._onFiltersChanged}
              ></pokemon-filters>
            </div>
          ` : ""}
        </div>

        <input
          type="text"
          class="search-input"
          placeholder="Nombre, tipo (fuego…) o nº pokédex…"
          .value=${this._search}
          @input=${(e) => { this._search = e.target.value; }}
        />

        <!-- Botones de vista (solo desktop) -->
        <button
          class="btn view-toggle-btn desktop-only ${this._view === "table" ? "active" : ""}"
          title="Vista tabla"
          @click=${() => this._setView("table")}
        >☰</button>
        <button
          class="btn view-toggle-btn desktop-only ${this._view === "grid" ? "active" : ""}"
          title="Vista tarjetas"
          @click=${() => this._setView("grid")}
        >⊞</button>

        <span class="result-count">
          ${this._filteredPokemon.length} Pokémon
        </span>
      </div>

      <!-- Layout principal -->
      <div class="layout-with-filters">
        <!-- Sidebar filtros (solo desktop) -->
        <div class="filters-sidebar desktop-only">
          <pokemon-filters
            .users=${this._users}
            @filters-changed=${this._onFiltersChanged}
          ></pokemon-filters>
        </div>

        <div class="content-area">
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
