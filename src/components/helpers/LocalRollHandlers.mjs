import { ROLL_TYPES } from "../../constants/General.mjs";

/**
 * Helper functions for local roll handling (NPC rolls)
 */
export const LocalRollHelpers = {
  /**
   * Ensure an actor is added to the active combat
   * @param {Actor} actor - The actor to add to combat
   * @returns {Promise<Combatant|null>} The combatant or null if failed
   */
  async ensureActorInCombat(actor) {
    if (!game.combat) {
      return null;
    }
    
    // Check if actor is already in combat
    let combatant = game.combat.getCombatantByActor(actor.id);
    if (combatant) {
      return combatant;
    }
    
    // Try to add actor to combat
    const tokens = actor.getActiveTokens();
    try {
      if (tokens.length) {
        // Actor has token on scene
        const combatantData = await game.combat.createEmbeddedDocuments("Combatant", [{
          tokenId: tokens[0].id,
          actorId: actor.id
        }]);
        return combatantData[0];
      } else {
        // No token on scene, create combatant with just actor
        const combatantData = await game.combat.createEmbeddedDocuments("Combatant", [{
          actorId: actor.id
        }]);
        return combatantData[0];
      }
    } catch (error) {
      console.error(`Failed to add actor ${actor.name} to combat:`, error);
      return null;
    }
  },
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
        parts: ["@situational"],
        data: { situational: config.situational },
        options: {},
        situational: true
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
  [ROLL_TYPES.ABILITY_CHECK]: async (actor, rollKey, config) => {
    const [rollConfig, dialogConfig, messageConfig] = LocalRollHelpers.buildAbilityCheckConfig(rollKey, config);
    await actor.rollAbilityCheck(rollConfig, dialogConfig, messageConfig);
  },

  [ROLL_TYPES.SAVING_THROW]: async (actor, rollKey, config) => {
    const [rollConfig, dialogConfig, messageConfig] = LocalRollHelpers.buildAbilityCheckConfig(rollKey, config);
    await actor.rollSavingThrow(rollConfig, dialogConfig, messageConfig);
  },

  [ROLL_TYPES.SKILL]: async (actor, rollKey, config) => {
    const [rollConfig, dialogConfig, messageConfig] = LocalRollHelpers.buildSkillCheckConfig(rollKey, config);
    await actor.rollSkill(rollConfig, dialogConfig, messageConfig);
  },

  [ROLL_TYPES.TOOL]: async (actor, rollKey, config) => {
    const [rollConfig, dialogConfig, messageConfig] = LocalRollHelpers.buildToolCheckConfig(rollKey, config);
    await actor.rollToolCheck(rollConfig, dialogConfig, messageConfig);
  },

  [ROLL_TYPES.CONCENTRATION]: async (actor, rollKey, config) => {
    const rollConfig = {
      advantage: config.advantage,
      disadvantage: config.disadvantage,
      target: config.target
    };
    
    // Add situational bonus if present
    if (config.situational) {
      rollConfig.bonus = config.situational;
    }
    
    const dialogConfig = { configure: !config.fastForward && !config.skipDialog };
    const messageConfig = {
      rollMode: config.rollMode,
      create: config.chatMessage !== false
    };
    await actor.rollConcentration(rollConfig, dialogConfig, messageConfig);
  },

  [ROLL_TYPES.INITIATIVE_DIALOG]: async (actor, rollKey, config) => {
    // Initiative rolls require an active combat
    if (!game.combat) {
      ui.notifications.warn(game.i18n.localize("COMBAT.NoneActive"));
      return;
    }
    
    // Ensure actor is in combat before rolling
    const combatant = await LocalRollHelpers.ensureActorInCombat(actor);
    if (!combatant) {
      ui.notifications.warn(game.i18n.format("CRLNGN_ROLL_REQUESTS.notifications.actorNotInCombat", {
        actor: actor.name
      }));
      return;
    }
    
    const rollConfig = {
      advantage: config.advantage,
      disadvantage: config.disadvantage
    };
    
    // Add situational bonus if present
    if (config.situational) {
      rollConfig.bonus = config.situational;
    }
    
    const dialogConfig = { configure: !config.fastForward && !config.skipDialog };
    const messageConfig = {
      rollMode: config.rollMode,
      create: config.chatMessage !== false
    };
    
    // Use rollInitiative (without dialog) when skipDialog is true
    await (config.skipDialog || config.fastForward 
      ? actor.rollInitiative(rollConfig, dialogConfig, messageConfig)
      : actor.rollInitiativeDialog(rollConfig, dialogConfig, messageConfig));
  },

  [ROLL_TYPES.DEATH_SAVE]: async (actor, rollKey, config) => {
    const rollConfig = {
      advantage: config.advantage,
      disadvantage: config.disadvantage,
      target: config.target
    };
    
    // Add situational bonus if present
    if (config.situational) {
      rollConfig.bonus = config.situational;
    }
    
    const dialogConfig = { configure: !config.fastForward && !config.skipDialog };
    const messageConfig = {
      rollMode: config.rollMode,
      create: config.chatMessage !== false
    };
    await actor.rollDeathSave(rollConfig, dialogConfig, messageConfig);
  },

  [ROLL_TYPES.CUSTOM]: async (actor, rollKey, config) => {
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