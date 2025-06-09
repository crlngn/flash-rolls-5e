import { MODULE_ID } from "../constants/General.mjs";
import { getSettings } from "../constants/Settings.mjs";
import { LogUtil } from "./LogUtil.mjs";
import { RequestsUtil } from "./RequestsUtil.mjs";
import { RollRequestsMenu } from "./RollRequestsMenu.mjs";

/**
 * Utility class for managing module settings
 */
export class SettingsUtil {
  
  /**
   * Register all module settings
   * @static
   */
  static registerSettings() {
    const SETTINGS = getSettings();
    
    /* Register each of the settings defined in the SETTINGS constant */
    const settingsList = Object.entries(SETTINGS);
    settingsList.forEach(async(entry) => {
      const setting = entry[1]; 
      LogUtil.log("Registering... ",[entry]);

      const settingObj = { 
        name: setting.label,
        hint: setting.hint,
        default: setting.default,
        type: setting.propType,
        scope: setting.scope,
        config: setting.config,
        requiresReload: setting.requiresReload || false,
        onChange: value => SettingsUtil.apply(setting.tag, value)
      }
      if(setting.choices){
        settingObj.choices = setting.choices;
      }

      await game.settings.register(MODULE_ID, setting.tag, settingObj);

      /* if the setting has never been defined, set as default value */
      if(SettingsUtil.get(setting.tag)===undefined){
        SettingsUtil.set(setting.tag, setting.default);
      }
      LogUtil.log("registerSettings",[setting.tag, SettingsUtil.get(setting.tag)]);
    });
    SettingsUtil.applySkipDialogsSetting();
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
      LogUtil.log("GET Setting", [selectedSetting, setting]);
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
    } 
    LogUtil.log("Setting",[settingName, selectedSetting]);

    try{
      game.settings.set(moduleName, settingName, newValue);
    }catch(e){
      LogUtil.log("Unable to change setting",[settingName, selectedSetting]);
    }

    return true;
  }

  static apply(settingName, newValue){
    const SETTINGS = getSettings();
    switch(settingName){
      case SETTINGS.rollRequestsEnabled.tag:
        SettingsUtil.applyRollRequestsSetting(newValue);
        break;
      case SETTINGS.skipDialogs.tag:
        SettingsUtil.applySkipDialogsSetting(newValue);
        break;
      default:
        break;
    }
  }

  static applyRollRequestsSetting(value){
    const SETTINGS = getSettings();
    LogUtil.log("applyRollRequestsSetting", [value]);
    const isEnabled = value || SettingsUtil.get(SETTINGS.rollRequestsEnabled.tag);
    RequestsUtil.requestsEnabled = isEnabled;

    // update the layout
    const rollRequestsToggle = document.querySelector("#crlngn-requests-toggle");
    if(!rollRequestsToggle){ return; }
    if (isEnabled === false) {
      rollRequestsToggle.classList.remove("active");
    } else {
      rollRequestsToggle.classList.add("active");
    }

    const tooltipStr = game.i18n.localize(rollRequestsToggle.classList.contains("active") ? 
      "CRLNGN_ROLLS.ui.buttons.rollRequestsToggleOn" : 
      "CRLNGN_ROLLS.ui.buttons.rollRequestsToggleOff");
    rollRequestsToggle.dataset.tooltip = tooltipStr;

    if (game.user.isGM && game.tooltip) {
      game.tooltip.activate(rollRequestsToggle, {text: tooltipStr});
    }

    RollRequestsMenu.hideActorsMenu();
    RollRequestsMenu.showActorsMenu();
    
    LogUtil.log("Roll Requests Toggle", [isEnabled, rollRequestsToggle]);
  }

  static applySkipDialogsSetting(value){
    const SETTINGS = getSettings();
    RequestsUtil.skipDialogs = value || SettingsUtil.get(SETTINGS.skipDialogs.tag);
    LogUtil.log("applySkipDialogsSetting", [value]);
  }

}
