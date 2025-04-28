import { HOOKS_CORE } from "../constants/Hooks.mjs"; 
import { LogUtil } from "./LogUtil.mjs"; 
import { SettingsUtil } from "./SettingsUtil.mjs"; 
import { getSettings } from "../constants/Settings.mjs";
import { MODULE_ID } from "../constants/General.mjs";
import { SocketUtil } from "./SocketUtil.mjs";
import { RollUtil } from "./RollUtil.mjs";

/**
 * Main class handling core module initialization and setup
 * Manages module lifecycle, hooks, and core functionality
 */
export class Main {

  /**
   * Initialize the module and set up core hooks
   * @static
   */
  static init(){
    Hooks.once(HOOKS_CORE.INIT, () => { 
      const SETTINGS = getSettings();
      LogUtil.log("Initiating module...", [], true);

      SettingsUtil.registerSettings();
      RollUtil.init();
      
      // Initialize socketlib
      if(game.modules.get("socketlib")?.active) {
        SocketUtil.initialize();
      } else {
        ui.notifications.error(game.i18n.localize("CRLNGN_ROLLS.notifications.socketlibMissing"), {permanent: true});
      }
    });

    Hooks.once(HOOKS_CORE.READY, () => {
      LogUtil.log("Core Ready", []);
      const SETTINGS = getSettings();
      
      var isDebugOn = SettingsUtil.get(SETTINGS.debugMode.tag);
      if(isDebugOn){CONFIG.debug.hooks = true};
    });
  }
}
