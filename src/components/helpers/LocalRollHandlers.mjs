import { LOCAL_ROLL_TYPES } from "../../constants/General.mjs";

/**
 * Helper functions for local roll handling (NPC rolls)
 */
export const LocalRollHelpers = {
  /**
   * Build ability check configuration
   * @param {string} rollKey - The ability key
   * @param {Object} config - Base configuration
   * @returns {Array} Configuration array for D&D5e roll methods
   */
  buildAbilityCheckConfig(rollKey, config) {
    const rollConfig = {
      ability: rollKey,
      advantage: config.advantage,
      disadvantage: config.disadvantage,
      target: config.target,
      isRollRequest: config.isRollRequest
    };
    
    // Add situational bonus if present
    if (config.situational) {
      rollConfig.rolls = [{
        parts: [],
        data: { situational: config.situational },
        options: {},
        situational: config.situational
      }];
    }
    
    const dialogConfig = {
      configure: !config.fastForward
    };
    
    const messageConfig = {
      rollMode: config.rollMode,
      create: config.chatMessage !== false
    };
    
    return [rollConfig, dialogConfig, messageConfig];
  },

  /**
   * Build skill check configuration
   * @param {string} rollKey - The skill key
   * @param {Object} config - Base configuration
   * @returns {Array} Configuration array for D&D5e roll methods
   */
  buildSkillCheckConfig(rollKey, config) {
    const rollConfig = {
      skill: rollKey,
      advantage: config.advantage,
      disadvantage: config.disadvantage,
      ability: config.ability,
      chooseAbility: !config.ability
    };
    
    if (config.situational) rollConfig.bonus = config.situational;
    if (config.target) rollConfig.target = config.target;
    
    const dialogConfig = {
      configure: !config.fastForward
    };
    
    const messageConfig = {
      rollMode: config.rollMode,
      create: config.chatMessage !== false,
      data: {}
    };
    
    // Add custom flavor if provided
    if (config.rollTitle) {
      messageConfig.data.flavor = config.rollTitle;
    } else if (config.ability) {
      const skillLabel = CONFIG.DND5E.skills[rollKey]?.label || rollKey;
      const abilityLabel = CONFIG.DND5E.abilities[config.ability]?.label || config.ability;
      messageConfig.data.flavor = game.i18n.format("DND5E.SkillPromptTitle", {
        skill: skillLabel,
        ability: abilityLabel
      });
    }
    
    return [rollConfig, dialogConfig, messageConfig];
  },

  /**
   * Build tool check configuration
   * @param {string} rollKey - The tool key
   * @param {Object} config - Base configuration
   * @returns {Array} Configuration array for D&D5e roll methods
   */
  buildToolCheckConfig(rollKey, config) {
    const rollConfig = {
      tool: rollKey,
      advantage: config.advantage,
      disadvantage: config.disadvantage,
      ability: config.ability,
      chooseAbility: !config.ability
    };
    
    if (config.situational) rollConfig.bonus = config.situational;
    if (config.target) rollConfig.target = config.target;
    
    const dialogConfig = {
      configure: !config.fastForward
    };
    
    const messageConfig = {
      rollMode: config.rollMode,
      create: config.chatMessage !== false,
      data: {}
    };
    
    // Add custom flavor if provided
    if (config.rollTitle) {
      messageConfig.data.flavor = config.rollTitle;
    } else if (config.ability) {
      // Get tool label
      let toolLabel = rollKey;
      const toolData = CONFIG.DND5E.enrichmentLookup?.tools?.[rollKey];
      if (toolData?.id) {
        const toolItem = dnd5e.documents.Trait.getBaseItem(toolData.id, { indexOnly: true });
        toolLabel = toolItem?.name || rollKey;
      }
      const abilityLabel = CONFIG.DND5E.abilities[config.ability]?.label || config.ability;
      // D&D5e doesn't have a tool format with ability, so create custom flavor
      messageConfig.data.flavor = `${abilityLabel} (${toolLabel}) ${game.i18n.localize("DND5E.Check")}`;
    }
    
    return [rollConfig, dialogConfig, messageConfig];
  }
};

