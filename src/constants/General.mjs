/**
 * Module ID constant
 * @constant
 * @type {string}
 */
export const MODULE_ID = "crlngn-roll-requests";

/**
 * Debug tag for console logging
 * @constant
 * @type {Array}
 */
export const DEBUG_TAG = [
  `%cRoll That For Me`,
  `color:rgb(47, 151, 161); font-weight: bold;`,
  `|`,
];

export const HOOK_NAMES = {
  // "" (empty string) - General roll
  ABILITY_CHECK: { name: "abilitycheck", activityType: "abilitycheck" }, // Ability checks
  SAVING_THROW: { name: "savingthrow", activityType: "savingthrow" }, // Saving throws
  CONCENTRATION: { name: "concentration", activityType: "concentration" }, // Concentration checks
  DEATH_SAVE: { name: "deathsave", activityType: "deathsave" }, // Death saving throws
  SKILL: { name: "skill", activityType: "skill" }, // Skill checks
  TOOL_CHECK: { name: "toolcheck", activityType: "toolcheck" }, // Tool checks
  HIT_DIE: { name: "hitdie", activityType: "hitdie" }, // Hit die rolls
  INITIATIVE: { name: "initiative", activityType: "initiative" }, // Initiative rolls
  ATTACK: { name: "attack", activityType: "attack" }, // Attack rolls
  DAMAGE: { name: "damage", activityType: "damage" }, // Damage rolls
  FORMULA: { name: "formula", activityType: "formula" }, // Formula rolls
  RECHARGE: { name: "recharge", activityType: "recharge" }, // Recharge rolls
};
