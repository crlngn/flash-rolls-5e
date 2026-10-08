import { LogUtil } from "@ftb-core/utils/LogUtil.mjs";
import { MODULE_ID } from "../../../constants/General.mjs";
import { GeneralUtil } from "../../utils/GeneralUtil.mjs";
import { FlashAPI } from "../../core/FlashAPI.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const { FormDataExtended } = foundry.applications.ux;

/**
 * Dialog for selecting transformation target and settings
 */
export class TransformationDialog extends HandlebarsApplicationMixin(ApplicationV2) {

  /**
   * Show transformation dialog and return selected options
   * @param {Actor[]} actors - Actors being transformed
   * @returns {Promise<Object|null>} Object with targetActor, settings, renderSheet, or null if cancelled
   */
  static async show(actors) {
    return new Promise((resolve) => {
      const dialog = new this({
        actors,
        resolve
      });
      dialog.render(true);
    });
  }

  static DEFAULT_OPTIONS = {
    id: "flash5e-transformation-dialog",
    tag: "form",
    window: {
      title: "",//FLASH_ROLLS.ui.dialogs.transformation.title
      icon: "fa-solid fa-frog",
      contentClasses: ["standard-form", "crlngn", "flash5e", "transformation-dialog"]
    },
    position: {
      width: 560,
      height: "auto"
    },
    form: {
      handler: TransformationDialog.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: false
    },
    actions: {
      transform: TransformationDialog.#onTransform,
      cancel: TransformationDialog.#onCancel
    }
  };

  static PARTS = {
    content: {
      template: `modules/${MODULE_ID}/templates/transformation-dialog.hbs`
    },
    footer: {
      template: "templates/generic/form-footer.hbs"
    }
  };

