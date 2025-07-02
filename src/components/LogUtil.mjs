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
   * @param {any[]} data - data to log on console
   * @param {boolean} [bypassSettings=false] - Whether to bypass debug settings check
   */
  static log(ref="", data=[], bypassSettings=false) {
    try {
      const debugSetting = game.settings.get(MODULE_ID, "debug-mode") || LogUtil.debugOn;
      const isDebugModeOn = bypassSettings || debugSetting;
      if(!isDebugModeOn) { return; }
      console.log(...DEBUG_TAG, ref, ...data);
    } catch(e) {
      // If settings aren't available yet, check bypassSettings
      if (bypassSettings || LogUtil.debugOn) {
        console.log(...DEBUG_TAG, ref, ...data);
      }
    }
  }

  /**
   * Outputs warning on console, adding module name and reference
   * @param {string} ref - Reference information to log after module name
   * @param {any[]} data - data to log on console
   */
  static warn(ref="", data=[]) {
    console.warn(...DEBUG_TAG, ref, ...data);
  }

  /**
   * Logs an error to the console and/or UI notification
   * @param {string} strRef - Reference string for the error
   * @param {object} options - Error logging configuration
   * @param {boolean} [options.ui=false] - Whether to show UI notification
   * @param {boolean} [options.console=true] - Whether to log to console
   * @param {boolean} [options.permanent=false] - Whether UI notification should be permanent
   * @static
   */
  static error(strRef, options = { ui: false, console: true, permanent: false }) {
    if(options.ui) {
      ui.notifications?.error(strRef, { localize: true, permanent: options.permanent });
    }
    if(options.console) console.error(...DEBUG_TAG, strRef);
  }

  /**
   * Logs with automatic method name detection
   * Creates a logging function that automatically includes the class and method name
   * @param {Object} classInstance - The class instance (use 'this' for instance methods, or the class itself for static methods)
   * @param {string} methodName - The method name
   * @returns {Function} A logging function that includes the method name
   * @example
   * // In a class method:
   * const log = LogUtil.method(this, 'myMethod');
   * log('some data', [data1, data2]);
   * 
   * // In a static method:
   * const log = LogUtil.method(MyClass, 'myStaticMethod');
   * log('some data', [data1, data2]);
   */
  static method(classInstance, methodName) {
    const className = classInstance.constructor?.name || classInstance.name || 'Unknown';
    const fullMethodName = `${className}.${methodName}`;
    
    return (ref = "", data = [], bypassSettings = false) => {
      const fullRef = ref ? `${fullMethodName} - ${ref}` : fullMethodName;
      this.log(fullRef, data, bypassSettings);
    };
  }

  /**
   * Decorator function to automatically log method entry
   * @param {Function} method - The method to wrap
   * @param {string} className - The class name
   * @param {string} methodName - The method name
   * @returns {Function} The wrapped method
   * @example
   * // Define once at class level:
   * static _getRollTitle = LogUtil.traced(
   *   function(rollType, rollKey, actor) {
   *     // method implementation
   *   },
   *   'GMRollConfigDialog',
   *   '_getRollTitle'
   * );
   */
  static traced(method, className, methodName) {
    return function(...args) {
      LogUtil.log(`${className}.${methodName}`, ['called with args:', args]);
      return method.apply(this, args);
    };
  }
}