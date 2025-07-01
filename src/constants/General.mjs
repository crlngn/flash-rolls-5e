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
  `%cFlash Rolls 5e`,
  `color:rgb(47, 151, 161); font-weight: bold;`,
  `|`,
];

export const SOCKET_CALLS = {
  receiveDiceConfig: "receiveDiceConfig",
  getDiceConfig: "getDiceConfig",
  handleRollRequest: "handleRollRequest"
};

export const HOOK_NAMES = {
  // "" (empty string) - General roll
  ATTACK: { name: "attack", requestType: "attack" }, // Attack Activity
  DAMAGE: { name: "damage", requestType: "damage" }, // Damage Activity
  SAVE: { name: "save", requestType: "damage" }, // Save Activity (usually with damage)
  SAVING_THROW: { name: "savingthrow", requestType: "check" }, // Saving throws
  ABILITY_CHECK: { name: "abilitycheck", requestType: "check" }, // Ability checks
  CONCENTRATION: { name: "concentration", requestType: "check" }, // Concentration checks
  DEATH_SAVE: { name: "deathsave", requestType: "save" }, // Death saving throws
  SKILL: { name: "skill", requestType: "check" }, // Skill checks
  TOOL: { name: "tool", requestType: "check" }, // Tool checks
  HIT_DIE: { name: "hitdie", requestType: "formula" }, // Hit die rolls
  INITIATIVE: { name: "initiative", requestType: "check" }, // Initiative rolls
  FORMULA: { name: "formula", requestType: "formula" }, // Formula rolls
  RECHARGE: { name: "recharge", requestType: "formula" }, // Recharge rolls

  D20_TEST: { name: "d20Test", requestType: "formula" }, // D20 test
  SHORT_REST: { name: "shortRest", requestType: "formula" }, // Short rest
  LONG_REST: { name: "longRest", requestType: "formula" }, // Long rest
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

/**
 * Roll types used throughout the module
 * @constant
 * @type {Object}
 */
export const ROLL_TYPES = {
  ABILITY: "ability",
  SAVE: "save",
  SKILL: "skill",
  TOOL: "tool",
  CONCENTRATION: "concentration",
  ATTACK: "attack",
  DAMAGE: "damage",
  INITIATIVE: "initiative",
  DEATH_SAVE: "deathsave",
  HIT_DIE: "hitDie",
  ITEM_SAVE: "itemSave",
  CUSTOM: "custom"
}

export const ROLL_REQUEST_OPTIONS = {
  ABILITY_CHECK: { name: "abilityCheck", label: "Ability Check", subList: "abilities", actorPath: 'system.abilities' },
  SAVING_THROW: { name: "savingThrow", label: "Saving Throw", subList: "abilities", actorPath: 'system.abilities' },
  SKILL: { name: "skill", label: "Skill Check", subList: "skills", actorPath: 'system.skills' },
  TOOL: { name: "tool", label: "Tool Check", subList: "tools", actorPath: 'system.tools' },
  CONCENTRATION: { name: "concentration", label: "Concentration Check", subList: null, actorPath: '' },
  INITIATIVE: { name: "initiativeDialog", label: "Initiative Roll", subList: null, actorPath: '' },
  DEATH_SAVE: { name: "deathSave", label: "Death Save", subList: null, actorPath: '' },
  CUSTOM: { name: "custom", label: "Custom Roll", subList: null, actorPath: '' },
  // HIT_DIE: { name: "hitDie", label: "Hit Die", subList: null, actorPath: '' }
}

/**
 * Module configuration object
 * @constant
 * @type {Object}
 */
export const MODULE = {
  ID: MODULE_ID,
  ROLL_REQUEST_OPTIONS: ROLL_REQUEST_OPTIONS
}
