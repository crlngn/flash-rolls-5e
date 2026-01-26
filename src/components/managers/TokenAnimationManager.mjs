import { getSettings } from '../../constants/Settings.mjs';
import { SettingsUtil } from '../utils/SettingsUtil.mjs';
import { LibWrapperUtil } from "../utils/LibWrapperUtil.mjs";
import { LogUtil } from "../utils/LogUtil.mjs";

/**
 * Manager for customizing token animation behavior
 */
export class TokenAnimationManager {
  /**
   * Initialize token animation customization by wrapping the Token.prototype.animate method
   */
  static initialize() {
    const registered = LibWrapperUtil.register(
      'foundry.canvas.placeables.Token.prototype.animate',
      function(wrapped, to, options = {}, ...rest) {
        TokenAnimationManager._applyAnimateOptions(options);
        return wrapped(to, options, ...rest);
      },
      'WRAPPER'
    );

    if (registered) return;

    LogUtil.log('TokenAnimationManager: libWrapper not available, using fallback wrapping for Token.animate');

    const TokenClass = foundry.canvas.placeables.Token;
    const originalAnimate = TokenClass.prototype.animate;

    TokenClass.prototype.animate = async function(to, options = {}) {
      TokenAnimationManager._applyAnimateOptions(options);
      return originalAnimate.call(this, to, options);
    };
  }

  static _applyAnimateOptions (options) {
    const SETTINGS = getSettings();
    const customMovementSpeed = SettingsUtil.get(SETTINGS.tokenMovementSpeed.tag);

    if (customMovementSpeed && !options.movementSpeed) {
      options.movementSpeed = customMovementSpeed;
    }
  }
}
