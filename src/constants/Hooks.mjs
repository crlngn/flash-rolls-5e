/**
 * Core Foundry hooks
 * @constant
 * @type {Object}
 */
export const HOOKS_CORE = {
  INIT: "init",
  READY: "ready",
  RENDER_CHAT_MESSAGE: "renderChatMessage",
  UPDATE_SCENE: "updateScene",
  RENDER_SCENE_NAVIGATION: "renderSceneNavigation",
  RENDER_ROLL_RESOLVER: "renderRollResolver",
  USER_CONNECTED: "userConnected",
  PRE_CREATE_CHAT_MESSAGE: "preCreateChatMessage",
  CREATE_CHAT_MESSAGE: "createChatMessage"
};

/**
 * Socketlib hooks
 */
export const HOOKS_SOCKET = {
  READY: "socketlib.ready"
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
  PRE_ROLL_ABILITY_CHECK: "dnd5e.preRollAbilityCheck",
  PRE_ROLL_SAVING_THROW: "dnd5e.preRollSavingThrow",
  ROLL_ABILITY_CHECK: "dnd5e.rollAbilityCheck",
  ROLL_SAVING_THROW: "dnd5e.rollSavingThrow",
  
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
  PRE_ROLL_INITIATIVE_DIALOG: "dnd5e.preRollInitiativeDialog",
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
  POST_ROLL_CONFIG: "dnd5e.postRollConfiguration",
  RENDER_ROLL_CONFIGURATION_DIALOG: "renderRollConfigurationDialog",
  RENDER_SKILL_TOOL_ROLL_CONFIGURATION_DIALOG: "renderSkillToolRollConfigurationDialog"
}