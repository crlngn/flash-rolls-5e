/**
 * Module ID constant
 * @constant
 * @type {string}
 */
export const MODULE_ID = "flash-rolls-5e";

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
  ATTACK: { name: "attack", requestType: "attack" },
  DAMAGE: { name: "damage", requestType: "damage" },
  SAVE: { name: "save", requestType: "damage" },
  SAVING_THROW: { name: "savingthrow", requestType: "check" },
  ABILITY_CHECK: { name: "abilitycheck", requestType: "check" },
  CONCENTRATION: { name: "concentration", requestType: "check" },
  DEATH_SAVE: { name: "deathsave", requestType: "save" }, 
  SKILL: { name: "skill", requestType: "check" },
  TOOL: { name: "tool", requestType: "check" },
  HIT_DIE: { name: "hitdie", requestType: "formula" },
  INITIATIVE: { name: "initiative", requestType: "check" },
  FORMULA: { name: "formula", requestType: "formula" },
  RECHARGE: { name: "recharge", requestType: "formula" },
  D20_TEST: { name: "d20Test", requestType: "formula" },
  SHORT_REST: { name: "shortRest", requestType: "formula" },
  LONG_REST: { name: "longRest", requestType: "formula" },
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
  ABILITY_CHECK: "abilitycheck",
  ATTACK: "attack",
  CONCENTRATION: "concentration",
  CUSTOM: "custom",
  DEATH_SAVE: "deathsave",
  FORMULA: "formula",
  DAMAGE: "damage",
  HEALING: "healing",
  HIT_DIE: "hitdie",
  INITIATIVE: "initiative",
  INITIATIVE_DIALOG: "initiativedialog",
  ITEM_SAVE: "itemsave",
  SAVE: "save",
  SAVING_THROW: "savingthrow",
  SKILL: "skill",
  TOOL: "tool"
}

export const ROLL_REQUEST_OPTIONS = {
  ABILITY_CHECK: { name: ROLL_TYPES.ABILITY_CHECK, label: "Ability Check", subList: "abilities", actorPath: 'system.abilities' },
  SAVING_THROW: { name: ROLL_TYPES.SAVING_THROW, label: "Saving Throw", subList: "abilities", actorPath: 'system.abilities' },
  SKILL: { name: ROLL_TYPES.SKILL, label: "Skill Check", subList: "skills", actorPath: 'system.skills' },
  TOOL: { name: ROLL_TYPES.TOOL, label: "Tool Check", subList: "tools", actorPath: 'system.tools' },
  CONCENTRATION: { name: ROLL_TYPES.CONCENTRATION, label: "Concentration Check", subList: null, actorPath: '' },
  INITIATIVE: { name: ROLL_TYPES.INITIATIVE, label: "Initiative Roll", subList: null, actorPath: '' },
  DEATH_SAVE: { name: ROLL_TYPES.DEATH_SAVE, label: "Death Save", subList: null, actorPath: '' },
  // ITEM_SAVE: { name: ROLL_TYPES.ITEM_SAVE, label: "Item Save", subList: null, actorPath: '' },
  HIT_DIE: { name: ROLL_TYPES.HIT_DIE, label: "Hit Die", subList: null, actorPath: '' },
  CUSTOM: { name: ROLL_TYPES.CUSTOM, label: "Custom Roll", subList: null, actorPath: '' },
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
