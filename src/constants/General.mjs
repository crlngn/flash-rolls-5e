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
  ABILITY_CHECK: { name: "abilitycheck", activityType: "check" }, // Ability checks
  SAVING_THROW: { name: "savingthrow", activityType: "save" }, // Saving throws
  CONCENTRATION: { name: "concentration", activityType: "check" }, // Concentration checks
  DEATH_SAVE: { name: "deathsave", activityType: "save" }, // Death saving throws
  SKILL: { name: "skill", activityType: "check" }, // Skill checks
  TOOL: { name: "tool", activityType: "check" }, // Tool checks
  HIT_DIE: { name: "hitdie", activityType: "" }, // Hit die rolls
  INITIATIVE: { name: "initiative", activityType: "" }, // Initiative rolls
  ATTACK: { name: "attack", activityType: "attack" }, // Attack rolls
  DAMAGE: { name: "damage", activityType: "damage" }, // Damage rolls
  FORMULA: { name: "formula", activityType: "" }, // Formula rolls
  RECHARGE: { name: "recharge", activityType: "" }, // Recharge rolls
};

export const ACTIVITY_TYPES = {
  ATTACK: "attack",
  CAST: "cast",
  CHECK: "check",
  DAMAGE: "damage",
  ENCHANT: "enchant",
  FORWARD: "forward",
  HEAL: "heal",
  ORDER: "order",
  SAVE: "save",
  SUMMON: "summon",
  TRANSFORM: "transform",
  UTILITY: "utility"
};

export const CALL_TYPE = {
  ACTIVITY: "activity",
  CHECK: "check",
}


