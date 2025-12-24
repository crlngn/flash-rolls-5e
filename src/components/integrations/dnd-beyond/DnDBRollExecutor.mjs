import { MODULE_ID } from "../../../constants/General.mjs";
import { getSettings } from "../../../constants/Settings.mjs";
import { LogUtil } from "../../utils/LogUtil.mjs";
import { SettingsUtil } from "../../utils/SettingsUtil.mjs";
import { getPlayerOwner, getTargetDescriptors } from "../../helpers/Helpers.mjs";
import { DnDBRollParser } from "./DnDBRollParser.mjs";
import { DnDBRollUtil } from "./DnDBRollUtil.mjs";
import { DnDBActivityUtil } from "./DnDBActivityUtil.mjs";
import { DnDBMidiIntegration } from "./DnDBMidiIntegration.mjs";

/**
 * Executes rolls in Foundry using DnDB dice values
 * Intercepts Foundry roll methods and injects DnDB results
 */
export class DnDBRollExecutor {

  static _pendingVanillaDamageRoll = null;
  static _isDnDBDamageInProgress = false;

  static setPendingDamageRoll(rollInfo) {
    this._pendingVanillaDamageRoll = rollInfo;
    LogUtil.log("DnDBRollExecutor.setPendingDamageRoll", [rollInfo?.action]);
  }

  static clearPendingDamageRoll() {
    this._pendingVanillaDamageRoll = null;
  }

  static consumePendingDamageRoll() {
    const roll = this._pendingVanillaDamageRoll;
    this._pendingVanillaDamageRoll = null;
    this._isDnDBDamageInProgress = true;
    return roll;
  }

  static hasPendingDamageRoll() {
    return this._pendingVanillaDamageRoll !== null;
  }

  static isDnDBDamageInProgress() {
    return this._isDnDBDamageInProgress;
  }

  static clearDnDBDamageInProgress() {
    this._isDnDBDamageInProgress = false;
  }

  /**
   * Check if spell slot consumption should be skipped for DDB rolls
   * @returns {boolean} True if spell slots should NOT be consumed
   */
  static shouldSkipSpellSlotConsumption() {
    const SETTINGS = getSettings();
    return SettingsUtil.get(SETTINGS.ddbNoAutoConsumeSpellSlot.tag) === true;
  }

  /**
   * Execute a roll based on the category
   * @param {Actor} actor - The Foundry actor
   * @param {Object} rollInfo - Parsed roll info from DnDBRollParser
   * @param {Object} category - Roll category from DnDBRollParser
   * @returns {Promise<boolean>} Success status
   */
  static async execute(actor, rollInfo, category) {
    if (!actor) {
      LogUtil.warn("DnDBRollExecutor: No actor for roll execution");
      return false;
    }

    LogUtil.log("DnDBRollExecutor: Executing roll", [category.category, rollInfo.action]);

    try {
      switch (category.category) {
        case "save":
          return await this._executeSave(actor, rollInfo, category);

        case "abilityCheck":
          return await this._executeAbilityCheck(actor, rollInfo, category);

        case "skill":
          return await this._executeSkillCheck(actor, rollInfo, category);

        case "tool":
          return await this._executeToolCheck(actor, rollInfo, category);

        case "initiative":
          return await this._executeInitiative(actor, rollInfo);

        case "attack":
          return await this._executeAttack(actor, rollInfo, category);

        case "damage":
          return await this._executeDamage(actor, rollInfo, category);

        case "healing":
          return await this._executeHealing(actor, rollInfo, category);

        default:
          LogUtil.log("DnDBRollExecutor: Unhandled category, creating simple message", [category]);
          return await this._createSimpleMessage(actor, rollInfo);
      }
    } catch (error) {
      LogUtil.error("DnDBRollExecutor: Roll execution failed", [error]);
      return false;
    }
  }

  /**
   * Execute a saving throw
   * Sets pending roll so hook can inject DnDB values before evaluation
   */
  static async _executeSave(actor, rollInfo, category) {
    DnDBMidiIntegration.setPendingRoll(rollInfo);

    const owner = getPlayerOwner(actor) || game.user;
    const rollConfig = { ability: category.ability, sendRequest: false };
    const dialogConfig = { configure: false };
    const messageConfig = {
      create: true,
      data: {
        speaker: ChatMessage.getSpeaker({ actor }),
        author: owner.id,
        flags: {
          ...this._buildFlags(rollInfo),
          rsr5e: { processed: true, quickRoll: false }
        }
      }
    };

    const rolls = await actor.rollSavingThrow(
      rollConfig,
      dialogConfig,
      messageConfig
    );

    if (!rolls || rolls.length < 1) {
      DnDBMidiIntegration.clearPendingRoll();
      return false;
    }

    return true;
  }

