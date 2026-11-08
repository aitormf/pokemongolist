import { LitElement, html } from "lit";
import { api } from "../api.js";
import { store, toast } from "../app.js";

const SECTION_LABELS = {
  featured: "Destacados",
  spawns: "Apariciones",
  raids: "Incursiones",
  eggs: "Huevos",
  research: "Investigación",
  max_battles: "Combates Max",
  rocket: "Team GO Rocket",
  other: "Otros",
};
const SECTION_ORDER = Object.keys(SECTION_LABELS);

const EVENT_TYPE_LABELS = {
  "community-day": "Día de la Comunidad",
  "raid-battles": "Incursiones",
  "raid-hour": "Hora de incursiones",
  "raid-day": "Día de incursiones",
  "raid-weekend": "Fin de semana de incursiones",
  "elite-raids": "Incursiones de élite",
  "pokemon-spotlight-hour": "Hora destacada",
  "pokemon-go-fest": "GO Fest",
  "pokemon-go-tour": "GO Tour",
  "wild-area": "GO Wild Area",
  "go-battle-league": "Liga de Combates GO",
  "go-pass": "GO Pass",
  "max-battles": "Combates Max",
  "max-mondays": "Lunes Max",
  "timed-research": "Investigación temporal",
  "special-research": "Investigación especial",
  "research": "Investigación",
  "research-day": "Día de investigación",
  "ticketed-event": "Evento con entrada",
  "season": "Temporada",
  "event": "Evento",
};

const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
const dateFmt = new Intl.DateTimeFormat("es-ES", {
  weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
});

/** "2026-11-21T14:00:00.000" (sin Z) = hora local; el navegador ya lo interpreta así. */
function parseDate(s) {
  return s ? new Date(s) : null;
}

function relative(date) {
  const diffMs = date - Date.now();
  const abs = Math.abs(diffMs);
  const units = [["day", 86400e3], ["hour", 3600e3], ["minute", 60e3]];
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === "minute") return rtf.format(Math.round(diffMs / ms), unit);
  }
  return "";
}

/**
 * <events-page>
 * Pestaña de eventos: lo activo ahora mismo (incursiones, huevos, investigación,
 * Rocket) y eventos activos o próximos, con sus Pokémon cruzados con los flags.
 */
class EventsPage extends LitElement {
  static properties = {
    _current:   { type: Array,   state: true },
    _events:    { type: Array,   state: true },
    _flags:     { type: Object,  state: true },
    _users:     { type: Array,   state: true },
    _loading:   { type: Boolean, state: true },
    _expanded:  { type: Object,  state: true },
    _onlyShiny: { type: Boolean, state: true },
    _onlyWant:  { type: Boolean, state: true },
    _search:    { type: String,  state: true },
  };

  createRenderRoot() { return this; }

  constructor() {
    super();
    this._current = [];
    this._events = [];
    this._flags = {};
    this._users = [];
    this._loading = true;
    this._expanded = new Set();
    this._onlyShiny = false;
    this._onlyWant = false;
    this._search = "";
  }

  async connectedCallback() {
    super.connectedCallback();
    this.addEventListener("flag-changed", this._onFlagChanged);
    await this._load();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener("flag-changed", this._onFlagChanged);
  }

  async _load() {
    this._loading = true;
    try {
      const [events, flagsData] = await Promise.all([api.listEvents(), api.getAllFlags()]);
      this._current = events.current;
      this._events = events.events;
      this._flags = flagsData.flags;
      this._users = flagsData.users;
    } catch (err) {
      toast(err.message, "error");
    } finally {
      this._loading = false;
    }
  }

  _onFlagChanged = (e) => {
    const { formId, flagName, value } = e.detail;
    const username = store.user?.username;
    if (!username) return;
    const flags = { ...this._flags };
    flags[formId] = { ...(flags[formId] ?? {}) };
    flags[formId][username] = { ...(flags[formId][username] ?? {}) };
    if (value) flags[formId][username][flagName] = true;
    else delete flags[formId][username][flagName];
    this._flags = flags;
  };

