import { getSettings } from "../../../constants/Settings.mjs";
import { getSettingMenus } from "../../../constants/SettingMenus.mjs";
import { LogUtil } from "../../utils/LogUtil.mjs"
import { SettingsUtil } from "../../utils/SettingsUtil.mjs";
import { GeneralUtil } from "../../utils/GeneralUtil.mjs";
import { FlashAPI } from "../../core/FlashAPI.mjs";
import { IconLayoutUtil } from "../../utils/IconLayoutUtil.mjs";
import { LibWrapperUtil } from "../../utils/LibWrapperUtil.mjs";
import { PremiumFeaturesDialog } from "./PremiumFeaturesDialog.mjs";

const { FormDataExtended } = foundry.applications.ux;

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Tabbed Settings Menu application for managing all module settings in a unified interface.
 * Provides a tabbed form interface for accessing all settings categories in one place.
 * @extends {HandlebarsApplicationMixin(ApplicationV2)}
 */ 
export class ModuleSettingsMenu extends HandlebarsApplicationMixin(ApplicationV2) {
  static #element;
  static #activeTab;
  static #requireReload;
  static selectedTheme;

  /**
   * Default application options
   * @static
   */
  static DEFAULT_OPTIONS = {
    id: "flash-rolls-settings",
    tag: "form",
    window: {
      icon: "fas fa-cog",
      title: "FLASH_ROLLS.settings.moduleSettingsMenu.title",
      contentClasses: ["standard-form", "crlngn", "flash5e", "tabbed-settings"],
      resizable: true
    },
    position: {
      width: 700,
      height: "auto"
    },
    actions: {
      redefine: ModuleSettingsMenu.#onReset,
      connectPatreon: ModuleSettingsMenu.#onConnectPatreon
    },
    form: {
      handler: ModuleSettingsMenu.#onSubmit,
      closeOnSubmit: true
    }
  }

  /**
   * Template parts used for rendering the application
   * @static
   */
  static PARTS = {
    tabs: {
      template: "templates/generic/tab-navigation.hbs",
      isGMOnly: false
    },
    generalSettings: {
      menuKey: "generalSettings",
      template: "modules/flash-rolls-5e/templates/settings-general.hbs",
      isGMOnly: true
    },
    interfaceSettings: {
      menuKey: "interfaceSettings",
      template: "modules/flash-rolls-5e/templates/settings-interface.hbs",
      isGMOnly: true
    },
    groupRolls: {
      menuKey: "groupRollsSettings",
      template: "modules/flash-rolls-5e/templates/settings-group-rolls.hbs",
      isGMOnly: true
    },
    rollRequests: {
      menuKey: "rollRequestsSettings",
      template: "modules/flash-rolls-5e/templates/settings-roll-requests.hbs",
      isGMOnly: true
    },
    integrations: {
      menuKey: "integrationSettings",
      template: "modules/flash-rolls-5e/templates/settings-integrations.hbs",
      isGMOnly: true
    },
    footer: {
      template: "templates/generic/form-footer.hbs",
      isGMOnly: false
    }
  };

  /**
   * Tab configuration for the application
   * @static
   */
  static TABS = {
    primary: {
      initial: "interfaceSettings",
      tabs: ModuleSettingsMenu.#getTabs(),
      labelPrefix: ""
    }
  };

  /** @inheritDoc */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    const restrictedTabs = ModuleSettingsMenu.getRestrictedTabs();

    if(!game.user.isGM){
      restrictedTabs.forEach(tab => {
        delete parts[tab];
      })
    }