  /**
   * Execute an ability check
   * Sets pending roll so hook can inject DnDB values before evaluation
   */
  static async _executeAbilityCheck(actor, rollInfo, category) {
    DnDBMidiIntegration.setPendingRoll(rollInfo);

    const owner = getPlayerOwner(actor) || game.user;
    const rollConfig = { ability: category.ability, sendRequest: false };
    const dialogConfig = { configure: false };
    const messageConfig = {
      create: true,
      data: {
        speaker: ChatMessage.getSpeaker({ actor }),
        author: owner.id,
        flags: {
          ...this._buildFlags(rollInfo),
          rsr5e: { processed: true, quickRoll: false }
        }
      }
    };

    const rolls = await actor.rollAbilityCheck(
      rollConfig,
      dialogConfig,
      messageConfig
    );

    if (!rolls || rolls.length < 1) {
      DnDBMidiIntegration.clearPendingRoll();
      return false;
    }

    return true;
  }

  /**
   * Execute a skill check
   * Sets pending roll so hook can inject DnDB values before evaluation
   */
  static async _executeSkillCheck(actor, rollInfo, category) {
    DnDBMidiIntegration.setPendingRoll(rollInfo);

    const owner = getPlayerOwner(actor) || game.user;
    const rollConfig = { skill: category.skill, sendRequest: false };
    const dialogConfig = { configure: false };
    const messageConfig = {
      create: true,
      data: {
        speaker: ChatMessage.getSpeaker({ actor }),
        author: owner.id,
        flags: {
          ...this._buildFlags(rollInfo),
          rsr5e: { processed: true, quickRoll: false }
        }
      }
    };

    const rolls = await actor.rollSkill(
      rollConfig,
      dialogConfig,
      messageConfig
    );

    if (!rolls || rolls.length < 1) {
      DnDBMidiIntegration.clearPendingRoll();
      return false;
    }

    return true;
  }

  /**
   * Execute a tool check
   * Sets pending roll so hook can inject DnDB values before evaluation
   */
  static async _executeToolCheck(actor, rollInfo, category) {
    const tool = category.tool;

    if (!tool) {
      return await this._executeAbilityCheck(actor, rollInfo, { ability: "dex" });
    }

    DnDBMidiIntegration.setPendingRoll(rollInfo);

    const owner = getPlayerOwner(actor) || game.user;
    const rollConfig = { sendRequest: false };
    const dialogConfig = { configure: false };
    const messageConfig = {
      create: true,
      data: {
        speaker: ChatMessage.getSpeaker({ actor }),
        author: owner.id,
        flags: {
          ...this._buildFlags(rollInfo),
          rsr5e: { processed: true, quickRoll: false }
        }
      }
    };

    const toolConfig = {
      ...rollConfig,
      ability: tool.system.ability,
      bonus: tool.system.bonus,
      prof: tool.system.prof,
      item: tool,
      tool: tool.system.type.baseItem
    };
    const rolls = await actor.rollToolCheck(toolConfig, dialogConfig, messageConfig);

    if (!rolls || rolls.length < 1) {
      DnDBMidiIntegration.clearPendingRoll();
      return false;
    }

    return true;
  }

