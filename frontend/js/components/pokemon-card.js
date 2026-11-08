import { LitElement, html } from "lit";

/**
 * <pokemon-card>
 * Propiedades:
 *   pokemon     — objeto de forma enriquecida
 *   flags       — { username: { flag_name: bool } }
 *   users       — array de { id, username }
 *   currentUser — { id, username }
 */
class PokemonCard extends LitElement {
  static properties = {
    pokemon: { type: Object },
    flags: { type: Object },
    users: { type: Array },
    currentUser: { type: Object },
  };

  createRenderRoot() { return this; }

  constructor() {
    super();
    this.pokemon = null;
    this.flags = {};
    this.users = [];
    this.currentUser = null;
  }

  _typeBadge(type) {
    if (!type) return "";
    return html`<span class="type-badge type-${type}" style="font-size:0.65rem">${type}</span>`;
  }

  render() {
    const p = this.pokemon;
    if (!p) return "";

    const me = this.currentUser?.username;
    const mine = this.flags?.[me] ?? {};
    const others = this.users
      .filter((u) => u.username !== me && this.flags?.[u.username]?.quiero)
      .map((u) => u.username);

    return html`
      <div class="pokemon-card-item">
        <div class="pokemon-number">#${String(p.pokedex_number).padStart(4, "0")}</div>
        <img
          class="pokemon-img"
          style="width:72px;height:72px"
          src=${p.image_url}
          alt=${p.name}
          loading="lazy"
          @error=${(e) => { e.target.style.opacity = "0.2"; }}
        />
        <div class="pokemon-name">${p.name}</div>
        <div style="display:flex;gap:0.25rem;justify-content:center">
          ${this._typeBadge(p.type1)}
          ${p.type2 ? this._typeBadge(p.type2) : ""}
        </div>

        <!-- Tus flags + quién más lo quiere -->
        <div class="card-flags">
          <flag-toggle form-id=${p.id} flag-name="quiero" ?active=${!!mine.quiero}></flag-toggle>
          ${p.has_shiny ? html`
            <flag-toggle form-id=${p.id} flag-name="tengo_shiny" ?active=${!!mine.tengo_shiny}></flag-toggle>
          ` : ""}
          <flag-toggle form-id=${p.id} flag-name="tengo_100" ?active=${!!mine.tengo_100}></flag-toggle>
        </div>
        ${others.length ? html`
          <div class="card-others" title="También lo quieren">❤️ ${others.join(", ")}</div>
        ` : ""}
      </div>
    `;
  }
}

customElements.define("pokemon-card", PokemonCard);