  _toggle(id) {
    const next = new Set(this._expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    this._expanded = next;
  }

  // ── Flags y filtros ────────────────────────────────────────────────────────

  _myFlags(p) {
    return (p.form_id && this._flags?.[p.form_id]?.[store.user?.username]) || {};
  }

  _shinyAvailable(p) {
    return p.can_be_shiny || !!p.has_shiny;
  }

  _missingShiny(p) {
    return !!p.form_id && p.can_be_shiny && !this._myFlags(p).tengo_shiny;
  }

  _visible(p) {
    if (this._search) {
      const q = this._search.toLowerCase();
      const hay = `${p.name} ${p.source_name} ${p.pokedex_number ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (!this._onlyShiny && !this._onlyWant) return true;
    if (this._onlyShiny && this._missingShiny(p)) return true;
    if (this._onlyWant && this._myFlags(p).quiero) return true;
    return false;
  }

  get _filtering() {
    return this._onlyShiny || this._onlyWant || !!this._search;
  }

  _summary(pokemon) {
    const ids = new Set(), missing = new Set(), want = new Set();
    for (const p of pokemon) {
      const key = p.form_id ?? p.source_name;
      ids.add(key);
      if (this._missingShiny(p)) missing.add(key);
      if (this._myFlags(p).quiero) want.add(key);
    }
    return { total: ids.size, missing: missing.size, want: want.size };
  }

  _isActiveEvent(ev) {
    const end = parseDate(ev.end);
    return !end || end > new Date();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  render() {
    if (this._loading) {
      return html`<div style="text-align:center;padding:3rem"><span class="spinner"></span></div>`;
    }

    const events = this._events.filter((ev) => this._isActiveEvent(ev));
    const empty = !this._current.length && !events.length;

    return html`
      <div class="events-toolbar">
        <h2 class="events-title">Eventos</h2>
        <input
          type="text"
          class="search-input"
          placeholder="Buscar Pokémon…"
          .value=${this._search}
          @input=${(e) => { this._search = e.target.value; }}
        />
        <button
          class="btn ${this._onlyShiny ? "btn-primary" : "btn-ghost"}"
          @click=${() => { this._onlyShiny = !this._onlyShiny; }}
          title="Pokémon con shiny disponible que no tienes marcados con ✨"
        >✨ Shiny que me faltan</button>
        <button
          class="btn ${this._onlyWant ? "btn-primary" : "btn-ghost"}"
          @click=${() => { this._onlyWant = !this._onlyWant; }}
        >❤️ Los que quiero</button>
      </div>

      ${empty ? html`
        <div class="card events-empty">
          No hay datos de eventos todavía. Un administrador puede cargarlos desde
          Admin → Fuentes de datos → Eventos.
        </div>
      ` : ""}

      ${this._current.length ? html`
        <h3 class="events-heading">Ahora mismo</h3>
        <div class="events-list">
          ${this._current.map((ev) => this._eventCard(ev, true))}
        </div>
      ` : ""}

      ${events.length ? html`
        <h3 class="events-heading">Eventos activos y próximos</h3>
        <div class="events-list">
          ${events.map((ev) => this._eventCard(ev, false))}
        </div>
      ` : ""}

      <p class="events-attribution">
        Datos de <a href="https://leekduck.com/events/" target="_blank" rel="noopener">LeekDuck</a>
        vía <a href="https://github.com/bigfoott/ScrapedDuck" target="_blank" rel="noopener">ScrapedDuck</a>.
      </p>
    `;
  }

  _eventCard(ev, isCurrent) {
    const visible = ev.pokemon.filter((p) => this._visible(p));
    if (this._filtering && !visible.length) return "";

    const expanded = this._expanded.has(ev.id) || (this._filtering && !!this._search);
    const s = this._summary(visible);

    return html`
      <div class="card event-card ${expanded ? "expanded" : ""}">
        <div class="event-card-header" @click=${() => this._toggle(ev.id)}>
          ${ev.image ? html`
            <img class="event-image" src=${ev.image} alt="" loading="lazy"
                 @error=${(e) => { e.target.style.display = "none"; }} />
          ` : ""}
          <div class="event-info">
            ${isCurrent ? "" : html`
              <span class="event-type-badge">${EVENT_TYPE_LABELS[ev.event_type] ?? ev.heading ?? ev.event_type}</span>
            `}
            <div class="event-name">${ev.name}</div>
            ${isCurrent ? "" : this._dates(ev)}
            <div class="event-summary">
              ${s.total ? html`<span>${s.total} Pokémon</span>` : html`<span>Sin lista de Pokémon</span>`}
              ${s.missing ? html`<span class="summary-shiny">✨ ${s.missing} shiny que te faltan</span>` : ""}
              ${s.want ? html`<span class="summary-want">❤️ ${s.want} que quieres</span>` : ""}
            </div>
          </div>
          <span class="event-chevron">${expanded ? "▾" : "▸"}</span>
        </div>

        ${expanded ? this._eventBody(ev, visible) : ""}
      </div>
    `;
  }

  _dates(ev) {
    const start = parseDate(ev.start);
    const end = parseDate(ev.end);
    const now = new Date();
    const local = (ev.start && !ev.start.endsWith("Z")) || (ev.end && !ev.end.endsWith("Z"));
    let status = "";
    if (start && start > now) status = html`<span class="event-status upcoming">Empieza ${relative(start)}</span>`;
    else if (end) status = html`<span class="event-status active">En curso · termina ${relative(end)}</span>`;

    return html`
      <div class="event-dates">
        ${status}
        <span>
          ${start ? dateFmt.format(start) : "?"} – ${end ? dateFmt.format(end) : "?"}
          ${local ? html`<span class="muted">(hora local)</span>` : ""}
        </span>
      </div>
    `;
  }

  _eventBody(ev, pokemon) {
    // Agrupar por sección y subsección, respetando el orden de aparición
    const sections = new Map();
    for (const p of pokemon) {
      if (!sections.has(p.section)) sections.set(p.section, new Map());
      const subs = sections.get(p.section);
      const key = p.subsection ?? "";
      if (!subs.has(key)) subs.set(key, []);
      subs.get(key).push(p);
    }
    const ordered = [...sections.keys()].sort(
      (a, b) => SECTION_ORDER.indexOf(a) - SECTION_ORDER.indexOf(b)
    );

    return html`
      <div class="event-body">
        ${ev.bonuses?.length && !this._filtering ? html`
          <div class="event-bonuses">
            <div class="event-section-title">Bonificaciones</div>
            <ul>${ev.bonuses.map((b) => html`<li>${b}</li>`)}</ul>
          </div>
        ` : ""}

        ${ordered.map((section) => html`
          <div class="event-section">
            ${ev.id.startsWith("current-") && ordered.length === 1 ? "" : html`
              <div class="event-section-title">${SECTION_LABELS[section] ?? section}</div>
            `}
            ${[...sections.get(section).entries()].map(([sub, list]) => html`
              ${sub ? html`<div class="event-subsection-title">${sub}</div>` : ""}
              <div class="event-pokemon-grid">
                ${list.map((p) => this._pokemonChip(p))}
              </div>
            `)}
          </div>
        `)}

        ${ev.link ? html`
          <a class="event-link" href=${ev.link} target="_blank" rel="noopener">Ver en LeekDuck ↗</a>
        ` : ""}
      </div>
    `;
  }

  _pokemonChip(p) {
    const mine = this._myFlags(p);
    const others = p.form_id
      ? this._users
          .filter((u) => u.username !== store.user?.username)
          .filter((u) => this._flags?.[p.form_id]?.[u.username]?.quiero)
          .map((u) => u.username)
      : [];
    const missing = this._missingShiny(p);

    return html`
      <div class="event-pkmn ${missing ? "missing-shiny" : ""} ${mine.quiero ? "wanted" : ""}">
        <div class="event-pkmn-img-wrap">
          <img
            class="event-pkmn-img"
            src=${p.image_url ?? ""}
            alt=${p.name}
            loading="lazy"
            @error=${(e) => { e.target.style.opacity = "0.2"; }}
          />
          ${this._shinyAvailable(p) ? html`<span class="event-pkmn-shiny" title="Shiny disponible">✨</span>` : ""}
        </div>
        <div class="event-pkmn-name">
          ${p.variant ? html`<span class="event-pkmn-variant">${p.variant}</span>` : ""}
          ${p.name}
        </div>
        ${p.note ? html`<div class="event-pkmn-note">${p.note}</div>` : ""}

        ${p.form_id ? html`
          <div class="event-pkmn-flags">
            <flag-toggle form-id=${p.form_id} flag-name="quiero" ?active=${!!mine.quiero}></flag-toggle>
            ${this._shinyAvailable(p) ? html`
              <flag-toggle form-id=${p.form_id} flag-name="tengo_shiny" ?active=${!!mine.tengo_shiny}></flag-toggle>
            ` : ""}
            <flag-toggle form-id=${p.form_id} flag-name="tengo_100" ?active=${!!mine.tengo_100}></flag-toggle>
          </div>
          ${others.length ? html`
            <div class="event-pkmn-others" title="También lo quieren">❤️ ${others.join(", ")}</div>
          ` : ""}
        ` : ""}
      </div>
    `;
  }
}

customElements.define("events-page", EventsPage);
