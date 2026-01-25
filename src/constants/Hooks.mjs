/**
 * Core Foundry hooks
 * @constant
 * @type {Object}
 */
export const HOOKS_CORE = {
  INIT: "init",
  READY: "ready",
  RENDER_CHAT_MESSAGE: "renderChatMessageHTML",
  RENDER_CHAT_LOG: "renderChatLog",
  RENDER_CHAT_INPUT: "renderChatInput",
  // RENDER_SIDEBAR_TAB: "renderSidebarTab",
  CHANGE_SIDEBAR_TAB: "changeSidebarTab", 
  RENDER_SIDEBAR: "renderSidebar",
  RENDER_APPLICATION_V2: "renderApplicationV2",
  UPDATE_SCENE: "updateScene",
  RENDER_SCENE_NAVIGATION: "renderSceneNavigation",
  RENDER_ROLL_RESOLVER: "renderRollResolver",
  USER_CONNECTED: "userConnected",
  PRE_CREATE_CHAT_MESSAGE: "preCreateChatMessage",
  CREATE_CHAT_MESSAGE: "createChatMessage",
  RENDER_ROLL_CONFIGURATION_DIALOG: "renderRollConfigurationDialog",
  COLLAPSE_SIDE_BAR: "collapseSidebar",
  REFRESH_MEASURED_TEMPLATE: "refreshMeasuredTemplate",
  CONTROL_TOKEN: "controlToken",
  UPDATE_TOKEN: "updateToken",
  PRE_UPDATE_TOKEN: "preUpdateToken",
  DELETE_TOKEN: "deleteToken",
  CREATE_TOKEN: "createToken",
  UPDATE_ACTOR: "updateActor",
  CREATE_ACTOR: "createActor",
  DELETE_ACTOR: "deleteActor",
  UPDATE_ITEM: "updateItem",
  CREATE_ITEM: "createItem",
  DELETE_ITEM: "deleteItem",
  UPDATE_SETTING: "updateSetting",
  CLIENT_SETTING_CHANGED: "clientSettingChanged",
  GET_ACTOR_CONTEXT_OPTIONS: "getActorContextOptions",
  GET_CHAT_MESSAGE_CONTEXT_OPTIONS: "getChatMessageContextOptions",
  RENDER_ACTOR_DIRECTORY: "renderActorDirectory",
  CREATE_COMBATANT: "createCombatant",
  DELETE_COMBATANT: "deleteCombatant",
  UPDATE_COMBAT: "updateCombat",
  DELETE_COMBAT: "deleteCombat",
  COMBAT_START: "combatStart",
  COMBAT_TURN: "combatTurn",
  COMBAT_TURN_CHANGE: "combatTurnChange",
  COMBAT_ROUND: "combatRound",
  CREATE_ACTIVE_EFFECT: "createActiveEffect",
  DELETE_ACTIVE_EFFECT: "deleteActiveEffect",
  UPDATE_ACTIVE_EFFECT: "updateActiveEffect",
  RENDER_APPLICATION: "renderApplication",
  PRE_CREATE_TOKEN: "preCreateToken",
  CANVAS_READY: "canvasReady",
  GET_SCENE_CONTROL_BUTTONS: "getSceneControlButtons",
  RENDER_SCENE_CONTROLS: "renderSceneControls"
};

/**
 * Socketlib hooks
 */
export const HOOKS_SOCKET = {
  READY: "socketlib.ready"
}

/**
 * Midi-QOL hooks
 */
export const HOOKS_MIDI_QOL = {
  READY: "midi-qol.ready",
  PRE_ITEM_ROLL: "midi-qol.preItemRoll",
  PRE_DAMAGE_ROLL: "midi-qol.preDamageRoll"
}

/**
 * DnD5e hooks
 */
