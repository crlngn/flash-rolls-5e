import { registerCompactCards, getCompactCardsRegistry, COMPACT_CARDS_HOOKS } from "../../../shared/dnd5e-compact-cards/src/index.mjs";
import { MODULE_ID } from "../../constants/General.mjs";
import { getSettings } from "../../constants/Settings.mjs";
import { SettingsUtil } from "./SettingsUtil.mjs";
import { LogUtil } from "./LogUtil.mjs";

/**
 * Host wrapper for the compact activity cards feature shared with Carolingian UI
 * (`shared/dnd5e-compact-cards`). Registers this module's copy at init; the shared registry
 * activates exactly one copy at setup, and when another module wins the settings of this one
 * get a hint pointing at it.
 */
export class CompactCardsUtil {
  /** @type {import("../../../shared/dnd5e-compact-cards/src/CompactCards5e.mjs").CompactCards5e|null} */
  static instance = null;

  /** Setting keys whose hint is rewritten when another module handles the feature */
  static SETTING_KEYS = ["compactActivityCards", "collapseCardTags", "labeledCardButtons"];

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
        collapseTags: () => SettingsUtil.get(SETTINGS.collapseCardTags.tag),
        labeledButtons: () => SettingsUtil.get(SETTINGS.labeledCardButtons.tag)
      },
      log: (ref, data) => LogUtil.log(ref, data),
      warn: (ref, data) => LogUtil.warn(ref, data)
    });
    Hooks.once(COMPACT_CARDS_HOOKS.RESOLVED, CompactCardsUtil.onResolved);
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
   * When another module's copy was activated, point this module's settings at it
   * @param {string} activeId - Id of the module running the feature
   */
  static onResolved(activeId) {
    if (activeId === MODULE_ID) return;
    const SETTINGS = getSettings();
    const title = game.modules.get(activeId)?.title ?? activeId;
    const hint = game.i18n.format("FLASH_ROLLS.compactCards.handledBy", { module: title });
    for (const key of CompactCardsUtil.SETTING_KEYS) {
      const setting = game.settings.settings.get(`${MODULE_ID}.${SETTINGS[key].tag}`);
      if (setting) setting.hint = hint;
    }
    LogUtil.log("CompactCardsUtil.onResolved - handled by another module", [activeId]);
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
}
