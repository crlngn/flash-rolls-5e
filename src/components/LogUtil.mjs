import { DEBUG_TAG, MODULE_ID } from "../constants/General.mjs";

/**
 * Utility class for handling logging operations in the module
 * Provides methods for debug, warning, and error logging with module context
 */
export class LogUtil {
  /** @type {boolean} Whether debug logging is enabled */
  static debugOn = false;

  /**
   * Logs information to the console, adding module name and reference
   * @param {string} ref - Reference information to log after module name
   * @param {Array|*} data - array of items to log on console, or a single item that will be wrapped in an array
   * @param {boolean} [bypassSettings=false] - Whether to bypass debug settings check
   */
  static log(ref="", data=[], bypassSettings=false) {
    try {
      const debugSetting = game.settings.get(MODULE_ID, "debug-mode") || LogUtil.debugOn;
      const isDebugModeOn = bypassSettings || debugSetting;
      if(!isDebugModeOn) { return; }
      
      // Ensure data is an array
      const dataArray = Array.isArray(data) ? data : [data];
      console.log(...DEBUG_TAG, ref, ...dataArray);
    } catch(e) {
      // If settings aren't available yet, check bypassSettings
      if (bypassSettings || LogUtil.debugOn) {
        // Ensure data is an array
        const dataArray = Array.isArray(data) ? data : [data];
        console.log(...DEBUG_TAG, ref, ...dataArray);
      }
    }
  }

  /**
   * Outputs warning on console, adding module name and reference
   * @param {string} ref - Reference information to log after module name
   * @param {Array|*} data - array of items to log on console, or a single item that will be wrapped in an array
   */
  static warn(ref="", data=[]) {
    // Ensure data is an array
    const dataArray = Array.isArray(data) ? data : [data];
    console.warn(...DEBUG_TAG, ref, ...dataArray);
  }

  /**
   * Logs an error to the console and/or UI notification
   * @param {string} strRef - Reference string for the error
   * @param {Array|*} data - array of items to log on console, or a single item that will be wrapped in an array
   * @param {object} options - Error logging configuration
   * @param {boolean} [options.ui=false] - Whether to show UI notification
   * @param {boolean} [options.console=true] - Whether to log to console
   * @param {boolean} [options.permanent=false] - Whether UI notification should be permanent
   * @static
   */
  static error(strRef, data=[], options = { ui: false, console: true, permanent: false }) {
    // Ensure data is an array
    const dataArray = Array.isArray(data) ? data : [data];
    
    if(options.ui) {
      ui.notifications?.error(strRef, { localize: true, permanent: options.permanent });
    }
    if(options.console) console.error(...DEBUG_TAG, strRef, ...dataArray);
  }
}