import { MODULE } from "../../../constants/General.mjs";
import { LogUtil } from "@ftb-core/utils/LogUtil.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Dialog showing character import results with matched/unmatched items
 * Used for Tier B and C imports when DDB Importer is not available
 */
export class CharacterImportResultsDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.importData = options.importData || {};
    this._resolve = null;
  }

  static DEFAULT_OPTIONS = {
    classes: ["flash5e-dialog", "flash5e-import-results-dialog"],
    tag: "div",
    window: {
      title: "FLASH_ROLLS.ui.dialogs.characterImport.resultsTitle",
      icon: "fas fa-file-import",
      resizable: true,
      positioned: true,
      frame: true,
      contentClasses: ["standard-form", "crlngn", "flash5e"]
    },
    position: {
      width: 620,
      height: "auto"
    },
    actions: {
      confirm: CharacterImportResultsDialog.#onConfirm,
      cancel: CharacterImportResultsDialog.#onCancel,
      openDDBImporter: CharacterImportResultsDialog.#onOpenDDBImporter
    }
  };

  get id() {
    return `flash5e-import-results-${this.importData.characterName?.replace(/\s+/g, "-") || "unknown"}`;
  }

  get title() {
    if (this.importData.characterName) {
      return game.i18n.format("FLASH_ROLLS.ui.dialogs.characterImport.resultsTitle", {
        name: this.importData.characterName
      });
    }
    return game.i18n.localize("FLASH_ROLLS.ui.dialogs.characterImport.resultsTitle");
  }

  static PARTS = {
    content: {
      template: `modules/${MODULE.ID}/templates/character-import-results.hbs`
    },
    footer: {
      template: "templates/generic/form-footer.hbs"
    }
  };

  async _prepareContext(options = {}) {
    const context = await super._prepareContext(options);
    const { tier, matchRate, matched, unmatched, characterName, classInfo, raceName, backgroundName } = this.importData;

    const matchPercentage = Math.round((matchRate || 0) * 100);

    if (matched) {
      matched.forEach((item, index) => {
        item._itemKey = `item-${index}`;
      });
    }

    if (unmatched) {
      unmatched.forEach((item, index) => {
        item._unmatchedKey = `unmatched-${index}`;
      });
    }

    const groupedMatched = this._groupByType(matched || []);
    const groupedUnmatched = this._groupByType(unmatched || []);

    return {
      ...context,
      characterName,
      tier,
      matchPercentage,
      matchedCount: matched?.length || 0,
      unmatchedCount: unmatched?.length || 0,
      totalCount: (matched?.length || 0) + (unmatched?.length || 0),
      isTierB: tier === "B",
      isTierC: tier === "C",
      groupedMatched,
      groupedUnmatched,
      hasUnmatched: (unmatched?.length || 0) > 0,
      classInfo,
      raceName,
      backgroundName
    };
  }

  async _preparePartContext(partId, context, options) {
    const partContext = await super._preparePartContext(partId, context, options);

    if (partId === "footer") {
      partContext.buttons = [
        { type: "button", icon: "fas fa-times", label: "Cancel", action: "cancel" },
        { type: "button", icon: "fas fa-check", label: "Create Actor", action: "confirm", cssClass: "primary" }
      ];
    }

    return partContext;
  }

  /**
   * Group items by their type for organized display, sorted alphabetically by name
   * @param {Array} items - Array of matched or unmatched items
   * @returns {Object} Items grouped by type with items sorted by name
   * @private
   */
  _groupByType(items) {
    const groups = {};
    const typeLabels = {
      spell: "Spells",
      weapon: "Weapons",
      equipment: "Equipment",
      consumable: "Consumables",
      feat: "Features & Feats",
      tool: "Tools",
      class: "Classes",
      subclass: "Subclasses",
      background: "Background",
      race: "Species",
      species: "Species",
      unknown: "Other"
    };

    for (const item of items) {
      const rawType = item.foundryType || item.type || "unknown";
      const type = rawType.toLowerCase();
      if (!groups[type]) {
        groups[type] = {
          label: typeLabels[type] || rawType,
          items: []
        };
      }
      groups[type].items.push(item);
    }

    for (const group of Object.values(groups)) {
      group.items.sort((a, b) => {
        const nameA = (a.foundryName || a.ddbItem?.definition?.name || a.ddbItem?.name || a.name || "").toLowerCase();
        const nameB = (b.foundryName || b.ddbItem?.definition?.name || b.ddbItem?.name || b.name || "").toLowerCase();
        return nameA.localeCompare(nameB);
      });
    }

    return groups;
  }

  /**
   * Factory method to show dialog and wait for user decision
   * @param {Object} importData - Import data to display
   * @returns {Promise<Object|null>} Modified importData with selections, or null if cancelled
   */
  static async show(importData) {
    return new Promise((resolve) => {
      const dialog = new CharacterImportResultsDialog({ importData });
      dialog._resolve = resolve;
      dialog.render(true);
    });
  }

  /**
   * @override
   */
  _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelectorAll(".source-select").forEach(select => {
      select.addEventListener("change", this._onSourceChange.bind(this));
    });

    const createAllCheckbox = this.element.querySelector("#createAllHomebrew");
    if (createAllCheckbox) {
      createAllCheckbox.addEventListener("change", this._onCreateAllChange.bind(this));
    }
  }

  /**
   * Handle "create all homebrew" checkbox change
   * @param {Event} event
   */
  _onCreateAllChange(event) {
    const isChecked = event.target.checked;
    this.element.querySelectorAll(".create-homebrew-checkbox").forEach(checkbox => {
      checkbox.checked = isChecked;
    });
  }

  /**
   * Get list of unmatched items that should be created as homebrew
   * @returns {Array} Array of unmatched items to create
   */
  _getHomebrewToCreate() {
    const toCreate = [];
    this.element.querySelectorAll(".create-homebrew-checkbox:checked").forEach(checkbox => {
      const itemKey = checkbox.dataset.itemKey;
      const item = this.importData.unmatched?.find(u => u._unmatchedKey === itemKey);
      if (item) {
        toCreate.push(item);
      }
    });
    return toCreate;
  }

  /**
   * Handle source selection change
   * @param {Event} event
   */
  _onSourceChange(event) {
    const select = event.target;
    const selectedIndex = parseInt(select.value, 10);
    const itemKey = select.dataset.itemKey;

    for (const item of this.importData.matched) {
      if (item.allMatches && item._itemKey === itemKey) {
        const newMatch = item.allMatches[selectedIndex];
        item.selectedIndex = selectedIndex;
        item.foundryUuid = newMatch.uuid;
        item.foundryName = newMatch.name;
        item.source = newMatch.source;
        item.sourceLabel = newMatch.sourceLabel;
        item.sourceVersion = newMatch.sourceVersion;
        item.sourceTitle = newMatch.sourceTitle;
        item.matchType = newMatch.matchType;
        break;
      }
    }
  }

  /**
   * Handle confirm button click
   * @param {Event} event
   * @param {HTMLElement} target
   */
  static #onConfirm(event, target) {
    if (this._resolve) {
      this.importData.homebrewToCreate = this._getHomebrewToCreate();
      this._resolve(this.importData);
    }
    this.close();
  }

  /**
   * Handle cancel button click
   * @param {Event} event
   * @param {HTMLElement} target
   */
  static #onCancel(event, target) {
    if (this._resolve) {
      this._resolve(null);
    }
    this.close();
  }

  /**
   * Handle open DDB Importer link
   * @param {Event} event
   * @param {HTMLElement} target
   */
  static #onOpenDDBImporter(event, target) {
    window.open("https://foundryvtt.com/packages/ddb-importer", "_blank");
  }

  /** @override */
  close(options = {}) {
    if (this._resolve && !options._resolved) {
      this._resolve(null);
    }
    return super.close(options);
  }
}
