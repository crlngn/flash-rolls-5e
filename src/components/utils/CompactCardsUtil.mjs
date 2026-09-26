import { registerCompactCards, getCompactCardsRegistry, COMPACT_CARDS_HOOKS } from "../../../shared/dnd5e-compact-cards/src/index.mjs";
import { MIN_SYSTEM_VERSION } from "../../../shared/dnd5e-compact-cards/src/adapters/index.mjs";
import { MODULE_ID } from "../../constants/General.mjs";
import { getSettings } from "../../constants/Settings.mjs";
import { SettingsUtil } from "./SettingsUtil.mjs";
import { SystemCompat } from "./SystemCompat.mjs";
import { LogUtil } from "./LogUtil.mjs";

/**
 * Host wrapper for the compact activity cards feature shared with Carolingian UI
 * (`shared/dnd5e-compact-cards`). Registers this module's copy at init; the shared registry
 * activates exactly one copy at setup, and when another module wins the settings of this one
 * get a hint pointing at it. The compact cards setting is kept in sync with the dnd5e "Summary
 * Chat Cards" client setting: this module's value wins at load, and afterwards whichever of the
 * two the user changed last applies to both.
 */
export class CompactCardsUtil {
  /** @type {import("../../../shared/dnd5e-compact-cards/src/CompactCards5e.mjs").CompactCards5e|null} */
  static instance = null;

  /**
   * Register this module's copy of the feature. Must run during the init hook, after settings
   * are registered.
   */
  static init() {
    if (game.system?.id !== "dnd5e") return;
    const SETTINGS = getSettings();
    CompactCardsUtil.instance = registerCompactCards({
      id: MODULE_ID,
      templatesPath: `modules/${MODULE_ID}/templates`,
      i18nPrefix: "FLASH_ROLLS.compactCards",
      settings: {
        compactCards: () => SettingsUtil.get(SETTINGS.compactActivityCards.tag),
        setCompactCards: (value) => CompactCardsUtil.setCompactCards(value),
        collapseTags: () => SettingsUtil.get(SETTINGS.collapseCardTags.tag),
        labeledButtons: () => SettingsUtil.get(SETTINGS.labeledCardButtons.tag),
        retroAdvantage: () => SettingsUtil.get(SETTINGS.retroAdvantageButtons.tag)
      },
      log: (ref, data) => LogUtil.log(ref, data),
      warn: (ref, data) => LogUtil.warn(ref, data)
    });
    Hooks.once(COMPACT_CARDS_HOOKS.RESOLVED, CompactCardsUtil.onResolved);
  }

  /**
   * Whether the running dnd5e version is one the shared package has an adapter for
   * (5.3.0 or newer), regardless of whether the feature is enabled or another module runs it
   * @returns {boolean}
   */
  static isSystemSupported() {
    return game.system?.id === "dnd5e" && SystemCompat.isDnd5eAtLeast(MIN_SYSTEM_VERSION);
  }

  /**
   * Whether compact cards are in effect on this client, whichever module runs them
   * @returns {boolean}
   */
  static get isActive() {
    return getCompactCardsRegistry()?.isActive ?? false;
  }

  /**
   * Id of the module running the feature, or null before the registry resolved
   * @returns {string|null}
   */
  static get activeId() {
    return getCompactCardsRegistry()?.activeId ?? null;
  }

  /**
   * Id of the other module handling the feature, or null when this module runs it
   * @returns {string|null}
   */
  static get handledBy() {
    return CompactCardsUtil.instance?.handledBy ?? null;
  }

  /**
   * Localized notice, shown above the compact card settings, that another module handles the
   * feature on this client; empty when this module runs it
   * @returns {string}
   */
  static getHandledByHint() {
    const handledBy = CompactCardsUtil.handledBy;
    if (!handledBy) return "";
    const title = game.modules.get(handledBy)?.title ?? handledBy;
    return game.i18n.format("FLASH_ROLLS.compactCards.handledBy", { module: title });
  }

  /**
   * Log which module was activated when it is not this one
   * @param {string} activeId - Id of the module running the feature
   */
  static onResolved(activeId) {
    if (activeId === MODULE_ID) return;
    LogUtil.log("CompactCardsUtil.onResolved - handled by another module", [activeId]);
  }

  /**
   * Write the compact cards setting when the dnd5e "Summary Chat Cards" setting changed, and
   * update the checkbox in this module's settings dialog if it is open, since that form does not
   * re-render and would otherwise save its stale value back
   * @param {boolean} value
   */
  static async setCompactCards(value) {
    const SETTINGS = getSettings();
    await SettingsUtil.set(SETTINGS.compactActivityCards.tag, value);
    const inputs = document.querySelectorAll('#flash-rolls-settings input[type="checkbox"][name="compactActivityCards"]');
    for (const input of inputs) input.checked = value;
  }

  /**
   * Apply the compact cards setting
   * @param {boolean} value
   */
  static applyCompactCards(value) {
    CompactCardsUtil.instance?.applyCompactCards(value);
  }

  /**
   * Apply the collapse tags setting
   * @param {boolean} value
   */
  static applyCollapseTags(value) {
    CompactCardsUtil.instance?.applyCollapseTags(value);
  }

  /**
   * Apply the labeled buttons setting
   * @param {boolean} value
   */
  static applyLabeledButtons(value) {
    CompactCardsUtil.instance?.applyLabeledButtons(value);
  }

  /**
   * Apply the retroactive advantage buttons setting
   * @param {boolean} value
   */
  static applyRetroAdvantage(value) {
    CompactCardsUtil.instance?.applyRetroAdvantage(value);
  }
}