    return parts;
  }

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.activeTab = options.activeTab || Object.keys(context.tabs)[0];
    context.isGM = game.user.isGM;
    context.interceptWarning = GeneralUtil.isModuleOn("midi-qol");
    context.interceptWarning = game.i18n.localize("FLASH_ROLLS.notifications.interceptWarning");

    return context;
  }

   /** @inheritDoc */
   async _preparePartContext(partId, context, options) {
    const partContext = await super._preparePartContext(partId, context, options);
    if ( partId in context.tabs ) partContext.tab = partContext.tabs[partId];
    const SETTINGS = getSettings();
    const SETTINGS_MENUS = getSettingMenus();
    const restrictedTabs = ModuleSettingsMenu.getRestrictedTabs();

    if(!game.user.isGM){
      restrictedTabs.forEach(tab => {
        delete partContext.tabs[tab];
      })
    }
    switch ( partId ) {
      case "tabs": {
        break;
      }
      case "footer": {
        partContext.buttons = [
          { type: "button", icon: "", label: "FLASH_ROLLS.ui.buttons.reset", action: 'redefine' },
          { type: "submit", icon: "", label: "FLASH_ROLLS.ui.buttons.save" }
        ];
        break;
      }
      default: {
        partContext.tab = partContext.tabs[partId];
        const partKey = ModuleSettingsMenu.PARTS[partId]?.menuKey || null;
        if(partKey){
          const menuContext = ModuleSettingsMenu.getMenuContext(partKey);
          
          if (menuContext.fields) {
            partContext.fields = {
              ...partContext.fields,
              ...menuContext.fields
            }
          }

          if (menuContext.fieldDefaults) {
            partContext.fieldDefaults = {
              ...partContext.fieldDefaults,
              ...menuContext.fieldDefaults
            }
          }

          if (menuContext.fieldValues) {
            Object.assign(partContext, menuContext.fieldValues);
          }

          // Add icon layout data for interface settings
          if (partId === 'interfaceSettings') {
            partContext.iconConfigs = IconLayoutUtil.getIconConfigurations();

            // Build complete icon list from mappings, then apply saved settings
            const configs = IconLayoutUtil.getIconConfigurations();
            const SETTINGS = getSettings();
            const defaultIconsLayout = SETTINGS.menuIconsLayout.default;
            const savedSettings = partContext.menuIconsLayout || {};

            // Create a function to merge icon configs with default and saved settings
            const buildIconList = (iconType, iconConfigs) => {
              const defaultIcons = defaultIconsLayout[iconType] || [];
              const savedIcons = savedSettings[iconType] || [];

              const defaultIconsMap = new Map(defaultIcons.map(icon => [icon.id, icon]));
              const savedIconsMap = new Map(savedIcons.map(icon => [icon.id, icon]));

              // Get all available icons from mappings
              const allIcons = Object.keys(iconConfigs).map((iconId, index) => {
                const config = iconConfigs[iconId];
                const defaultIcon = defaultIconsMap.get(iconId);
                const savedIcon = savedIconsMap.get(iconId);

                return {
                  id: iconId,
                  icon: config.icon,
                  // Priority: saved settings > default settings > disabled for new icons
                  enabled: savedIcon ? savedIcon.enabled : (defaultIcon ? defaultIcon.enabled : false),
                  order: savedIcon ? savedIcon.order : (defaultIcon ? defaultIcon.order : index),
                  label: game.i18n.localize(config.labelKey || iconId)
                };
              });

              // Sort by order
              return allIcons.sort((a, b) => a.order - b.order);
            };

            partContext.menuIconsLayout = {
              moduleActions: buildIconList('moduleActions', configs.moduleActions),
              actorActions: buildIconList('actorActions', configs.actorActions)
            };
          }

          partContext.sidebarTabs = Object.values(foundry.applications?.sidebar?.tabs || {}).map(tab => ({
            tabName: tab.tabName,
            name: tab.name,
            hideForGM: false,
            hideForPlayer: false,
            localizedName: `FLASH_ROLLS.settings.sidebarTabs.${tab.name}`
          }));
        }
        break;
      }
    }
    LogUtil.log("_preparePartContext", [partContext, partId]);
    return partContext;
  }

  /**
   * Retrieves the context object containing fields, field values, and field defaults for a specific menu
   * @param {string} menuKey - The key of the setting menu
   * @returns {object} The context object containing fields, field values, and field defaults
   */
  static getMenuContext(menuKey){
    const SETTINGS = getSettings();
    const fieldNames = SETTINGS[menuKey]?.fields || null;
    if(!fieldNames) return {};
    const fields = {};
    const fieldValues = {};
    const fieldDefaults = {};

    fieldNames.forEach((fieldName) => {
      if(SETTINGS[fieldName]) {
        const value = SettingsUtil.get(SETTINGS[fieldName].tag);
        fields[fieldName] = SETTINGS[fieldName];
        fieldValues[fieldName] = value!== undefined ? value : SETTINGS[fieldName].default;
        fieldDefaults[fieldName] = SETTINGS[fieldName].default;
      }
    });

    return {fields: fields, fieldValues: fieldValues, fieldDefaults: fieldDefaults};
  }

  /**
   * Retrieves the keys of setting menus that are restricted to GMs
   * @returns {string[]} Array of setting menu keys
   */
  static getRestrictedTabs(){
    const restrictedTabs = [];
    Object.entries(ModuleSettingsMenu.PARTS).forEach((entry, index) => {
      if(entry[0]!=="tabs" && entry[0]!=="footer" && entry[1].isGMOnly){
        restrictedTabs.push(entry[0]);
      }
    });
    return restrictedTabs;
  }

  /**
   * Handles post-render operations
   * @protected
   * @param {object} context - The render context
   * @param {object} options - The render options
   */
  _onRender = (context, options) => {
    const SETTINGS = getSettings();
    ModuleSettingsMenu.#element = this.element;

    const hintToggles = ModuleSettingsMenu.#element.querySelectorAll('.toggle-hint');
    hintToggles.forEach(toggle => {
      toggle.addEventListener('click', () => {
        ModuleSettingsMenu.#element.querySelectorAll('p.hint').forEach(p => p.classList.toggle('shown'));
      });
    });

    // Initialize icon drag and drop functionality
    const iconContainer = ModuleSettingsMenu.#element.querySelector('.icon-arrangement-container');
    if (iconContainer) {
      IconLayoutUtil.initializeDragAndDrop(iconContainer);
    }
    
    const selects = ModuleSettingsMenu.#element.querySelectorAll('select[data-current-value]');
    selects.forEach(select => {
      const currentValue = String(select.dataset.currentValue);
      const option = select.querySelector(`option[value="${currentValue}"]`);
      if (option) {
        option.selected = true;
      }
    });
    
    // Set up range input synchronization
    this.#setupRangeInputs();
  }

  /**
   * Set up synchronization between range sliders and number inputs
   */
  #setupRangeInputs() {
    const rangeGroups = ModuleSettingsMenu.#element.querySelectorAll('.form-group.range');
    rangeGroups.forEach(group => {
      const rangeInput = group.querySelector('input[type="range"]');
      const valueInput = group.querySelector('input[type="number"]');
      this.#handleRangeInputs(rangeInput, valueInput);
    });
  }

  /**
   * Handle synchronization between range slider and number input
   * @param {HTMLInputElement} rangeInput - The range slider input
   * @param {HTMLInputElement} valueInput - The number input
   */
  #handleRangeInputs(rangeInput, valueInput) {
    if (rangeInput && valueInput) {
      const min = parseInt(rangeInput.min, 10);
      const max = parseInt(rangeInput.max, 10);

      // Listener for the range slider's input event
      rangeInput.addEventListener('input', () => {
        valueInput.value = rangeInput.value;
      });

      // Listener for the number input's input event (while typing)
      valueInput.addEventListener('input', () => {
        const currentValueString = valueInput.value;
        if (currentValueString === "" || currentValueString === "-") {
          return;
        }
        const currentValue = parseInt(currentValueString, 10);
        if (!isNaN(currentValue) && currentValue >= min && currentValue <= max) {
          rangeInput.value = currentValue;
        }
      });

      // Listener for the number input's change event (after typing/blur/enter)
      valueInput.addEventListener('change', () => {
        let value = parseInt(valueInput.value, 10);

        if (isNaN(value) || value < min) {
          value = min;
        } else if (value > max) {
          value = max;
        }
        
        valueInput.value = value; // Update the input field to the clamped/validated value
        rangeInput.value = value; // Sync the slider
      });

      // Set initial value for the number input from the range slider
      valueInput.value = rangeInput.value;
    }
  }

  /**
   * Handles form submission and updates left controls settings
   * @private
   * @static
   * @param {Event} event - The form submission event
   * @param {HTMLFormElement} form - The form element
   * @param {FormData} formData - The form data object
   * @returns {Promise<void>}
   */
  static async #onSubmit(event, form, formData) {
    event.preventDefault();
    event.stopPropagation();

    let confirmReload = ModuleSettingsMenu.updateSettings(formData);

    if(confirmReload){
      GeneralUtil.confirmReload();
    }
  }

  static updateSettings(formData){
    let confirmReload = false;
    const SETTINGS = getSettings();
    const html = ModuleSettingsMenu.#element;
    const activeContent = html.querySelector(".form-content.active");
    const activeTab = activeContent.dataset.tab;
    ModuleSettingsMenu.#activeTab = activeTab;

    if(!formData){
      return;
    }

    // Convert FormData into an object with proper keys
    let settings;
    if (formData.object) {
      settings = foundry.utils.expandObject(formData.object);
    } 

    let fieldNames = [];

    Object.entries(settings).forEach(([fieldName, value]) => {
      // Skip auxiliary form fields like range value inputs
      if(fieldName.endsWith('_value')) return;
      
      LogUtil.log("updateSettings #1", [SETTINGS, SETTINGS[fieldName]]);
      if(settings[fieldName] !== undefined && SETTINGS[fieldName]) {
        const currSetting = SettingsUtil.get(SETTINGS[fieldName].tag);
        SettingsUtil.set(SETTINGS[fieldName].tag, settings[fieldName]);
        
        if(SETTINGS[fieldName]?.requiresReload && currSetting !== settings[fieldName]){
          confirmReload = true;
        }
      }
    });

    FlashAPI.notify('info',game.i18n.localize('FLASH_ROLLS.notifications.settingsUpdated'));
    return confirmReload;
  }

  /** @inheritDoc */
  changeTab(tab, group, options) {
    super.changeTab(tab, group, options);
    ModuleSettingsMenu.#activeTab = tab;
  }

  /**
   * Resets form fields to their default values
   * @private
   * @static
   * @param {Event} a - The reset event
   * @param {HTMLElement} b - The form element
   * @returns {Promise<void>}
   */
  static async #onReset(a, b){
    const SETTINGS = getSettings();
    const html = ModuleSettingsMenu.#element;
    const activeContent = html.querySelector(".form-content.active");
    const activeTab = activeContent.dataset.tab;
    const menuKey = ModuleSettingsMenu.PARTS[activeTab].menuKey;
    const defaults = SETTINGS[menuKey].default;

    // Handle icon layout reset for interface settings
    if (activeTab === 'interfaceSettings') {
      IconLayoutUtil.resetToDefault();
      const app = foundry.applications.instances.get('flash-rolls-settings');
      if (app) {
        await app.renderPart('interfaceSettings', { force: true });
        return;
      }
    }

    const inputs = activeContent.querySelectorAll("input, select");
    inputs.forEach(inputField => {
      const nameParts = inputField.name.split('.');
      let defaultValue = defaults;
      for (const part of nameParts) {
        defaultValue = defaultValue?.[part];
      }
      if (defaultValue !== undefined) {
        inputField.value = defaultValue;
        if (inputField.type === 'checkbox') {
          inputField.checked = defaultValue;
        }
      }
    });

    LogUtil.log("#onReset", [ModuleSettingsMenu.#activeTab, activeTab, a, b]);
  }

  /**
   * Open the Patreon features dialog on its member authentication tab
   * @param {PointerEvent} event - The originating click event
   * @param {HTMLElement} target - The button that was clicked
   */
  static #onConnectPatreon(event, target) {
    event.preventDefault();
    LogUtil.log("#onConnectPatreon", [target]);
    new PremiumFeaturesDialog({ initialTab: "authentication" }).render(true);
  }

  static #getTabs() {
    const tabList = [];
    Object.entries(ModuleSettingsMenu.PARTS).forEach(([key, value]) => {
      if(value.menuKey) {
        tabList.push({
          id: key,
          icon: '',
          group: 'primary-tabs',
          label: `FLASH_ROLLS.settings.moduleSettingsMenu.tabs.${key}`
        })
      }
    })
    return tabList;
  }

}
