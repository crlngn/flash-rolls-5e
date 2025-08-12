import { getSettings } from "../../constants/Settings.mjs";
import { getSettingMenus } from "../../constants/SettingMenus.mjs";
import { LogUtil } from "../LogUtil.mjs";
import { SettingsUtil } from "../SettingsUtil.mjs";
import { GeneralUtil } from "../helpers/GeneralUtil.mjs";

const { FormDataExtended } = foundry.utils;

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
      contentClasses: ["standard-form", "crlngn", "tabbed-settings"],
      resizable: true
    },
    position: {
      width: 700,
      height: "auto"
    },
    actions: {
      redefine: ModuleSettingsMenu.#onReset
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
    groupRolls: {
      menuKey: "groupRollsSettings",
      template: "modules/flash-rolls-5e/templates/settings-group-rolls.hbs",
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
      initial: "generalSettings",
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

    // add listener to .toggle-hint 
    const hintToggles = ModuleSettingsMenu.#element.querySelectorAll('.toggle-hint');
    LogUtil.log("_onRender", [context, options, this.element]);
    hintToggles.forEach(toggle => {
      toggle.addEventListener('click', () => {
        ModuleSettingsMenu.#element.querySelectorAll('p.hint').forEach(p => p.classList.toggle('shown'));
      });
    });
    
    // Set the selected value for select elements based on data-current-value
    const selects = ModuleSettingsMenu.#element.querySelectorAll('select[data-current-value]');
    selects.forEach(select => {
      const currentValue = String(select.dataset.currentValue);
      const option = select.querySelector(`option[value="${currentValue}"]`);
      if (option) {
        option.selected = true;
      }
    });

    // const controlSettings = SettingsUtil.get(SETTINGS.moduleSettingsMenu.tag);
    LogUtil.log("_onRender", [context, options]);
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

    ui.notifications.info(game.i18n.localize('FLASH_ROLLS.notifications.settingsUpdated'));
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
    // SettingsUtil.get(SETTINGS[menuKey].tag)

    const inputs = activeContent.querySelectorAll("input, select");
    inputs.forEach(inputField => {
      inputField.value = defaults[inputField.name];
      if(inputField.type==='checkbox'){
        inputField.checked = defaults[inputField.name];
      }
    });

    LogUtil.log("#onReset", [ModuleSettingsMenu.#activeTab, activeTab, a, b]);
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
