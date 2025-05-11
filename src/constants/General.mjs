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
  ATTACK: { name: "attack", activityType: "attack" }, // Attack Activity
  DAMAGE: { name: "damage", activityType: "damage" }, // Damage Activity
  SAVE: { name: "save", activityType: "damage" }, // Save Activity (usually with damage)
  SAVING_THROW: { name: "savingthrow", activityType: "check" }, // Saving throws
  ABILITY_CHECK: { name: "abilitycheck", activityType: "check" }, // Ability checks
  CONCENTRATION: { name: "concentration", activityType: "check" }, // Concentration checks
  DEATH_SAVE: { name: "deathsave", activityType: "save" }, // Death saving throws
  SKILL: { name: "skill", activityType: "check" }, // Skill checks
  TOOL: { name: "tool", activityType: "check" }, // Tool checks
  HIT_DIE: { name: "hitdie", activityType: "formula" }, // Hit die rolls
  INITIATIVE: { name: "initiative", activityType: "check" }, // Initiative rolls
  FORMULA: { name: "formula", activityType: "formula" }, // Formula rolls
  RECHARGE: { name: "recharge", activityType: "formula" }, // Recharge rolls
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

export const BUTTON_ACTION_TYPES = {
  ROLL_REQUEST: "rollRequest",
  ROLL_ATTACK: "rollAttack",
  ROLL_DAMAGE: "rollDamage"
}