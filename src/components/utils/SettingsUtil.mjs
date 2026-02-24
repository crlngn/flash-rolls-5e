import { MODULE_ID } from "../../constants/General.mjs";
import { getSettings, SETTING_SCOPE } from "../../constants/Settings.mjs";
import { getSettingMenus } from "../../constants/SettingMenus.mjs";
import { getDefaultIconLayout } from "../../constants/IconMappings.mjs";
import { LogUtil } from "../utils/LogUtil.mjs";
import RollRequestsMenu from "../ui/RollRequestsMenu.mjs";
import { GeneralUtil } from "./GeneralUtil.mjs";
import { TokenMovementManager } from "./TokenMovementManager.mjs";

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

      LogUtil.log('registerSettings', [settingObj, settingObj.scope]);

      try {
        game.settings.register(MODULE_ID, setting.tag, settingObj);
      } catch (error) {
        LogUtil.log(`Setting ${setting.tag} already registered or error:`, error);
      }
    });

    SettingsUtil._registerMidiCompatSettings();
  }

  /**
   * Temporary fix: Register hidden settings for Midi-QOL compatibility.
   * Midi reads game.settings.get("flash-rolls-5e", "skipRollDialog") to determine
   * whether to fast-forward rolls it detects as originating from Flash.
   * Due to a detection false-positive in Midi, ALL player rolls are treated as Flash
   * rolls when the module is installed. This setting tells Midi to allow fast-forwarding,
   * while actual Flash request rolls override dialog.configure explicitly via hooks.
   * @static
   * @private
   */
  static _registerMidiCompatSettings() {
    try {
      game.settings.register(MODULE_ID, "skipRollDialog", {
        name: "Midi-QOL Fast Forward Compatibility",
        hint: "Allows Midi-QOL to fast-forward rolls when Flash Token Bar is installed",
        default: true,
        type: Boolean,
        scope: "world",
        config: false
      });
    } catch (error) {
      LogUtil.log('Midi compat setting skipRollDialog already registered or error:', error);
    }
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
    SettingsUtil.validateAndUpdateIconLayout();
    SettingsUtil.checkMidiQol();
    SettingsUtil.initializeMaxIconsPerRow();
  }

  /**
   * Verify if Midi-QoL is installed and active
   * Disable incompatible settings if true
   */
  static checkMidiQol(){
    const SETTINGS = getSettings();
    const isMidiActive = GeneralUtil.isModuleOn('midi-qol');
    const isRollInterceptionEnabled = SettingsUtil.get(SETTINGS.rollInterceptionEnabled.tag);
    
    LogUtil.log('checkMidiQol', [isMidiActive, isRollInterceptionEnabled]);
    
    // if(game.user?.isGM && isMidiActive && isRollInterceptionEnabled){
    //   // SettingsUtil.set(SETTINGS.rollInterceptionEnabled.tag, false);
    //   // ui.notifications.info(game.i18n.localize("FLASH_ROLLS.notifications.interceptWarning"), {permanent: true});
    // }
  }

  static updateColorScheme(){
    // const uiConfig = SettingsUtil.get("uiConfig", "core"); 
    const foundryUiConfig = game.settings.get('core','uiConfig'); 
    let interfaceTheme = foundryUiConfig?.colorScheme?.interface;
    
    // If Browser Default, detect browser preference
    if (!interfaceTheme) {
      if (matchMedia("(prefers-color-scheme: dark)").matches) {
        interfaceTheme = "dark";
      } else if (matchMedia("(prefers-color-scheme: light)").matches) {
        interfaceTheme = "light";
      }
    }
    
    SettingsUtil.coreColorScheme = interfaceTheme;
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
   * @returns {Promise<boolean>} True if setting was updated successfully
   */
  static async set(settingName, newValue, moduleName=MODULE_ID){
    if(!settingName){ return false; }

    let selectedSetting = game.settings.storage.get("client")[`${moduleName}.${settingName}`];

    if(!selectedSetting){
      const world = game.settings.storage.get("world");
      selectedSetting = world.getSetting(`${moduleName}.${settingName}`);
      LogUtil.log('SettingsUtil.set - world Setting?', [selectedSetting]);
    }

    try{
      await game.settings.set(moduleName, settingName, newValue);
      LogUtil.log('SettingsUtil.set - success', [moduleName, settingName]);
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
      case SETTINGS.rollInterceptionEnabled.tag:
        SettingsUtil.applyRollInterceptionEnabled(newValue);
        break;
      case SETTINGS.compactMode.tag:
        SettingsUtil.applyCompactMode(newValue);
        break;
      case SETTINGS.menuLayout.tag:
        SettingsUtil.applyMenuLayout(newValue);
        break;
      case SETTINGS.menuIconsLayout.tag:
        SettingsUtil.applyMenuIconsLayout(newValue);
        break;
      case SETTINGS.maxIconsPerRow.tag:
        SettingsUtil.applyMaxIconsPerRow(newValue);
        break;
      case SETTINGS.actorStatsToShow.tag:
        SettingsUtil.applyActorStatsToShow(newValue);
        break;
      case SETTINGS.autoBlockMovementInCombat.tag:
        SettingsUtil.applyAutoBlockMovementInCombat(newValue);
        break;
      default:
        break;
    }
  }

  static applyRollInterceptionEnabled(newValue){
    SettingsUtil.checkMidiQol();
  }

  static applyRollRequestsEnabled(newValue){
    const requestsIcon = document.querySelector(".chat-controls .flash-rolls-icon");
    if(!requestsIcon){ return; }
    
    if(newValue){
      requestsIcon.classList.add("active");
    }else{
      requestsIcon.classList.remove("active");
    }
  }

  static applyCompactMode(newValue){
    const SETTINGS = getSettings();
    const isCompactMode = newValue || SettingsUtil.get(SETTINGS.compactMode.tag);

    LogUtil.log('applyCompactMode', [isCompactMode]);
    
    RollRequestsMenu.refreshIfOpen();
  }

  static applyMenuLayout(newValue){
    const SETTINGS = getSettings();
    const menuLayout = newValue || SettingsUtil.get(SETTINGS.menuLayout.tag);

    LogUtil.log('applyMenuLayout', [menuLayout]);

    RollRequestsMenu.refreshIfOpen();
  }

  static applyMenuIconsLayout(newValue){
    const SETTINGS = getSettings();
    const menuIconsLayout = newValue || SettingsUtil.get(SETTINGS.menuIconsLayout.tag);

    LogUtil.log('applyMenuIconsLayout', [menuIconsLayout]);

    RollRequestsMenu.refreshIfOpen();
  }

  static applyActorStatsToShow(newValue){
    LogUtil.log('applyActorStatsToShow', [newValue]);
    RollRequestsMenu.refreshIfOpen();
  }

  static initializeMaxIconsPerRow(){
    const SETTINGS = getSettings();
    const maxIconsPerRow = SettingsUtil.get(SETTINGS.maxIconsPerRow.tag) || 5;
    GeneralUtil.addCSSVars('--fr5e-menu-icons-limit', maxIconsPerRow);
    LogUtil.log('initializeMaxIconsPerRow', [maxIconsPerRow]);
  }

  static applyMaxIconsPerRow(newValue){
    const SETTINGS = getSettings();
    let maxIconsPerRow = newValue || SettingsUtil.get(SETTINGS.maxIconsPerRow.tag) || 5;

    const IconLayoutUtil = game.modules.get(MODULE_ID)?.api?.IconLayoutUtil;
    if (IconLayoutUtil) {
      const enabledActorIcons = IconLayoutUtil.getEnabledIcons('actorActions');
      if (enabledActorIcons && maxIconsPerRow > enabledActorIcons.length) {
        maxIconsPerRow = enabledActorIcons.length;
      }
    }

    if (maxIconsPerRow < 1) maxIconsPerRow = 1;

    LogUtil.log('applyMaxIconsPerRow', [maxIconsPerRow, newValue]);

    GeneralUtil.addCSSVars('--fr5e-menu-icons-limit', maxIconsPerRow);
    RollRequestsMenu.refreshIfOpen();
  }

  /**
   * Validate and update the menuIconsLayout setting to include any missing icons
   * and remove any obsolete icons that no longer exist in IconMappings
   * @static
   */
  static async validateAndUpdateIconLayout() {
    const SETTINGS = getSettings();
    const currentLayout = SettingsUtil.get(SETTINGS.menuIconsLayout.tag);
    const defaultLayout = getDefaultIconLayout();

    if (!currentLayout) {
      LogUtil.log('validateAndUpdateIconLayout - no current layout found, using default');
      return;
    }

    let updated = false;
    const updatedLayout = foundry.utils.deepClone(currentLayout);

    // Check each icon type (moduleActions, actorActions)
    for (const [iconType, defaultIcons] of Object.entries(defaultLayout)) {
      if (!updatedLayout[iconType]) {
        updatedLayout[iconType] = [];
      }

      // Get valid icon IDs from the default layout (these are the ones that should exist)
      const validIds = new Set(defaultIcons.map(icon => icon.id));

      // Remove icons that are no longer in the IconMappings
      const originalLength = updatedLayout[iconType].length;
      updatedLayout[iconType] = updatedLayout[iconType].filter(icon => {
        if (!validIds.has(icon.id)) {
          LogUtil.log(`validateAndUpdateIconLayout - removed obsolete icon: ${icon.id} from ${iconType}`);
          updated = true;
          return false;
        }
        return true;
      });

      // Get existing icon IDs after filtering
      const existingIds = new Set(updatedLayout[iconType].map(icon => icon.id));

      // Find the highest order number in existing icons
      let maxOrder = Math.max(
        ...updatedLayout[iconType].map(icon => icon.order || 0),
        -1
      );

      // Add any missing icons from the default layout
      for (const defaultIcon of defaultIcons) {
        if (!existingIds.has(defaultIcon.id)) {
          maxOrder++;
          updatedLayout[iconType].push({
            ...defaultIcon,
            order: maxOrder
          });
          updated = true;
          LogUtil.log(`validateAndUpdateIconLayout - added missing icon: ${defaultIcon.id} to ${iconType}`);
        }
      }
    }

    // Save the updated layout if changes were made
    if (updated) {
      await SettingsUtil.set(SETTINGS.menuIconsLayout.tag, updatedLayout);
      LogUtil.log('validateAndUpdateIconLayout - updated layout', updatedLayout);
    } else {
      LogUtil.log('validateAndUpdateIconLayout - no changes needed');
    }
  }

  /**
   * Apply auto-block movement in combat setting changes
   * @param {boolean} newValue - The new setting value
   * @static
   */
  static applyAutoBlockMovementInCombat(newValue) {
    if (!game.user.isGM) return;

    const activeCombat = game.combat;
    if (!activeCombat) return;

    LogUtil.log('applyAutoBlockMovementInCombat', [newValue, activeCombat]);

    if (newValue) {
      TokenMovementManager.onCombatStart(activeCombat, {});
    } else {
      TokenMovementManager.onCombatEnd(activeCombat);
    }
  }
}