  /**
   * Execute an initiative roll and add the actor to combat
   */
  static async _executeInitiative(actor, rollInfo) {
    const ddbRoll = rollInfo.rawRolls[0];
    const initiativeTotal = ddbRoll.result?.total || 0;

    let combat = game.combat;
    if (!combat) {
      if (game.user.isGM && canvas.scene) {
        const cls = getDocumentClass("Combat");
        combat = await cls.create({ scene: canvas.scene.id, active: true });
      } else {
        ui.notifications.warn("COMBAT.NoneActive", { localize: true });
        return false;
      }
    }

    let tokenActor = actor;
    let token = null;
    if (!actor.isToken) {
      token = canvas.tokens.placeables.find(t => t.actor?.id === actor.id);
      if (token) {
        tokenActor = token.actor;
      }
    } else {
      token = actor.token?.object || canvas.tokens.get(actor.token?.id);
    }

    let combatants = combat.getCombatantsByActor(tokenActor);
    if (combatants.length === 0 && token) {
      await combat.createEmbeddedDocuments("Combatant", [{
        tokenId: token.id,
        sceneId: token.scene?.id || canvas.scene?.id,
        actorId: actor.id,
        hidden: token.document?.hidden || false
      }]);
      combatants = combat.getCombatantsByActor(tokenActor);
    }

    if (combatants.length > 0) {
      const combatant = combatants[0];
      await combatant.update({ initiative: initiativeTotal });
    }

    const roll = actor.getInitiativeRoll();
    if (!roll) return true;

    await roll.evaluate();
    DnDBRollUtil.injectDnDBDiceValues(roll, ddbRoll);

    const owner = getPlayerOwner(actor) || game.user;
    const rollMode = game.settings.get("core", "rollMode");
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      author: owner.id,
      flavor: this._buildFlavor(rollInfo, "initiative"),
      flags: {
        ...this._buildFlags(rollInfo),
        rsr5e: { processed: true, quickRoll: false }
      }
    }, { rollMode });

    return true;
  }

  /**
   * Execute an attack roll
   * Uses Midi-QOL workflow when available for full integration
   */
  static async _executeAttack(actor, rollInfo, category) {
    const item = DnDBRollParser.findItemByAction(actor, category.action);
    if (!item) {
      LogUtil.warn("DnDBRollExecutor: Item not found for attack", [category.action]);
      return await this._createSimpleMessage(actor, rollInfo);
    }

    const activity = DnDBRollParser.getActivityFromItem(item, "attack");
    if (!activity) {
      LogUtil.warn("DnDBRollExecutor: No attack activity found", [item.name]);
      return await this._createSimpleMessage(actor, rollInfo);
    }

    if (DnDBMidiIntegration.isActive()) {
      LogUtil.log("DnDBRollExecutor._executeAttack - Using Midi-QOL workflow");
      return await DnDBMidiIntegration.executeAttackWithMidi(actor, activity, rollInfo);
    }

    return await this._executeAttackVanilla(actor, item, activity, rollInfo);
  }

  /**
   * Execute an attack roll using vanilla DnD5e system
   */
  static async _executeAttackVanilla(actor, item, activity, rollInfo) {
    DnDBMidiIntegration.setPendingRoll(rollInfo);

    const ddbRoll = rollInfo.rawRolls[0];
    const dialogConfig = { configure: false };
    const targets = getTargetDescriptors();
    const rollConfig = {
      subsequentActions: false,
      consume: { resources: false, spellSlot: false },
      target: targets.length === 1 ? targets[0].ac : undefined,
      sendRequest: false,
      flags: {
        ...this._buildFlags(rollInfo),
        dnd5e: { roll: { type: "attack" } }
      }
    };

    const oldTemplate = activity.metadata.usage.chatCard;
    activity.metadata.usage.chatCard = `modules/${MODULE_ID}/templates/ddb-attack-card.hbs`;

    const rolls = await activity.rollAttack(rollConfig, dialogConfig, {
      create: false,
      data: {
        speaker: ChatMessage.getSpeaker({ actor }),
        targets: targets,
        flags: {
          ...this._buildFlags(rollInfo),
          dnd5e: { targets: targets }
        }
      }
    });

    if (!rolls || rolls.length < 1) {
      activity.metadata.usage.chatCard = oldTemplate;
      return false;
    }

    DnDBRollUtil.injectDnDBDiceValues(rolls[0], ddbRoll);

    LogUtil.log("DnDBRollExecutor._executeAttackVanilla - after inject", [rolls[0]]);

    const usageConfig = {
      subsequentActions: false,
      consume: { resources: false, spellSlot: false }
    };

    const usageResults = await DnDBActivityUtil.ddbUse(activity, usageConfig, dialogConfig, {
      create: false,
      data: {
        rolls: [rolls[0]],
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: `${item.name}: ${game.i18n.localize("DND5E.Attack")}`,
        targets: targets,
        flags: {
          ...this._buildFlags(rollInfo),
          dnd5e: { roll: { type: "attack" }, targets: targets },
          rsr5e: { processed: true, quickRoll: false }
        }
      }
    });

    activity.metadata.usage.chatCard = oldTemplate;

    if (!usageResults?.message) {
      LogUtil.warn("DnDBRollExecutor: ddbUse returned no message");
      return false;
    }

    const owner = getPlayerOwner(actor) || game.user;
    usageResults.message.flags = usageResults.message.flags ?? {};
    usageResults.message.author = owner.id;
    const rollMode = game.settings.get("core", "rollMode");
    const card = await ChatMessage.implementation.create(usageResults.message, { rollMode });
    LogUtil.log("DnDBRollExecutor._executeAttackVanilla - created card", [card]);

    return true;
  }

  /**
   * Execute a damage roll
   * Uses Midi-QOL workflow when available for full integration
   */
  static async _executeDamage(actor, rollInfo, category) {
    LogUtil.log("DnDBRollExecutor._executeDamage - Entry", [
      "action:", category.action,
      "isGM:", game.user.isGM
    ]);

    const item = DnDBRollParser.findItemByAction(actor, category.action);
    if (!item) {
      LogUtil.warn("DnDBRollExecutor: Item not found for damage", [category.action]);
      return await this._createSimpleMessage(actor, rollInfo);
    }

    const activity = DnDBRollParser.getActivityFromItem(item, "damage");
    if (!activity) {
      LogUtil.warn("DnDBRollExecutor: No damage activity found", [item.name]);
      return await this._createSimpleMessage(actor, rollInfo);
    }

    if (DnDBMidiIntegration.isActive()) {
      LogUtil.log("DnDBRollExecutor._executeDamage - Checking Midi-QOL workflow routing", [
        "isGM:", game.user.isGM
      ]);
      const midiResult = await DnDBMidiIntegration.executeDamageWithMidi(actor, activity, rollInfo);
      if (midiResult) return true;
      LogUtil.log("DnDBRollExecutor._executeDamage - Midi returned false, using vanilla flow", [
        "isGM:", game.user.isGM
      ]);
    }

    return await this._executeDamageVanilla(actor, item, activity, rollInfo);
  }

  /**
   * Execute a damage roll using vanilla DnD5e system
   * For SAVE activities, stores pending roll info and lets onPostUseActivityPlayer handle the damage roll
   */
  static async _executeDamageVanilla(actor, item, activity, rollInfo) {
    const dialogConfig = { configure: false };
    const owner = getPlayerOwner(actor) || game.user;
    const rollMode = game.settings.get("core", "rollMode");
    const hasTemplate = activity.target?.template?.type;

    if (!activity.attack) {
      LogUtil.log("DnDBRollExecutor: Damage-only activity (SAVE), setting pending roll and triggering usage", [
        "item:", item.name,
        "hasTemplate:", hasTemplate
      ]);

      this.setPendingDamageRoll(rollInfo);
      const consumeSpellSlot = !this.shouldSkipSpellSlotConsumption();

      const usageConfig = {
        subsequentActions: false,
        consume: { resources: true, spellSlot: consumeSpellSlot },
        create: { measuredTemplate: !!hasTemplate, _isDnDBRoll: true }
      };

      LogUtil.log("DnDBRollExecutor: About to call ddbUse (will wait for template if needed)");
      const usageResult = await DnDBActivityUtil.ddbUse(activity, usageConfig, dialogConfig, {
        create: true,
        rollMode: rollMode,
        data: {
          rolls: [],
          speaker: ChatMessage.getSpeaker({ actor }),
          author: owner.id,
          flags: {
            ...this._buildFlags(rollInfo),
            rsr5e: { processed: true, quickRoll: false }
          }
        }
      });
      LogUtil.log("DnDBRollExecutor: ddbUse completed", [
        "templates:", usageResult?.templates?.length
      ]);

      return true;
    }

    DnDBMidiIntegration.setPendingRoll(rollInfo);

    const ddbRoll = rollInfo.rawRolls[0];
    const targets = getTargetDescriptors();
    LogUtil.log("DnDBRollExecutor: Rolling damage via activity (attack activity)", ["targets:", targets.length]);

    const rollConfig = { sendRequest: false };
    const rolls = await activity.rollDamage(rollConfig, dialogConfig, {
      create: false,
      data: {
        speaker: ChatMessage.getSpeaker({ actor }),
        targets: targets,
        flags: {
          ...this._buildFlags(rollInfo),
          dnd5e: { targets: targets }
        }
      }
    });

    if (!rolls || rolls.length < 1) {
      LogUtil.warn("DnDBRollExecutor: rollDamage returned no rolls");
      return false;
    }

    DnDBRollUtil.injectDnDBDiceValues(rolls[0], ddbRoll);

    LogUtil.log("DnDBRollExecutor: Creating damage message with targets");
    const messageConfig = {
      speaker: ChatMessage.getSpeaker({ actor }),
      author: owner.id,
      flavor: `${item.name} - ${activity.damageFlavor}`,
      flags: {
        ...this._buildFlags(rollInfo),
        dnd5e: {
          ...activity.messageFlags,
          messageType: "roll",
          roll: { type: "damage" },
          targets: targets
        },
        rsr5e: { processed: true, quickRoll: false }
      }
    };

    await rolls[0].toMessage(messageConfig, { rollMode });
    LogUtil.log("DnDBRollExecutor: Damage message created");

    return true;
  }

  /**
   * Execute a healing roll
   * Uses Midi-QOL workflow when available for full integration
   */
  static async _executeHealing(actor, rollInfo, category) {
    const item = DnDBRollParser.findItemByAction(actor, category.action);
    if (!item) {
      LogUtil.warn("DnDBRollExecutor: Item not found for healing", [category.action]);
      return await this._createSimpleMessage(actor, rollInfo);
    }

    const activity = DnDBRollParser.getActivityFromItem(item, "heal");
    if (!activity) {
      LogUtil.warn("DnDBRollExecutor: No heal activity found", [item.name]);
      return await this._createSimpleMessage(actor, rollInfo);
    }

    if (DnDBMidiIntegration.isActive()) {
      LogUtil.log("DnDBRollExecutor._executeHealing - Using Midi-QOL workflow");
      return await DnDBMidiIntegration.executeHealingWithMidi(actor, activity, rollInfo);
    }

    return await this._executeHealingVanilla(actor, item, activity, rollInfo);
  }

  /**
   * Execute a healing roll using vanilla DnD5e system
   */
  static async _executeHealingVanilla(actor, item, activity, rollInfo) {
    DnDBMidiIntegration.setPendingRoll(rollInfo);

    const ddbRoll = rollInfo.rawRolls[0];
    const dialogConfig = { configure: false };
    const owner = getPlayerOwner(actor) || game.user;
    const rollMode = game.settings.get("core", "rollMode");

    LogUtil.log("DnDBRollExecutor: Healing activity (vanilla), triggering usage first", [item.name]);
    const consumeSpellSlot = !this.shouldSkipSpellSlotConsumption();
    const usageConfig = {
      subsequentActions: false,
      consume: { resources: true, spellSlot: consumeSpellSlot }
    };

    await DnDBActivityUtil.ddbUse(activity, usageConfig, dialogConfig, {
      create: true,
      rollMode: rollMode,
      data: {
        rolls: [],
        speaker: ChatMessage.getSpeaker({ actor }),
        author: owner.id,
        flags: {
          ...this._buildFlags(rollInfo),
          rsr5e: { processed: true, quickRoll: false }
        }
      }
    });

    const targets = getTargetDescriptors();
    const rollConfig = { sendRequest: false };
    const rolls = await activity.rollDamage(rollConfig, dialogConfig, {
      create: false,
      data: {
        speaker: ChatMessage.getSpeaker({ actor }),
        targets: targets,
        flags: {
          ...this._buildFlags(rollInfo),
          dnd5e: { targets: targets }
        }
      }
    });

    if (!rolls || rolls.length < 1) return false;

    DnDBRollUtil.injectDnDBDiceValues(rolls[0], ddbRoll);

    const messageConfig = {
      speaker: ChatMessage.getSpeaker({ actor }),
      author: owner.id,
      flavor: `${item.name}: ${game.i18n.localize("DND5E.Healing")}`,
      flags: {
        ...this._buildFlags(rollInfo),
        dnd5e: { roll: { type: "damage" }, targets: targets },
        rsr5e: { processed: true, quickRoll: false }
      }
    };
    await rolls[0].toMessage(messageConfig, { rollMode });

    return true;
  }

  /**
   * Create a simple chat message for unhandled roll types
   * Uses standard Foundry roll template by creating a Roll object from DDB data
   */
  static async _createSimpleMessage(actor, rollInfo) {
    const speaker = actor
      ? ChatMessage.getSpeaker({ actor })
      : { alias: rollInfo.characterName };

    const ddbRoll = rollInfo.rawRolls?.[0];
    if (ddbRoll) {
      const roll = DnDBRollUtil.createRollFromDnDB(ddbRoll);
      if (roll) {
        const owner = actor ? (getPlayerOwner(actor) || game.user) : game.user;
        const rollMode = game.settings.get("core", "rollMode");
        const typeLabel = DnDBRollParser.getRollTypeLabel(rollInfo.rollType);
        const flavor = typeLabel ? `${rollInfo.action}: ${typeLabel}` : rollInfo.action;

        await roll.toMessage({
          speaker,
          author: owner.id,
          flavor,
          flags: {
            ...this._buildFlags(rollInfo),
            rsr5e: { processed: true, quickRoll: false }
          }
        }, { rollMode });

        return true;
      }
    }

    const diceHtml = rollInfo.diceResults
      .map((d) => `<span class="die d${d.type.replace("d", "")}">${d.value}</span>`)
      .join(" ");

    const typeLabel = DnDBRollParser.getRollTypeLabel(rollInfo.rollType);
    const content = `
      <div class="ddb-roll flash5e-ddb-roll">
        <div class="roll-header">
          <span class="roll-action">${rollInfo.action}</span>
          ${typeLabel ? `<span class="roll-type">${typeLabel}</span>` : ""}
        </div>
        <div class="roll-content">
          <div class="dice-results">${diceHtml}</div>
          <div class="roll-formula">${rollInfo.formula}</div>
          <div class="roll-total">${rollInfo.total}</div>
        </div>
      </div>
    `;

    const owner = actor ? (getPlayerOwner(actor) || game.user) : game.user;
    const rollMode = game.settings.get("core", "rollMode");
    await ChatMessage.create({
      speaker,
      author: owner.id,
      content,
      flags: {
        ...this._buildFlags(rollInfo),
        rsr5e: { processed: true, quickRoll: false }
      }
    }, { rollMode });

    return true;
  }

  /**
   * Build flavor text for roll messages
   */
  static _buildFlavor(rollInfo, type) {
    const advantageLabel = rollInfo.isAdvantage
      ? ` (${game.i18n.localize("DND5E.Advantage")})`
      : rollInfo.isDisadvantage
        ? ` (${game.i18n.localize("DND5E.Disadvantage")})`
        : "";

    const action = rollInfo.action;
    const actionLower = action.toLowerCase();

    if (type === "save") {
      const abilityConfig = Object.entries(CONFIG.DND5E.abilities).find(
        ([abbr, data]) => abbr === actionLower || data.label?.toLowerCase() === actionLower
      );
      if (abilityConfig) {
        return `${abilityConfig[1].label} ${game.i18n.localize("DND5E.ActionSave")}${advantageLabel}`;
      }
    }

    if (type === "check") {
      const abilityConfig = Object.entries(CONFIG.DND5E.abilities).find(
        ([abbr, data]) => abbr === actionLower || data.label?.toLowerCase() === actionLower
      );
      if (abilityConfig) {
        return game.i18n.format("DND5E.AbilityPromptTitle", { ability: abilityConfig[1].label }) + advantageLabel;
      }
    }

    if (type === "skill") {
      const skillConfig = Object.entries(CONFIG.DND5E.skills).find(
        ([abbr, data]) => abbr === actionLower || data.label?.toLowerCase() === actionLower
      );
      if (skillConfig) {
        const abilityAbbr = skillConfig[1].ability;
        const abilityLabel = CONFIG.DND5E.abilities[abilityAbbr]?.label || abilityAbbr;
        return game.i18n.format("DND5E.SkillPromptTitle", {
          skill: skillConfig[1].label,
          ability: abilityLabel
        }) + advantageLabel;
      }
    }

    if (type === "initiative") {
      return game.i18n.localize("DND5E.Initiative") + advantageLabel;
    }

    return `${action}${advantageLabel}`;
  }

  /**
   * Build message flags for DnDB rolls
   */
  static _buildFlags(rollInfo) {
    return {
      [MODULE_ID]: {
        isDnDBRoll: true,
        ddbCharacterId: rollInfo.characterId,
        ddbSource: rollInfo.source,
        rollType: rollInfo.rollType,
        action: rollInfo.action
      },
      rsr5e: { processed: true, quickRoll: false }
    };
  }
}
