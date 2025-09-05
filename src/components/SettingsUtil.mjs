import { MODULE_ID } from "../constants/General.mjs";
import { getSettings, SETTING_SCOPE } from "../constants/Settings.mjs";
import { getSettingMenus } from "../constants/SettingMenus.mjs";
import { LogUtil } from "./LogUtil.mjs";
import RollRequestsMenu from "./RollRequestsMenu.mjs";

/**
 * Utility class for managing module settings
 */
export class SettingsUtil {
  static coreColorScheme = "dark";
  
  /**
   * Register all module settings
   * @static
   */
  static registerSettings() {
    const SETTINGS = getSettings();
    var isDebugOn = SettingsUtil.get(SETTINGS.debugMode.tag);
    if(isDebugOn){CONFIG.debug.hooks = true};

    /* Register each of the settings defined in the SETTINGS constant */
    const settingsList = Object.entries(SETTINGS);
    settingsList.forEach((entry) => {
      const setting = entry[1]; 

      const settingObj = { 
        name: setting.label,
        hint: setting.hint,
        default: setting.default,
        type: setting.propType,
        scope: setting.scope,
        config: setting.config,
        requiresReload: setting.requiresReload || false,
        restricted: setting.scope === SETTING_SCOPE.world,
        onChange: value => SettingsUtil.apply(setting.tag, value)
      }
      if(setting.choices){
        settingObj.choices = setting.choices;
      }

      LogUtil.log('registerSettings', [settingObj, settingObj.scope], true);

      try {
        game.settings.register(MODULE_ID, setting.tag, settingObj);
      } catch (error) {
        LogUtil.log(`Setting ${setting.tag} already registered or error:`, error);
      }
    });
    
  }

  /**
   * Register the settings menu - should be called during ready hook
   * @static
   */
  static registerSettingsMenu() {
    const settingMenus = Object.entries(getSettingMenus());
    
    for (const [menuKey, menuData] of settingMenus) {
      if ((menuData.restricted && game.user?.isGM) || !menuData.restricted) {
        const menuObj = {
          name: menuData.tag,
          label: menuData.label, 
          hint: menuData.hint,
          icon: menuData.icon, 
          type: menuData.propType,
          restricted: menuData.restricted
        };
        game.settings.registerMenu(MODULE_ID, menuData.tag, menuObj);
      }
    }

    SettingsUtil.updateColorScheme();
  }

  static updateColorScheme(){
    // const uiConfig = SettingsUtil.get("uiConfig", "core"); 
    const foundryUiConfig = game.settings.get('core','uiConfig'); 
    SettingsUtil.coreColorScheme = foundryUiConfig?.colorScheme?.interface || "dark";
    LogUtil.log('SettingsUtil.updateColorScheme', [foundryUiConfig, SettingsUtil.coreColorScheme]);
  }
  
  /**
   * Retrieves the value of a module setting
   * @param {string} settingName - Name of the setting to retrieve
   * @param {string} [moduleName=MODULE_ID] - ID of the module the setting belongs to
   * @returns {*} Current value of the setting
   */
  static get(settingName, moduleName=MODULE_ID){
    if(!settingName){ return null; }

    let setting = false;

    try {
      if(moduleName===MODULE_ID){
        setting = game.settings.get(moduleName, settingName);
      }else{
        const client = game.settings.storage.get("client");
        let selectedSetting = client[`${moduleName}.${settingName}`];
        //
        if(selectedSetting===undefined){
          const world = game.settings.storage.get("world");
          selectedSetting = world.getSetting(`${moduleName}.${settingName}`);
          setting = selectedSetting?.value;
        }
      }
    } catch (error) {
      // Setting not registered yet, return default
      LogUtil.log(`Setting ${moduleName}.${settingName} not found, returning false`);
      return false;
    }

    return setting;
  }
  
  /**
   * Updates the value of a module setting
   * @param {string} settingName - Name of the setting to update
   * @param {*} newValue - New value to set
   * @param {string} [moduleName=MODULE_ID] - ID of the module the setting belongs to
   * @returns {boolean} True if setting was updated successfully
   */
  static set(settingName, newValue, moduleName=MODULE_ID){ 
    if(!settingName){ return false; }

    let selectedSetting = game.settings.storage.get("client")[`${moduleName}.${settingName}`];

    if(!selectedSetting){
      const world = game.settings.storage.get("world");
      selectedSetting = world.getSetting(`${moduleName}.${settingName}`);
      LogUtil.log('SettingsUtil.set - world Setting?', [selectedSetting]);
    } 

    try{
      game.settings.set(moduleName, settingName, newValue);
      LogUtil.log('SettingsUtil.set - success', [moduleName, settingName, newValue]);
    }catch(e){
      LogUtil.error('SettingsUtil.set - error', [e]);
    }

    return true;
  }

  static apply(settingName, newValue){
    const SETTINGS = getSettings();
    switch(settingName){
      case SETTINGS.rollRequestsEnabled.tag:
        SettingsUtil.applyRollRequestsEnabled(newValue);
        break;
      case SETTINGS.compactMode.tag:
        SettingsUtil.applyCompactMode(newValue);
        break;
      default:
        break;
    }
  }

  static applyRollRequestsEnabled(newValue){
    const requestsIcon = document.querySelector(".chat-controls .flash-rolls-icon");
    if(!requestsIcon){ return; }
    
    if(newValue){
      requestsIcon.classList.add("active");
      // requestsIcon.setAttribute("aria-pressed", "true");
    }else{
      requestsIcon.classList.remove("active");
      // requestsIcon.setAttribute("aria-pressed", "false");
    }
  }

  static applyCompactMode(newValue){
    const SETTINGS = getSettings();
    const isCompactMode = newValue || SettingsUtil.get(SETTINGS.compactMode.tag);

    LogUtil.log('applyCompactMode', [isCompactMode]);
    
    RollRequestsMenu.refreshIfOpen();
  }
}
