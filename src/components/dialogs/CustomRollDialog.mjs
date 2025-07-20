import { MODULE } from "../../constants/General.mjs";
import { LogUtil } from "../LogUtil.mjs";

/**
 * Custom Roll Dialog - ApplicationV2 component for custom roll formulas
 */
export class CustomRollDialog extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.formula = options.formula || "";
    this.readonly = options.readonly || false;
    this.actor = options.actor;
    this.callback = options.callback;
    this.diceCounts = {};
  }

  /**
   * Default application configuration
   */
  static DEFAULT_OPTIONS = {
    id: "crlngn-custom-roll-dialog",
    classes: ["flash-rolls-5e-dialog", "crlngn-custom-roll-dialog"],
    tag: "div",
    window: {
      title: "CRLNGN_ROLLS.ui.dialogs.customRollTitle",
      icon: "fas fa-dice-d20",
      resizable: false,
      positioned: true,
      frame: true
    },
    position: {
      width: 420,
      height: "auto"
    }
  };
  
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
    return {
      ...context,
      formula: this.formula,
      readonly: this.readonly
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
    
    if (formulaInput && !this.readonly) {
      // Update internal formula on input change and validate
      formulaInput.addEventListener('input', (event) => {
        this.formula = event.target.value.trim();
        this.updateValidationMessage(validationMessage);
      });
      
      // Validate on initial load if there's a formula
      if (this.formula) {
        this.updateValidationMessage(validationMessage);
      }
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
      messageElement.textContent = game.i18n.localize("CRLNGN_ROLLS.ui.dialogs.formulaValid");
      messageElement.classList.remove('error');
      messageElement.classList.add('success');
    } else {
      messageElement.textContent = game.i18n.localize("CRLNGN_ROLLS.ui.dialogs.formulaInvalid");
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
    
    // Get current formula from input field
    const formulaInput = this.element.querySelector('#custom-roll-formula');
    if (!formulaInput) return;
    
    const currentFormula = formulaInput.value.trim();
    
    // Parse the current formula to consolidate dice
    if (currentFormula) {
      // Regular expression to find dice expressions (e.g., 2d6, d8, 1d20)
      const diceRegex = /(\d*)d(\d+)/g;
      const diceMap = new Map();
      
      // Parse existing dice in the formula
      let remainingFormula = currentFormula;
      let match;
      
      while ((match = diceRegex.exec(currentFormula)) !== null) {
        const count = parseInt(match[1] || '1');
        const dieType = match[2];
        diceMap.set(dieType, (diceMap.get(dieType) || 0) + count);
        remainingFormula = remainingFormula.replace(match[0], '').trim();
      }
      
      // Add the new die
      const newDieType = die.substring(1); // Remove 'd' prefix
      diceMap.set(newDieType, (diceMap.get(newDieType) || 0) + 1);
      
      // Rebuild the formula
      const diceParts = [];
      for (const [dieType, count] of diceMap) {
        diceParts.push(`${count}d${dieType}`);
      }
      
      // Clean up remaining formula (remove extra + signs)
      remainingFormula = remainingFormula.replace(/^\+\s*|\s*\+\s*$|\s*\+\s*\+/g, '').trim();
      
      // Combine dice and remaining formula
      if (remainingFormula && remainingFormula !== '+') {
        this.formula = `${diceParts.join(' + ')} + ${remainingFormula}`;
      } else {
        this.formula = diceParts.join(' + ');
      }
    } else {
      // If empty, just add the die
      this.formula = `1${die}`;
    }
    
    // Update the input field
    formulaInput.value = this.formula;
    
    // Trigger input event to update validation
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
      // Use Roll.validate to check if the formula is valid
      return Roll.validate(formula);
    } catch (error) {
      // If Roll.validate doesn't exist or throws, try creating a roll
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
    
    // Validate the formula
    if (!this.validateFormula(this.formula)) {
      ui.notifications.error(game.i18n.format("CRLNGN_ROLLS.ui.notifications.invalidFormula", {
        formula: this.formula || "empty"
      }));
      return;
    }
    
    // Call the callback if provided
    if (this.callback) {
      await this.callback(this.formula);
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
   * Show the dialog and return a promise for the formula
   * @param {Object} options
   * @returns {Promise<string|null>}
   */
  static async prompt(options = {}) {
    return new Promise((resolve) => {
      const dialog = new this({
        ...options,
        callback: (formula) => resolve(formula)
      });
      
      dialog.addEventListener("close", () => {
        // If closed without a formula, resolve with null
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