import { LogUtil } from "@ftb-core/utils/LogUtil.mjs";

/**
 * Parses and categorizes D&D Beyond roll events
 * Extracts roll information and maps to Foundry roll types
 */
export class DnDBRollParser {

  /**
   * Extract roll information from DnDB roll data
   * @param {Object} rollData - The raw roll data from DnDB
   * @returns {Object} Normalized roll information
   */
  static extractRollInfo(rollData) {
    const rolls = rollData.data?.rolls || [];
    const firstRoll = rolls[0] || {};

    return {
      action: rollData.data?.action || "Unknown",
      rollType: firstRoll.rollType || "check",
      rollKind: firstRoll.rollKind || "",
      total: firstRoll.result?.total || 0,
      formula: this._buildFormula(firstRoll),
      diceResults: this._extractDiceResults(firstRoll),
      characterId: rollData.entityId,
      characterName: rollData.data?.context?.name || "Unknown",
      characterAvatar: rollData.data?.context?.avatarUrl || "",
      source: rollData.source || "web",
      isAdvantage: firstRoll.rollKind === "advantage",
      isDisadvantage: firstRoll.rollKind === "disadvantage",
      isCritical: firstRoll.rollKind === "critical hit",
      rawRolls: rolls,
      rollMode: this._determineRollMode(rollData)
    };
  }

  /**
   * Determine Foundry rollMode from DnDB messageScope/messageTarget
   * @param {Object} rollData - The raw roll data from DnDB
   * @returns {string} Foundry roll mode constant
   */
  static _determineRollMode(rollData) {
    const { messageScope, messageTarget, userId } = rollData;
    if (messageScope === "gameId") {
      return CONST.DICE_ROLL_MODES.PUBLIC;
    }
    if (messageScope === "userId") {
      if (messageTarget === userId) {
        return CONST.DICE_ROLL_MODES.PRIVATE;
      }
      return CONST.DICE_ROLL_MODES.BLIND;
    }
    return CONST.DICE_ROLL_MODES.PUBLIC;
  }

  /**
   * Determine the Foundry roll category from DnDB roll data
   * @param {string} action - The action name from DnDB
   * @param {string} rollType - The rollType from DnDB
   * @param {Actor|null} actor - The Foundry actor (for checking tools/skills)
   * @returns {Object} Roll category info
   */
  static determineRollCategory(action, rollType, actor) {
    const actionLower = action.toLowerCase();

    if (actionLower === "initiative" || (rollType === "roll" && actionLower === "initiative")) {
      return { category: "initiative" };
    }

    if (rollType === "save") {
      const abilityAbbrev = this._getAbilityAbbrev(action);
      if (abilityAbbrev) {
        return { category: "save", ability: abilityAbbrev };
      }
      return { category: "save", ability: "str", original: action };
    }

    if (rollType === "to hit" || rollType === "attack") {
      return { category: "attack", action };
    }

    if (rollType === "damage") {
      return { category: "damage", action };
    }

    if (rollType === "heal" || rollType === "healing") {
      return { category: "healing", action };
    }

    if (rollType === "check") {
      const abilityAbbrev = this._getAbilityAbbrev(action);
      if (abilityAbbrev) {
        return { category: "abilityCheck", ability: abilityAbbrev };
      }
      const skillAbbrev = this._getSkillAbbrev(action);
      if (skillAbbrev) {
        return { category: "skill", skill: skillAbbrev, skillName: action };
      }
      if (actor) {
        const toolItem = this._findToolForAction(actor, action);
        if (toolItem) {
          return { category: "tool", tool: toolItem, toolName: action };
        }
      }
      return { category: "customCheck", action };
    }

    return { category: "unknown", action, rollType };
  }

  /**
   * Get ability abbreviation from full name or abbreviation
   * @param {string} value - Ability name or abbreviation
   * @returns {string|null}
   */
  static _getAbilityAbbrev(value) {
    const valueLower = value.toLowerCase();
    const abilities = CONFIG.DND5E?.abilities || {};
    for (const [abbrev, data] of Object.entries(abilities)) {
      if (abbrev === valueLower || data.label?.toLowerCase() === valueLower) {
        return abbrev;
      }
    }
    return null;
  }