export const HOOKS_DND5E = {
  // General Rolling Process
  PRE_ROLL_V2: "dnd5e.preRollV2",

  // Activity
  PRE_USE_ACTIVITY: "dnd5e.preUseActivity",
  POST_USE_ACTIVITY: "dnd5e.postUseActivity",
  
  // Ability Checks & Saving Throws
  PRE_ROLL_ABILITY_CHECK: "dnd5e.preRollAbilityCheckV2",
  PRE_ROLL_SAVING_THROW: "dnd5e.preRollSavingThrowV2",
  ROLL_ABILITY_CHECK: "dnd5e.rollAbilityCheckV2",
  ROLL_SAVING_THROW: "dnd5e.rollSavingThrowV2",
  
  // Concentration
  PRE_BEGIN_CONCENTRATING: "dnd5e.preBeginConcentrating",
  BEGIN_CONCENTRATING: "dnd5e.beginConcentrating",
  PRE_END_CONCENTRATION: "dnd5e.preEndConcentration",
  END_CONCENTRATION: "dnd5e.endConcentration",
  PRE_ROLL_CONCENTRATION_V2: "dnd5e.preRollConcentrationV2",
  ROLL_CONCENTRATION_V2: "dnd5e.rollConcentrationV2",
  
  // Damage
  PRE_CALCULATE_DAMAGE: "dnd5e.preCalculateDamage",
  CALCULATE_DAMAGE: "dnd5e.calculateDamage",
  PRE_APPLY_DAMAGE: "dnd5e.preApplyDamage",
  APPLY_DAMAGE: "dnd5e.applyDamage",
  
  // Death Saves
  PRE_ROLL_DEATH_SAVE_V2: "dnd5e.preRollDeathSaveV2",
  ROLL_DEATH_SAVE_V2: "dnd5e.rollDeathSaveV2",
  POST_ROLL_DEATH_SAVE: "dnd5e.postRollDeathSave",
  
  // Skills & Tools
  PRE_ROLL_SKILL_V2: "dnd5e.preRollSkillV2",
  PRE_ROLL_TOOL_V2: "dnd5e.preRollToolV2",
  ROLL_SKILL_V2: "dnd5e.rollSkillV2",
  ROLL_TOOL_V2: "dnd5e.rollToolV2",
  
  // Hit Dice
  PRE_ROLL_HIT_DIE_V2: "dnd5e.preRollHitDieV2",
  ROLL_HIT_DIE_V2: "dnd5e.rollHitDieV2",
  
  // Hit Points
  PRE_ROLL_CLASS_HIT_POINTS: "dnd5e.preRollClassHitPoints",
  ROLL_CLASS_HIT_POINTS: "dnd5e.rollClassHitPoints",
  PRE_ROLL_NPC_HIT_POINTS: "dnd5e.preRollNPCHitPoints",
  ROLL_NPC_HIT_POINTS: "dnd5e.rollNPChitPoints",
  
  // Initiative
  PRE_CONFIGURE_INITIATIVE: "dnd5e.preConfigureInitiative",
  PRE_ROLL_INITIATIVE_DIALOG: "dnd5e.preRollInitiativeDialog",
  // PRE_ROLL_INITIATIVE_DIALOG_V2: "dnd5e.preRollInitiativeDialogV2",
  PRE_ROLL_INITIATIVE: "dnd5e.preRollInitiative",
  ROLL_INITIATIVE: "dnd5e.rollInitiative",
  
  // Attacks
  PRE_ROLL_ATTACK_V2: "dnd5e.preRollAttackV2",
  ROLL_ATTACK_V2: "dnd5e.rollAttackV2",
  POST_ROLL_ATTACK: "dnd5e.postRollAttack",
  
  // Damage Rolls
  PRE_ROLL_DAMAGE_V2: "dnd5e.preRollDamageV2",
  ROLL_DAMAGE_V2: "dnd5e.rollDamageV2",
  
  // Formula Rolls
  PRE_ROLL_FORMULA_V2: "dnd5e.preRollFormulaV2",
  ROLL_FORMULA_V2: "dnd5e.rollFormulaV2",
  
  // Recharge Rolls
  PRE_ROLL_RECHARGE_V2: "dnd5e.preRollRechargeV2",
  ROLL_RECHARGE_V2: "dnd5e.rollRechargeV2",
  
  // Car Display
  PRE_DISPLAY_CARD_V2: "dnd5e.preDisplayCardV2",
  DISPLAY_CARD: "dnd5e.displayCard",

  // Config
  BUILD_ROLL_CONFIG: "dnd5e.buildRollConfig",
  POST_BUILD_ROLL_CONFIG: "dnd5e.postBuildRollConfig",
  POST_ROLL_CONFIG: "dnd5e.postRollConfiguration",

  // Pre-Roll Hooks (before dialog)
  PRE_ROLL_ATTACK: "dnd5e.preRollAttack",
  PRE_ROLL_DAMAGE: "dnd5e.preRollDamage",

  // Post Roll Configuration Hooks (after config, before evaluation)
  POST_ATTACK_ROLL_CONFIGURATION: "dnd5e.postAttackRollConfiguration",
  POST_DAMAGE_ROLL_CONFIGURATION: "dnd5e.postDamageRollConfiguration",
  POST_ABILITY_CHECK_ROLL_CONFIGURATION: "dnd5e.postAbilityCheckRollConfiguration",
  POST_SKILL_CHECK_ROLL_CONFIGURATION: "dnd5e.postSkillCheckRollConfiguration",
  POST_SAVING_THROW_ROLL_CONFIGURATION: "dnd5e.postSavingThrowRollConfiguration",

  // Rendering
  RENDER_ROLL_CONFIGURATION_DIALOG: "renderRollConfigurationDialog",
  RENDER_SKILL_TOOL_ROLL_DIALOG: "renderSkillToolRollConfigurationDialog",
  RENDER_FORMULA_ROLL_DIALOG: "renderFormulaRollConfigurationDialog",
  RENDER_CHAT_MESSAGE: "renderChatMessageHTML",

  // Actor Sheets
  RENDER_GROUP_ACTOR_SHEET: "renderGroupActorSheet",
  RENDER_ENCOUNTER_ACTOR_SHEET: "renderEncounterActorSheet",
}

/**
 * Tidy5e Sheets Hooks
 * @constant
 * @type {Object}
 */
export const HOOKS_TIDY5E = {
  READY: "tidy5e-sheet.ready",
  PRE_PROMPT_GROUP_SKILL_ROLL: "tidy5e-sheet.prePromptGroupSkillRoll",
  RENDER_ACTOR_SHEET: "tidy5e-sheet.renderActorSheet",
  RENDER_GROUP_SHEET_QUADRONE: "renderTidy5eGroupSheetQuadrone",
  RENDER_GROUP_SHEET_CLASSIC: "renderTidy5eGroupSheetClassic",
  RENDER_ENCOUNTER_SHEET_QUADRONE: "renderTidy5eEncounterSheetQuadrone",
  RENDER_ENCOUNTER_SHEET_CLASSIC: "renderTidy5eEncounterSheetClassic"
}

/**
 * Flash Token Bar 5e Hooks
 * @constant
 * @type {Object}
 */
export const HOOKS_MODULE = {
  READY: "ready"
}