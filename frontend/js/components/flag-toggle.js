import { LitElement, html } from "lit";
import { api } from "../api.js";
import { toast } from "../app.js";

const FLAG_LABELS = {
  quiero: "❤️ Quiero",
  tengo_100: "💎 100",
  tengo_shiny: "✨ Shiny",
};

/**
 * <flag-toggle>
 * Atributos:
 *   form-id    — id de la forma de Pokémon
 *   flag-name  — nombre del flag (quiero, tengo_100, tengo_shiny)
 *   active     — boolean, si el flag está activo
 *   readonly   — si no pertenece al usuario actual
 */
class FlagToggle extends LitElement {
  static properties = {
    formId: { type: String, attribute: "form-id" },
    flagName: { type: String, attribute: "flag-name" },
    active: { type: Boolean },
    readonly: { type: Boolean },
    _loading: { type: Boolean, state: true },
  };

  createRenderRoot() { return this; }

  constructor() {
    super();
    this.active = false;
    this.readonly = false;
    this._loading = false;
  }

  async _toggle() {
    if (this.readonly || this._loading) return;
    this._loading = true;
    try {
      if (this.active) {
        await api.unsetFlag(this.formId, this.flagName);
        this.active = false;
      } else {
        await api.setFlag(this.formId, this.flagName);
        this.active = true;
      }
      this.dispatchEvent(
        new CustomEvent("flag-changed", {
          bubbles: true,
          detail: { formId: this.formId, flagName: this.flagName, value: this.active },
        })
      );
    } catch (err) {
      toast(err.message, "error");
    } finally {
      this._loading = false;
    }
  }

  render() {
    const label = FLAG_LABELS[this.flagName] ?? this.flagName;
    const classes = [
      "flag-chip",
      `flag-${this.flagName}`,
      this.active ? "active" : "",
      this.readonly ? "readonly" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return html`
      <span
        class=${classes}
        @click=${this._toggle}
        title=${this.readonly ? "" : this.active ? "Quitar" : "Marcar"}
        style=${this.readonly ? "cursor:default;pointer-events:none" : ""}
      >
        ${this._loading ? html`<span class="spinner" style="width:12px;height:12px;border-width:1px"></span>` : label}
      </span>
    `;
  }
}

customElements.define("flag-toggle", FlagToggle);
