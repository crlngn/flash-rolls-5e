import { MODULE } from "../../../constants/General.mjs";
import { LogUtil } from "../../utils/LogUtil.mjs";

/**
 * Custom Roll Dialog - ApplicationV2 component for custom roll formulas
 */
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
export class CustomRollDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.formula = options.formula || "";
    this.readonly = options.readonly || false;
    this.actor = options.actor;
    this.callback = options.callback;
    this.diceCounts = {};
    this.rollMode = options.rollMode || game.settings.get("core", "rollMode");
  }

  /**
   * Default application configuration
   */
  static get DEFAULT_OPTIONS() {
    return foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
      classes: ["flash5e-dialog", "flash5e-custom-roll-dialog"],
      tag: "div",
      window: {
        title: "FLASH_ROLLS.ui.dialogs.customRollTitle",
        icon: "fa-thin fa-dice-d20 fa-light",
        resizable: false,
        positioned: true,
        frame: true
      },
      position: {
        width: 420,
        height: "auto"
      }
    });
  }
  
  /**
   * Override to provide unique ID per actor
   */
  get id() {
    return `flash5e-custom-roll-dialog-${this.actor?.id || 'unknown'}`;
  }
  
  /**
   * Override to provide unique title per actor
   */
  get title() {
    const baseTitle = game.i18n.localize("FLASH_ROLLS.ui.dialogs.customRollTitle");
    if (this.actor) {
      return `${baseTitle} - ${this.actor.name}`;
    }
    return baseTitle;
  }
  
  /**
   * Override to handle action clicks
   */
  _onClickAction(event, target) {
    const action = target.dataset.action;
    switch (action) {
      case "rollDice":
        return this.rollDice(event, target);
      case "addDie":
        return this.addDie(event, target);
      case "cancel":
        return this.cancel(event, target);
    }
  }

  /**
   * Prepare application rendering context
   */
  async _prepareContext(options = {}) {
    const context = await super._prepareContext(options);
    const rollModes = Object.entries(CONFIG.Dice.rollModes).map(([value, label]) => ({
      value,
      labelKey: typeof label === 'string' ? label : (label?.label || label?.name || value),
      selected: value === this.rollMode
    }));
    return {
      ...context,
      formula: this.formula,
      readonly: this.readonly,
      rollMode: this.rollMode,
      rollModes
    };
  }

  /**
   * Define template parts
   */
  static PARTS = {
    main: {
      template: `modules/${MODULE.ID}/templates/custom-roll-dialog.hbs`
    },
    footer: {
      template: `modules/${MODULE.ID}/templates/custom-roll-dialog-footer.hbs`
    }
  };

  /**
   * Add event listeners
   */
  _attachPartListeners(partId, htmlElement, options) {
    super._attachPartListeners(partId, htmlElement, options);

    const formulaInput = htmlElement.querySelector('#custom-roll-formula');
    const validationMessage = htmlElement.querySelector('#formula-validation-message');
    const rollModeSelect = htmlElement.querySelector('#custom-roll-mode');

    if (formulaInput && !this.readonly) {
      formulaInput.addEventListener('input', (event) => {
        this.formula = event.target.value.trim();
        this.updateValidationMessage(validationMessage);
      });

      if (this.formula) {
        this.updateValidationMessage(validationMessage);
      }
    }

    if (rollModeSelect) {
      rollModeSelect.addEventListener('change', (event) => {
        this.rollMode = event.target.value;
      });
    }
  }
  
  /**
   * Update the validation message based on formula validity
   * @param {HTMLElement} messageElement - The validation message element
   */
  updateValidationMessage(messageElement) {
    if (!messageElement) return;
    
    if (!this.formula) {
      messageElement.textContent = '&nbsp;';
      messageElement.classList.remove('error', 'success');
      return;
    }
    
    const isValid = this.validateFormula(this.formula);
    
    if (isValid) {
      messageElement.textContent = game.i18n.localize("FLASH_ROLLS.ui.dialogs.formulaValid");
      messageElement.classList.remove('error');
      messageElement.classList.add('success');
    } else {
      messageElement.textContent = game.i18n.localize("FLASH_ROLLS.ui.dialogs.formulaInvalid");
      messageElement.classList.remove('success');
      messageElement.classList.add('error');
    }
  }

  /**
   * Handle dice button click
   * @param {Event} event
   * @param {HTMLElement} target
   */
  addDie(event, target) {
    const die = target.dataset.die;
    
    const formulaInput = this.element.querySelector('#custom-roll-formula');
    if (!formulaInput) return;
    
    const currentFormula = formulaInput.value.trim();
    
    if (currentFormula) {
      const diceRegex = /(\d*)d(\d+)/g;
      const diceMap = new Map();
      
      let remainingFormula = currentFormula;
      let match;
      
      while ((match = diceRegex.exec(currentFormula)) !== null) {
        const count = parseInt(match[1] || '1');
        const dieType = match[2];
        diceMap.set(dieType, (diceMap.get(dieType) || 0) + count);
        remainingFormula = remainingFormula.replace(match[0], '').trim();
      }
      
      const newDieType = die.substring(1); // Remove 'd' prefix
      diceMap.set(newDieType, (diceMap.get(newDieType) || 0) + 1);
      
      const diceParts = [];
      for (const [dieType, count] of diceMap) {
        diceParts.push(`${count}d${dieType}`);
      }
      
      remainingFormula = remainingFormula.replace(/^\+\s*|\s*\+\s*$|\s*\+\s*\+/g, '').trim();
      
      if (remainingFormula && remainingFormula !== '+') {
        this.formula = `${diceParts.join(' + ')} + ${remainingFormula}`;
      } else {
        this.formula = diceParts.join(' + ');
      }
    } else {
      this.formula = `1${die}`;
    }
    formulaInput.value = this.formula;
    
    formulaInput.dispatchEvent(new Event('input'));
  }

  /**
   * Validate the formula using Roll.validate
   * @param {string} formula
   * @returns {boolean}
   */
  validateFormula(formula) {
    if (!formula || formula.trim() === "") return false;
    
    try {
      return Roll.validate(formula);
    } catch (error) {
      try {
        new Roll(formula, this.actor?.getRollData() || {});
        return true;
      } catch (e) {
        return false;
      }
    }
  }

  /**
   * Handle roll button click
   */
  async rollDice() {
    LogUtil.log('rollDice');
    if (!this.validateFormula(this.formula)) {
      ui.notifications.error(game.i18n.format("FLASH_ROLLS.notifications.invalidFormula", {
        formula: this.formula || "empty"
      }));
      return;
    }

    if (this.callback) {
      await this.callback({ formula: this.formula, rollMode: this.rollMode });
    }

    this.close();
  }

  /**
   * Handle cancel button click
   */
  cancel() {
    this.close();
  }

  /**
   * Show the dialog and return a promise for the result
   * @param {Object} options
   * @param {string} [options.formula] - Initial formula value
   * @param {boolean} [options.readonly] - Whether the formula is readonly
   * @param {string} [options.rollMode] - Initial roll mode
   * @returns {Promise<{formula: string, rollMode: string}|null>} Result object or null if cancelled
   */
  static async prompt(options = {}) {
    return new Promise((resolve) => {
      const dialog = new this({
        ...options,
        callback: (result) => resolve(result)
      });

      dialog.addEventListener("close", () => {
        if (!dialog._resolved) {
          resolve(null);
        }
      });

      dialog.render(true);
    });
  }

  /**
   * Override close to track resolution
   */
  async close(options = {}) {
    this._resolved = true;
    return super.close(options);
  }
}