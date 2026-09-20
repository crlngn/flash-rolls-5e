import { getSettings } from '../../constants/Settings.mjs';
import { SettingsUtil } from '../utils/SettingsUtil.mjs';
import { LibWrapperUtil } from '../utils/LibWrapperUtil.mjs';
import { LogUtil } from '../utils/LogUtil.mjs';

/** Path of the core method whose movement speed the module overrides */
const ANIMATE_TARGET = 'foundry.canvas.placeables.Token.prototype.animate';

/**
 * Applies the module's token movement speed setting to every token animation.
 * Foundry moves tokens through `Token#animate`, which takes an optional `movementSpeed` in its
 * options; the manager fills that option in whenever the caller left it unset, so token movement
 * follows the configured speed while explicit speeds from other callers are respected.
 */
export class TokenAnimationManager {
  /** @type {boolean} Whether the animate method has already been patched */
  static #installed = false;

  /**
   * Movement speed configured in the module settings, in grid spaces per second
   * @returns {number|null} The configured speed, or null when the setting is unset or zero
   */
  static get movementSpeed() {
    const SETTINGS = getSettings();
    const speed = Number(SettingsUtil.get(SETTINGS.tokenMovementSpeed.tag));
    return Number.isFinite(speed) && speed > 0 ? speed : null;
  }

  /**
   * Fill in the module's movement speed on an animation's options when none was requested
   * @param {Object} options - Options passed to `Token#animate`, mutated in place
   * @returns {Object} The same options object
   */
  static withMovementSpeed(options = {}) {
    if (options.movementSpeed) return options;
    const speed = TokenAnimationManager.movementSpeed;
    if (speed !== null) options.movementSpeed = speed;
    return options;
  }

  /**
   * Patch `Token#animate` once, through libWrapper when it is active so other modules can wrap
   * the same method safely, and by replacing the prototype method otherwise
   */
  static initialize() {
    if (TokenAnimationManager.#installed) return;
    TokenAnimationManager.#installed = true;

    const withLibWrapper = LibWrapperUtil.register(ANIMATE_TARGET, TokenAnimationManager.#animateWrapper, 'WRAPPER');
    if (withLibWrapper) return;

    LogUtil.log('TokenAnimationManager.initialize - libWrapper inactive, patching Token#animate directly');
    TokenAnimationManager.#patchPrototype();
  }

  /**
   * libWrapper wrapper for `Token#animate`
   * @this {Token}
   * @param {Function} wrapped - The next method in the wrapper chain
   * @param {Object} to - Animation destination
   * @param {Object} [options] - Animation options
   * @param {...any} rest - Further arguments forwarded unchanged
   * @returns {Promise<void>}
   */
  static #animateWrapper(wrapped, to, options = {}, ...rest) {
    return wrapped(to, TokenAnimationManager.withMovementSpeed(options), ...rest);
  }

  /**
   * Replace `Token#animate` on the prototype with a version that injects the movement speed,
   * keeping the original implementation for the call
   */
  static #patchPrototype() {
    const proto = foundry.canvas.placeables.Token.prototype;
    const original = proto.animate;
    if (typeof original !== 'function') {
      LogUtil.warn('TokenAnimationManager.#patchPrototype - Token#animate not found, movement speed setting inactive');
      return;
    }
    proto.animate = function animate(to, options = {}, ...rest) {
      return original.call(this, to, TokenAnimationManager.withMovementSpeed(options), ...rest);
    };
  }
}
