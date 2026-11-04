import { getSettings } from '../../constants/Settings.mjs';
import { SettingsUtil } from '../utils/SettingsUtil.mjs';

/**
 * Icons players may use when the bar is shown to them. Everything else either requests rolls,
 * changes world settings, or edits actors and tokens the player does not own, so it stays GM-only.
 * @type {Record<string, Set<string>>}
 */
const PLAYER_ICONS = {
  moduleActions: new Set(['lock-menu', 'show-options']),
  actorActions: new Set(['select-all', 'toggle-targets', 'remove-status', 'teleport-tokens', 'open-sheets'])
};

/**
 * Who may use the token bar and what they may act on. GMs always have full access; players get a
 * restricted bar when the Show Bar to Players world setting is on: the PC and Groups tabs only,
 * selection limited to actors they own, player-safe icons, and roll and status lists that act on
 * their own characters only. Macros and roll requests stay GM-only.
 */
export class PlayerAccess {
  /**
   * Whether the current user may open the bar at all
   * @returns {boolean}
   */
  static canUseBar() {
    if (game.user.isGM) return true;
    const SETTINGS = getSettings();
    return !!SettingsUtil.get(SETTINGS.playerAccess.tag);
  }

  /**
   * Whether the current user sees the restricted player bar
   * @returns {boolean}
   */
  static isPlayerMode() {
    return !game.user.isGM && this.canUseBar();
  }

  /**
   * Whether the current user may select an actor and run actions on it
   * @param {Actor|null|undefined} actor - The actor, or the synthetic actor of a token
   * @returns {boolean}
   */
  static canActOn(actor) {
    if (game.user.isGM) return true;
    return !!actor?.isOwner;
  }

  /**
   * Whether the current user may see a menu icon
   * @param {string} iconId - Icon id from IconMappings
   * @param {string} iconType - moduleActions or actorActions
   * @returns {boolean}
   */
  static isIconAllowed(iconId, iconType) {
    if (game.user.isGM) return true;
    return PLAYER_ICONS[iconType]?.has(iconId) ?? false;
  }
}