  /**
   * Get skill abbreviation from full name
   * @param {string} skillName - Skill name
   * @returns {string|null}
   */
  static _getSkillAbbrev(skillName) {
    const nameLower = skillName.toLowerCase();
    const skills = CONFIG.DND5E?.skills || {};
    for (const [abbrev, data] of Object.entries(skills)) {
      if (abbrev === nameLower || data.label?.toLowerCase() === nameLower) {
        return abbrev;
      }
    }
    return null;
  }

  /**
   * Find a tool on actor that matches the action name
   * @param {Actor} actor - The Foundry actor
   * @param {string} action - The action name
   * @returns {Item|null}
   */
  static _findToolForAction(actor, action) {
    if (!actor) return null;
    const actionLower = action.toLowerCase();
    return actor.items.find(item => {
      if (item.type !== "tool") return false;
      const nameLower = item.name.toLowerCase();
      return nameLower.includes(actionLower) || actionLower.includes(nameLower);
    }) || null;
  }

  /**
   * Build a formula string from roll data
   * @param {Object} roll - The roll object
   * @returns {string}
   */
  static _buildFormula(roll) {
    const notation = roll.diceNotation;
    if (!notation) return "";

    const parts = [];
    for (const set of notation.set || []) {
      parts.push(`${set.count}${set.dieType}`);
    }

    let formula = parts.join(" + ");
    if (notation.constant) {
      const sign = notation.constant >= 0 ? "+" : "";
      formula += ` ${sign}${notation.constant}`;
    }

    return formula;
  }

  /**
   * Extract individual dice results from roll data
   * @param {Object} roll - The roll object
   * @returns {Array}
   */
  static _extractDiceResults(roll) {
    const results = [];
    const notation = roll.diceNotation;
    if (!notation) return results;

    for (const set of notation.set || []) {
      for (const die of set.dice || []) {
        results.push({
          type: die.dieType,
          value: die.dieValue
        });
      }
    }

    return results;
  }

  /**
   * Get a localized label for a roll type
   * @param {string} rollType - The roll type from DnDB
   * @returns {string}
   */
  static getRollTypeLabel(rollType) {
    const typeMap = {
      "to hit": game.i18n.localize("DND5E.Attack"),
      "attack": game.i18n.localize("DND5E.Attack"),
      "check": "Check",
      "save": game.i18n.localize("DND5E.SavingThrow"),
      "damage": game.i18n.localize("DND5E.Damage"),
      "heal": game.i18n.localize("DND5E.Healing"),
      "healing": game.i18n.localize("DND5E.Healing")
    };

    return typeMap[rollType?.toLowerCase()] || rollType || "Roll";
  }

  /**
   * Find an item on actor by name (for attacks/spells)
   * @param {Actor} actor - The Foundry actor
   * @param {string} actionName - The action/item name
   * @returns {Item|null}
   */
  static findItemByAction(actor, actionName) {
    if (!actor || !actionName) return null;
    const nameLower = actionName.toLowerCase();
    return actor.items.find(item => {
      return item.name.toLowerCase() === nameLower;
    }) || null;
  }

  /**
   * Get activity from item based on roll type
   * @param {Item} item - The item
   * @param {string} rollType - DnDB roll type (to hit, damage, heal)
   * @returns {Activity|null}
   */
  static getActivityFromItem(item, rollType) {
    if (!item) return null;
    const activities = item.system?.activities;
    if (!activities) return null;

    const activityTypeMap = {
      "to hit": "attack",
      "attack": "attack",
      "damage": null,
      "heal": "heal",
      "healing": "heal"
    };

    const targetType = activityTypeMap[rollType];
    if (targetType === null) {
      if (item.hasAttack) {
        return activities.find(act => act.type === "attack") || null;
      } else if (item.hasSave) {
        return activities.find(act => act.type === "save") || null;
      } else {
        return activities.find(act => act.type === "damage") || null;
      }
    }

    if (targetType) {
      return activities.find(act => act.type === targetType) || null;
    }

    return Array.from(activities.values())[0] || null;
  }
}
