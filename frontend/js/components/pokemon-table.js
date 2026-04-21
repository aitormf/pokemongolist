import { LitElement, html } from "lit";
import { store } from "../app.js";

/**
 * <pokemon-table>
 * Propiedades:
 *   pokemon — array de formas enriquecidas
 *   flags   — { pokemon_form_id: { username: { flag_name: bool } } }
 *   users   — array de { id, username }
 *   currentUser — { id, username, role }
 */
class PokemonTable extends LitElement {
  static properties = {
    pokemon: { type: Array },
    flags: { type: Object },
    users: { type: Array },
    currentUser: { type: Object },
  };

  createRenderRoot() { return this; }

  constructor() {
    super();
    this.pokemon = [];
    this.flags = {};
    this.users = [];
    this.currentUser = null;
  }

  _userFlags(formId, username) {
    return this.flags?.[formId]?.[username] ?? {};
  }

  _typeBadge(type) {
    if (!type) return "";
    return html`<span class="type-badge type-${type}">${type}</span>`;
  }

  render() {
    const users = this.users;
    return html`
      <div style="overflow-x:auto">
        <table>
          <thead>
            <tr>
              <th style="width:56px"></th>
              <th>#</th>
              <th>Nombre</th>
              <th>Tipo</th>
              ${users.map((u) => html`<th>${u.username}</th>`)}
            </tr>
          </thead>
          <tbody>
            ${this.pokemon.map((p) => this._row(p, users))}
          </tbody>
        </table>
        ${this.pokemon.length === 0
          ? html`<p style="padding:2rem;text-align:center;color:var(--color-text-muted)">Sin resultados</p>`
          : ""}
      </div>
    `;
  }

  _row(p, users) {
    return html`
      <tr>
        <td>
          <img
            class="pokemon-img"
            src=${p.image_url}
            alt=${p.name}
            loading="lazy"
            @error=${(e) => { e.target.style.opacity = "0.2"; }}
          />
        </td>
        <td style="color:var(--color-text-muted)">${String(p.pokedex_number).padStart(4, "0")}</td>
        <td>
          <div style="font-weight:600">${p.name}</div>
          ${p.form ? html`<div style="font-size:0.7rem;color:var(--color-text-muted)">${p.form}</div>` : ""}
        </td>
        <td>
          <div style="display:flex;gap:0.25rem;flex-wrap:wrap">
            ${this._typeBadge(p.type1)}
            ${p.type2 ? this._typeBadge(p.type2) : ""}
          </div>
        </td>
        ${users.map((u) => {
          const isCurrentUser = u.id === this.currentUser?.id;
          const uFlags = this._userFlags(p.id, u.username);
          return html`
            <td>
              <div style="display:flex;gap:0.25rem;flex-wrap:wrap">
                <flag-toggle
                  form-id=${p.id}
                  flag-name="quiero"
                  ?active=${!!uFlags.quiero}
                  ?readonly=${!isCurrentUser}
                ></flag-toggle>
                <flag-toggle
                  form-id=${p.id}
                  flag-name="tengo_100"
                  ?active=${!!uFlags.tengo_100}
                  ?readonly=${!isCurrentUser}
                ></flag-toggle>
                ${p.has_shiny ? html`
                  <flag-toggle
                    form-id=${p.id}
                    flag-name="tengo_shiny"
                    ?active=${!!uFlags.tengo_shiny}
                    ?readonly=${!isCurrentUser}
                  ></flag-toggle>
                ` : ""}
              </div>
            </td>
          `;
        })}
      </tr>
    `;
  }
}

customElements.define("pokemon-table", PokemonTable);