  constructor(options = {}) {
    super(options);

    this.actors = options.actors || [];
    this.resolve = options.resolve;
    this.selectedActorUuid = null;
    this.selectedActorName = "";
    this.selectedPreset = "polymorph";
    this.showCustomSettings = false;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return context;
  }

  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);

    switch (partId) {
      case "content": {
        context.actors = this.actors;
        context.actorCount = this.actors.length;
        context.actorNames = this.actors.map(a => a.name).join(", ");
        context.selectedActorName = this.selectedActorName;

        const favoritesData = game.settings.get("flash-rolls-5e", "transform-favorites") || [];
        const favoriteUuids = new Set(favoritesData);

        context.favorites = [];
        for (const uuid of favoritesData) {
          const actor = await fromUuid(uuid);
          if (actor) {
            context.favorites.push({
              uuid,
              name: actor.name,
              img: actor.img
            });
          }
        }

        if (this.selectedActorUuid) {
          const actor = await fromUuid(this.selectedActorUuid);
          context.selectedActor = {
            uuid: this.selectedActorUuid,
            name: this.selectedActorName,
            img: actor?.img,
            isFavorite: favoriteUuids.has(this.selectedActorUuid)
          };
        } else {
          context.selectedActor = null;
        }

        context.selectedPreset = this.selectedPreset;
        context.showCustomSettings = this.showCustomSettings;
        context.presets = [
          {
            value: "polymorph",
            label: "FLASH_ROLLS.ui.dialogs.transformation.presets.polymorph",
            description: "FLASH_ROLLS.ui.dialogs.transformation.presets.polymorphDesc"
          },
          {
            value: "wildshape",
            label: "FLASH_ROLLS.ui.dialogs.transformation.presets.wildshape",
            description: "FLASH_ROLLS.ui.dialogs.transformation.presets.wildshapeDesc"
          },
          {
            value: "appearance",
            label: "FLASH_ROLLS.ui.dialogs.transformation.presets.appearance",
            description: "FLASH_ROLLS.ui.dialogs.transformation.presets.appearanceDesc"
          },
          {
            value: "custom",
            label: "FLASH_ROLLS.ui.dialogs.transformation.presets.custom",
            description: "FLASH_ROLLS.ui.dialogs.transformation.presets.customDesc"
          }
        ];
        break;
      }
      case "footer": {
        context.buttons = [
          {
            type: "button",
            icon: "fa-solid fa-times",
            label: "FLASH_ROLLS.ui.buttons.cancelButton",
            action: "cancel"
          },
          {
            type: "button",
            icon: "fa-solid fa-wand-magic-sparkles",
            label: "FLASH_ROLLS.ui.dialogs.transformation.transform",
            action: "transform"
          }
        ];
        break;
      }
    }

    return context;
  }

  /**
   * Attach event listeners after rendering
   * @param {ApplicationRenderContext} context - Render context
   * @param {HandlebarsRenderOptions} options - Rendering options
   */
  _onRender(context, options) {
    super._onRender(context, options);

    const selectBtn = this.element.querySelector('.select-actor-btn');
    const actorImageContainer = this.element.querySelector('.actor-image-container');
    const actorImagePlaceholder = this.element.querySelector('.actor-image-placeholder');
    const clearBtn = this.element.querySelector('.clear-actor-btn');
    const presetSelector = this.element.querySelector('.preset-selector');
    const favoriteItems = this.element.querySelectorAll('.favorite-item');
    const toggleFavoriteBtns = this.element.querySelectorAll('.toggle-favorite-btn');
    const favoritesSection = this.element.querySelector('.form-group.favorites-section');
    const selectedActorImg = this.element.querySelector('.selected-actor-preview .actor-image-container img');

    if (selectBtn) {
      selectBtn.addEventListener('click', (event) => {
        event.preventDefault();
        this._onSelectActor();
      });
    }

    if (actorImageContainer) {
      actorImageContainer.addEventListener('click', (event) => {
        if (!event.target.closest('.toggle-favorite-btn')) {
          event.preventDefault();
          this._onSelectActor();
        }
      });
    }

    if (actorImagePlaceholder) {
      actorImagePlaceholder.addEventListener('click', (event) => {
        event.preventDefault();
        this._onSelectActor();
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', (event) => {
        event.preventDefault();
        this._onClearActor();
      });
    }

    if (presetSelector) {
      presetSelector.addEventListener('change', (event) => this._onPresetChange(event));
    }

    favoriteItems.forEach(item => {
      item.addEventListener('click', (event) => {
        if (!event.target.closest('.toggle-favorite-btn')) {
          this._onSelectFavorite(item.dataset.uuid);
        }
      });
    });

    toggleFavoriteBtns.forEach(btn => {
      const isFavorite = btn.dataset.isFavorite === "true";
      btn.title = isFavorite
        ? game.i18n.localize("FLASH_ROLLS.ui.dialogs.transformation.removeFromFavorites")
        : game.i18n.localize("FLASH_ROLLS.ui.dialogs.transformation.addToFavorites");

      btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this._onToggleFavorite(btn.dataset.uuid);
      });
    });

    if (favoritesSection) {
      this._setupDragAndDrop(favoritesSection);
    }

    if (selectedActorImg) {
      selectedActorImg.addEventListener('error', () => {
        selectedActorImg.classList.add('hidden');
      });
    }
  }

  /**
   * Setup drag and drop for favorites section
   * @param {HTMLElement} element - Favorites section element
   * @private
   */
  _setupDragAndDrop(element) {
    element.addEventListener('dragover', (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      element.classList.add('drag-over');
    });

    element.addEventListener('dragleave', (event) => {
      if (event.target === element) {
        element.classList.remove('drag-over');
      }
    });

    element.addEventListener('drop', async (event) => {
      event.preventDefault();
      element.classList.remove('drag-over');

      const data = TextEditor.getDragEventData(event);
      if (data.type === 'Actor') {
        const actor = await fromUuid(data.uuid);
        if (actor && actor.type === 'npc') {
          await this._onToggleFavorite(data.uuid);
        } else if (actor && actor.type !== 'npc') {
          FlashAPI.notify('warn',game.i18n.localize("FLASH_ROLLS.ui.dialogs.transformation.onlyNPCs"));
        }
      }
    });
  }

  /**
   * Handle actor selection button click
   * Opens actor browser for world actors and compendia
   * @private
   */
  async _onSelectActor() {
    const uuid = await this._showActorBrowser();
    if (uuid) {
      this.selectedActorUuid = uuid;
      const actor = await fromUuid(uuid);

      if (actor) {
        this.selectedActorName = actor.name;
        this.render(true);
      }
    }
  }

  /**
   * Show DnD5e compendium browser to select target actor
   * Uses monsters tab to get full filtering options (CR, Size, Type, Habitat)
   * Locks to NPC actors for transformation
   * @returns {Promise<string|null>} Selected actor UUID or null
   * @private
   */
  async _showActorBrowser() {
    return dnd5e.applications.CompendiumBrowser.selectOne({
      tab: "monsters",
      filters: {
        locked: {
          documentClass: "Actor",
          types: new Set(["npc"])
        }
      }
    });
  }

  /**
   * Handle clear actor selection
   * @private
   */
  _onClearActor() {
    this.selectedActorUuid = null;
    this.selectedActorName = "";
    this.render(true);
  }

  /**
   * Handle selecting a favorite actor
   * @param {string} uuid - Actor UUID
   * @private
   */
  async _onSelectFavorite(uuid) {
    const actor = await fromUuid(uuid);
    if (actor) {
      const wasEmpty = !this.selectedActorUuid;
      this.selectedActorUuid = uuid;
      this.selectedActorName = actor.name;

      if (wasEmpty) {
        this.render(true);
        return;
      }

      const imgContainer = this.element.querySelector('.selected-actor-preview .actor-image-container');
      const img = imgContainer?.querySelector('img');
      const toggleBtn = this.element.querySelector('.selected-actor-preview .toggle-favorite-btn');
      const preview = this.element.querySelector('.selected-actor-preview');

      if (img && imgContainer) {
        img.src = actor.img;
        img.alt = actor.name;
        img.classList.remove('hidden');
      }

      if (toggleBtn) {
        toggleBtn.dataset.uuid = uuid;
        const icon = toggleBtn.querySelector('i');
        const favorites = game.settings.get("flash-rolls-5e", "transform-favorites") || [];
        const isFavorite = favorites.includes(uuid);

        if (icon) {
          if (isFavorite) {
            icon.classList.remove('faded');
          } else {
            icon.classList.add('faded');
          }
        }

        toggleBtn.title = game.i18n.localize(isFavorite ?
          "FLASH_ROLLS.ui.dialogs.transformation.removeFromFavorites" :
          "FLASH_ROLLS.ui.dialogs.transformation.addToFavorites"
        );
      }

      if (preview) {
        preview.dataset.tooltip = actor.name;
      }
    }
  }

  /**
   * Handle toggling favorite status
   * @param {string} uuid - Actor UUID
   * @private
   */
  async _onToggleFavorite(uuid) {
    const favorites = game.settings.get("flash-rolls-5e", "transform-favorites") || [];
    const favoriteSet = new Set(favorites);

    const wasRemoved = favoriteSet.has(uuid);
    if (wasRemoved) {
      favoriteSet.delete(uuid);
    } else {
      favoriteSet.add(uuid);
    }

    await game.settings.set("flash-rolls-5e", "transform-favorites", Array.from(favoriteSet));

    if (wasRemoved) {
      this.render(true);
    } else {
      const toggleBtn = this.element.querySelector(`.toggle-favorite-btn[data-uuid="${uuid}"]`);
      if (toggleBtn) {
        const icon = toggleBtn.querySelector('i');
        if (icon) {
          icon.classList.remove('faded');
        }
        toggleBtn.title = game.i18n.localize("FLASH_ROLLS.ui.dialogs.transformation.removeFromFavorites");
      }

      this.render(true);
    }
  }

  /**
   * Handle preset change
   * @param {Event} event - Change event
   * @private
   */
  _onPresetChange(event) {
    this.selectedPreset = event.target.value;
    this.showCustomSettings = this.selectedPreset === 'custom';
    this.render(true);
  }

  /**
   * Handle form submission
   * @param {Event} event - Form submit event
   * @param {HTMLFormElement} form - The form element
   * @param {FormDataExtended} formData - The form data
   * @private
   */
  static async #onSubmit(event, form, formData) {
    event.preventDefault();
  }

  /**
   * Handle transform button click
   * @param {Event} event - Click event
   * @param {HTMLElement} target - Target element
   * @private
   */
  static async #onTransform(event, target) {
    const dialog = this;

    if (!dialog.selectedActorUuid) {
      FlashAPI.notify('warn',game.i18n.localize("FLASH_ROLLS.ui.dialogs.transformation.noActorSelected"));
      return;
    }

    const targetActor = await fromUuid(dialog.selectedActorUuid);
    if (!targetActor) {
      ui.notifications.error(game.i18n.localize("FLASH_ROLLS.notifications.invalidActorUuid"));
      return;
    }

    const formData = new FormDataExtended(dialog.element).object;
    const renderSheet = formData.renderSheet || false;

    let settings;
    if (dialog.selectedPreset === 'custom') {
      const keep = new Set();
      if (formData['keep-mental']) keep.add('mental');
      if (formData['keep-physical']) keep.add('physical');
      if (formData['keep-saves']) keep.add('saves');
      if (formData['keep-skills']) keep.add('skills');
      if (formData['keep-spells']) keep.add('spells');
      if (formData['keep-items']) keep.add('items');
      if (formData['keep-hp']) keep.add('hp');

      settings = new dnd5e.dataModels.settings.TransformationSetting({
        keep,
        transformTokens: !!formData['transform-tokens']
      });
    } else {
      settings = dialog._createPresetSettings(dialog.selectedPreset);
    }

    if (dialog.resolve) {
      dialog.resolve({ targetActor, settings, renderSheet });
    }

    dialog.close();
  }

  /**
   * Handle cancel button click
   * @private
   */
  static #onCancel() {
    const dialog = this;

    if (dialog.resolve) {
      dialog.resolve(null);
    }
    dialog.close();
  }

  /**
   * Create transformation settings from preset
   * @param {string} preset - Preset name
   * @returns {TransformationSetting} Settings object
   * @private
   */
  _createPresetSettings(preset) {
    switch (preset) {
      case "wildshape":
        return new dnd5e.dataModels.settings.TransformationSetting({
          preset: "wildshape"
        });

      case "appearance":
        return new dnd5e.dataModels.settings.TransformationSetting({
          effects: new Set(["all"]),
          keep: new Set(["self"])
        });

      case "polymorph":
      default:
        return new dnd5e.dataModels.settings.TransformationSetting({
          keep: new Set(["mental"]),
          transformTokens: true
        });
    }
  }
}