/**
 * Handlers for each local roll type
 */
export const LOCAL_ROLL_HANDLERS = {
  [LOCAL_ROLL_TYPES.ABILITY_CHECK]: async (actor, rollKey, config) => {
    const [rollConfig, dialogConfig, messageConfig] = LocalRollHelpers.buildAbilityCheckConfig(rollKey, config);
    await actor.rollAbilityCheck(rollConfig, dialogConfig, messageConfig);
  },

  [LOCAL_ROLL_TYPES.SAVING_THROW]: async (actor, rollKey, config) => {
    const [rollConfig, dialogConfig, messageConfig] = LocalRollHelpers.buildAbilityCheckConfig(rollKey, config);
    await actor.rollSavingThrow(rollConfig, dialogConfig, messageConfig);
  },

  [LOCAL_ROLL_TYPES.SKILL]: async (actor, rollKey, config) => {
    const [rollConfig, dialogConfig, messageConfig] = LocalRollHelpers.buildSkillCheckConfig(rollKey, config);
    await actor.rollSkill(rollConfig, dialogConfig, messageConfig);
  },

  [LOCAL_ROLL_TYPES.TOOL]: async (actor, rollKey, config) => {
    const [rollConfig, dialogConfig, messageConfig] = LocalRollHelpers.buildToolCheckConfig(rollKey, config);
    await actor.rollToolCheck(rollConfig, dialogConfig, messageConfig);
  },

  [LOCAL_ROLL_TYPES.CONCENTRATION]: async (actor, rollKey, config) => {
    const dialogConfig = { configure: !config.fastForward && !config.skipDialog };
    const messageConfig = {
      rollMode: config.rollMode,
      create: config.chatMessage !== false
    };
    await actor.rollConcentration(config, dialogConfig, messageConfig);
  },

  [LOCAL_ROLL_TYPES.INITIATIVE_DIALOG]: async (actor, rollKey, config) => {
    // Initiative rolls require an active combat
    if (!game.combat) {
      ui.notifications.warn(game.i18n.localize("COMBAT.NoneActive"));
      return;
    }
    
    const dialogConfig = { configure: !config.fastForward && !config.skipDialog };
    const messageConfig = {
      rollMode: config.rollMode,
      create: config.chatMessage !== false
    };
    
    const result = await actor.rollInitiativeDialog(config, dialogConfig, messageConfig);
    
    // If no result, try a different approach
    if (!result) {
      // Get or create combatant
      let combatant = game.combat.getCombatantByActor(actor.id);
      if (!combatant) {
        const tokens = actor.getActiveTokens();
        if (tokens.length) {
          await game.combat.createEmbeddedDocuments("Combatant", [{
            tokenId: tokens[0].id,
            actorId: actor.id
          }]);
          combatant = game.combat.getCombatantByActor(actor.id);
        }
      }
      
      // Roll initiative directly
      if (combatant) {
        const roll = combatant.getInitiativeRoll();
        await roll.evaluate({async: true});
        await combatant.update({initiative: roll.total});
        await roll.toMessage({
          speaker: ChatMessage.getSpeaker({actor}),
          flavor: game.i18n.localize("DND5E.Initiative")
        });
      }
    }
  },

  [LOCAL_ROLL_TYPES.DEATH_SAVE]: async (actor, rollKey, config) => {
    const dialogConfig = { configure: !config.fastForward && !config.skipDialog };
    const messageConfig = {
      rollMode: config.rollMode,
      create: config.chatMessage !== false
    };
    await actor.rollDeathSave(config, dialogConfig, messageConfig);
  },

  [LOCAL_ROLL_TYPES.CUSTOM]: async (actor, rollKey, config) => {
    // Custom rolls use the formula in rollKey
    try {
      const roll = new Roll(rollKey, actor.getRollData());
      await roll.evaluate({async: true});
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({actor}),
        flavor: game.i18n.localize("CRLNGN_ROLLS.rollTypes.custom")
      });
    } catch (error) {
      ui.notifications.error(game.i18n.format("CRLNGN_ROLLS.ui.notifications.invalidFormula", {formula: rollKey}));
    }
  }
};