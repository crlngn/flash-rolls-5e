import { MODULE_ID } from "../../../constants/General.mjs";
import { HOOKS_DND5E, HOOKS_MIDI_QOL } from "../../../constants/Hooks.mjs";
import { LogUtil } from "@ftb-core/utils/LogUtil.mjs";
import { GeneralUtil } from "../../utils/GeneralUtil.mjs";
import { ModuleHelpers } from "../../helpers/ModuleHelpers.mjs";
import { DnDBRollUtil } from "./DnDBRollUtil.mjs";
import { DnDBRollExecutor } from "./DnDBRollExecutor.mjs";

/**
 * Handles DnDB roll integration with Midi-QOL workflows
 * Uses dnd5e roll configuration hooks to inject DDB dice values into Midi workflows
 */
export class DnDBIntegration {

  static _pendingDnDBRoll = null;

  /**
   * Check if Midi-QOL is active
   * @returns {boolean}
   */
  static isActive() {
    return GeneralUtil.isModuleOn('midi-qol');
  }

  /**
   * Store a pending DnDB roll for injection into the next Foundry roll
   * @param {Object} rollInfo - Parsed roll info from DnDBRollParser
   */
  static setPendingRoll(rollInfo) {
    this._pendingDnDBRoll = rollInfo;
    LogUtil.log("DnDBIntegration.setPendingRoll", [rollInfo]);
  }

  /**
   * Clear any pending DnDB roll
   */
  static clearPendingRoll() {
    this._pendingDnDBRoll = null;
  }

  /**
   * Get and consume the pending DnDB roll
   * @returns {Object|null} The pending roll info or null
   */
  static consumePendingRoll() {
    const roll = this._pendingDnDBRoll;
    this._pendingDnDBRoll = null;
    return roll;
  }

  /**
   * Check if there's a pending DnDB roll
   * @returns {boolean}
   */
  static hasPendingRoll() {
    return this._pendingDnDBRoll !== null;
  }

  static _waitingForDnDBDamage = false;

  /**
   * Register hooks for roll configuration injection
   * Called during module initialization
   */
  static registerHooks() {
    Hooks.on(HOOKS_DND5E.PRE_ROLL_ATTACK, this._onPreRollAttack.bind(this));
    Hooks.on(HOOKS_DND5E.PRE_ROLL_DAMAGE, this._onPreRollDamage.bind(this));
    Hooks.on(HOOKS_DND5E.PRE_ROLL_ABILITY_CHECK, this._onPreRollBasic.bind(this));
    Hooks.on(HOOKS_DND5E.PRE_ROLL_SAVING_THROW, this._onPreRollBasic.bind(this));
    Hooks.on(HOOKS_DND5E.PRE_ROLL_SKILL_V2, this._onPreRollBasic.bind(this));
    Hooks.on(HOOKS_DND5E.PRE_ROLL_TOOL_V2, this._onPreRollBasic.bind(this));
    Hooks.on(HOOKS_DND5E.POST_ATTACK_ROLL_CONFIGURATION, this._onPostAttackRollConfiguration.bind(this));
    Hooks.on(HOOKS_DND5E.POST_DAMAGE_ROLL_CONFIGURATION, this._onPostDamageRollConfiguration.bind(this));
    Hooks.on(HOOKS_DND5E.POST_ABILITY_CHECK_ROLL_CONFIGURATION, this._onPostBasicRollConfiguration.bind(this));
    Hooks.on(HOOKS_DND5E.POST_SKILL_CHECK_ROLL_CONFIGURATION, this._onPostBasicRollConfiguration.bind(this));
    Hooks.on(HOOKS_DND5E.POST_SAVING_THROW_ROLL_CONFIGURATION, this._onPostBasicRollConfiguration.bind(this));
    Hooks.on(HOOKS_MIDI_QOL.PRE_DAMAGE_ROLL, this._onMidiPreDamageRoll.bind(this));
    LogUtil.log("DnDBIntegration: Registered roll configuration hooks");
  }

  /**
   * Handle Midi preDamageRoll hook - block auto-damage when waiting for DDB damage
   * Returns false to cancel the roll if we're waiting for DDB damage
   */
  static _onMidiPreDamageRoll(workflow, activity, config, dialog, message) {
    if (this._waitingForDnDBDamage && !this.hasPendingRoll()) {
      LogUtil.log("DnDBIntegration._onMidiPreDamageRoll - Blocking auto-damage, waiting for DDB damage roll");
      return false;
    }
    return true;
  }

  /**
   * Handle pre-roll attack hook to force skip dialog for DDB rolls
   * This runs before the roll dialog would show
   */
  static _onPreRollAttack(config, dialog, message) {
    if (!this.hasPendingRoll()) return;
    dialog.configure = false;
    LogUtil.log("DnDBIntegration._onPreRollAttack - Forcing dialog.configure = false");
  }

  /**
   * Handle pre-roll damage hook to force skip dialog for DDB rolls
   * This runs before the roll dialog would show
   */
  static _onPreRollDamage(config, dialog, message) {
    if (!this.hasPendingRoll() && !DnDBRollExecutor.hasPendingDamageRoll()) return;
    dialog.configure = false;
    LogUtil.log("DnDBIntegration._onPreRollDamage - Forcing dialog.configure = false");
  }

  /**
   * Handle pre-roll basic roll hook (ability checks, saving throws, skills, tools)
   * Forces skip dialog for DDB rolls
   * This runs before the roll dialog would show
   */
  static _onPreRollBasic(config, dialog, message) {
    if (!this.hasPendingRoll()) return;
    dialog.configure = false;
    LogUtil.log("DnDBIntegration._onPreRollBasic - Forcing dialog.configure = false");
  }

  /**
   * Handle post attack roll configuration hook
   * Injects DnDB dice values into the attack roll before evaluation
   * @param {Roll[]} rolls - The constructed but unevaluated rolls
   * @param {Object} config - Roll configuration
   * @param {Object} dialog - Dialog configuration
   * @param {Object} message - Message configuration
   */
  static _onPostAttackRollConfiguration(rolls, config, dialog, message) {
    if (!this.hasPendingRoll()) return;

    const pendingRoll = this._pendingDnDBRoll;
    const ddbRoll = pendingRoll?.rawRolls?.[0];
    if (!ddbRoll || !rolls?.length) return;

    LogUtil.log("DnDBIntegration._onPostAttackRollConfiguration - Injecting DDB values", [rolls, ddbRoll]);

    for (const roll of rolls) {
      this._injectDiceValuesPreEval(roll, ddbRoll);
    }

    this._addDnDBFlags(message, pendingRoll);
    this.clearPendingRoll();
  }

  /**
   * Handle post damage roll configuration hook
   * Injects DnDB dice values into the damage roll before evaluation
   * @param {Roll[]} rolls - The constructed but unevaluated rolls
   * @param {Object} config - Roll configuration
   * @param {Object} dialog - Dialog configuration
   * @param {Object} message - Message configuration
   */
  static _onPostDamageRollConfiguration(rolls, config, dialog, message) {
    if (!this.hasPendingRoll()) return;

    const pendingRoll = this._pendingDnDBRoll;
    const ddbRoll = pendingRoll?.rawRolls?.[0];
    if (!ddbRoll || !rolls?.length) return;

    LogUtil.log("DnDBIntegration._onPostDamageRollConfiguration - Injecting DDB values", [rolls, ddbRoll]);

    for (const roll of rolls) {
      this._injectDiceValuesPreEval(roll, ddbRoll);
    }

    this._addDnDBFlags(message, pendingRoll);
    this.clearPendingRoll();
  }

  /**
   * Handle post basic roll configuration hook (ability checks, skill checks, saving throws)
   * Injects DnDB dice values into the roll before evaluation
   * @param {Roll[]} rolls - The constructed but unevaluated rolls
   * @param {Object} config - Roll configuration
   * @param {Object} dialog - Dialog configuration
   * @param {Object} message - Message configuration
   */
  static _onPostBasicRollConfiguration(rolls, config, dialog, message) {
    LogUtil.log("DnDBIntegration._onPostBasicRollConfiguration - Hook fired", [
      "hasPending:", this.hasPendingRoll(),
      "rollCount:", rolls?.length
    ]);

    if (!this.hasPendingRoll()) return;

    const pendingRoll = this._pendingDnDBRoll;
    const ddbRoll = pendingRoll?.rawRolls?.[0];
    if (!ddbRoll || !rolls?.length) {
      LogUtil.warn("DnDBIntegration._onPostBasicRollConfiguration - Missing ddbRoll or rolls", [
        "ddbRoll:", !!ddbRoll,
        "rollsLength:", rolls?.length
      ]);
      return;
    }

    LogUtil.log("DnDBIntegration._onPostBasicRollConfiguration - Injecting DDB values", [
      "action:", pendingRoll?.action,
      "rollType:", pendingRoll?.rollType
    ]);

    for (const roll of rolls) {
      this._injectDiceValuesPreEval(roll, ddbRoll);
    }

    this._addDnDBFlags(message, pendingRoll);
    this.clearPendingRoll();
  }

  /**
   * Inject DnDB dice values into a roll BEFORE evaluation
   * Modifies the roll terms to include pre-determined values that will be used during evaluate()
   * @param {Roll} roll - The unevaluated Foundry roll
   * @param {Object} ddbRoll - The DnDB roll data
   */
  static _injectDiceValuesPreEval(roll, ddbRoll) {
    const notation = ddbRoll.diceNotation;
    if (!notation) {
      LogUtil.warn("DnDBIntegration._injectDiceValuesPreEval - No diceNotation found", [ddbRoll]);
      return;
    }

    const allDnDBDice = [];
    for (const set of notation.set || []) {
      for (const die of set.dice || []) {
        allDnDBDice.push(die.dieValue);
      }
    }

    if (allDnDBDice.length === 0) {
      LogUtil.warn("DnDBIntegration._injectDiceValuesPreEval - No dice values found", [notation]);
      return;
    }

    let ddbDiceIndex = 0;
    const Die = foundry.dice.terms.Die;

    for (const term of roll.terms) {
      if (term instanceof Die) {
        term.results = [];
        for (let i = 0; i < term.number; i++) {
          if (ddbDiceIndex < allDnDBDice.length) {
            term.results.push({
              result: allDnDBDice[ddbDiceIndex],
              active: true
            });
            ddbDiceIndex++;
          }
        }
        term._evaluated = true;
      }
    }

    LogUtil.log("DnDBIntegration._injectDiceValuesPreEval - Injected values", [
      "formula:", roll.formula,
      "ddbValues:", allDnDBDice,
      "rollTerms:", roll.terms.map(t => t instanceof Die ? { faces: t.faces, results: t.results } : t)
    ]);
  }

  /**
   * Add DnDB identification flags to the message configuration
   * @param {Object} message - Message configuration object
   * @param {Object} rollInfo - The DnDB roll info
   */
  static _addDnDBFlags(message, rollInfo) {
    if (!message?.data) {
      message.data = {};
    }
    if (!message.data.flags) {
      message.data.flags = {};
    }

    message.data.flags[MODULE_ID] = {
      isDnDBRoll: true,
      ddbCharacterId: rollInfo.characterId,
      ddbSource: rollInfo.source,
      rollType: rollInfo.rollType,
      action: rollInfo.action
    };
    message.data.flags.rsr5e = { processed: true, quickRoll: false };
  }

  /**
   * Execute an attack through Midi-QOL workflow with DnDB dice values
   * Does NOT auto-roll damage - waits for separate DDB damage event
   * @param {Actor} actor - The Foundry actor
   * @param {Activity} activity - The attack activity
   * @param {Object} rollInfo - Parsed DnDB roll info
   * @param {Object} options - Additional options
   * @returns {Promise<boolean>} Success status
   */
  static async executeAttackWithMidi(actor, activity, rollInfo, options = {}) {
    const MidiQOL = ModuleHelpers.getMidiQOL();
    if (!MidiQOL) {
      LogUtil.warn("DnDBIntegration: MidiQOL not available");
      return false;
    }

    this.setPendingRoll(rollInfo);
    this._waitingForDnDBDamage = true;

    const usageConfig = {
      consume: { resources: false, spellSlot: false },
      midiOptions: {
        fastForwardAttack: true,
        fastForwardDamage: true,
        autoRollAttack: true,
        autoRollDamage: 'none',
        workflowOptions: {
          fastForwardAttack: true,
          fastForwardDamage: true,
          autoRollAttack: true,
          autoRollDamage: 'none'
        }
      }
    };

    const dialogConfig = { configure: false };
    const messageConfig = {
      create: true,
      data: {
        flags: {
          [MODULE_ID]: {
            isDnDBRoll: true,
            ddbCharacterId: rollInfo.characterId,
            ddbSource: rollInfo.source
          }
        }
      }
    };

    try {
      const result = await MidiQOL.completeActivityUse(activity, usageConfig, dialogConfig, messageConfig);
      const item = activity.item;
      const workflow = this._findWorkflowWaitingForDamage(MidiQOL, item);
      LogUtil.log("DnDBIntegration.executeAttackWithMidi - After completeActivityUse", [
        "result:", result,
        "workflowFound:", !!workflow,
        "workflowState:", workflow?.currentAction,
        "isGM:", game.user.isGM,
        "_waitingForDnDBDamage:", this._waitingForDnDBDamage
      ]);
      return true;
    } catch (error) {
      LogUtil.error("DnDBIntegration.executeAttackWithMidi failed", [error]);
      this.clearPendingRoll();
      this._waitingForDnDBDamage = false;
      return false;
    }
  }

  /**
   * Execute damage through Midi-QOL workflow with DnDB dice values
   * Implements A/B/C routing logic:
   * A - Activity has attack + existing workflow waiting for damage → use that Midi workflow
   * B - Activity is damage-only (no attack, e.g., save spell or auto-hit) → use new Midi workflow
   * C - Activity has attack + recent workflow (not waiting) → attach damage to that workflow
   * D - Activity has attack but NO workflow at all → return false to fall back to vanilla flow
   * @param {Actor} actor - The Foundry actor
   * @param {Activity} activity - The damage activity
   * @param {Object} rollInfo - Parsed DnDB roll info
   * @param {Object} options - Additional options
   * @returns {Promise<boolean>} Success status, false means caller should use vanilla flow
   */
  static async executeDamageWithMidi(actor, activity, rollInfo, options = {}) {
    const MidiQOL = ModuleHelpers.getMidiQOL();
    if (!MidiQOL) {
      LogUtil.warn("DnDBIntegration: MidiQOL not available");
      return false;
    }

    LogUtil.log("DnDBIntegration.executeDamageWithMidi - Entry", [
      "wasWaitingForDnDBDamage:", this._waitingForDnDBDamage,
      "isGM:", game.user.isGM,
      "activityUuid:", activity.uuid
    ]);

    this._waitingForDnDBDamage = false;

    const item = activity.item;
    const itemRequiresAttack = item?.hasAttack ?? false;
    const workflowByActivity = MidiQOL.Workflow.getWorkflowByActivityUuid?.(activity.uuid);
    const workflowWaiting = this._findWorkflowWaitingForDamage(MidiQOL, activity);
    const recentWorkflow = workflowWaiting || workflowByActivity || this._findRecentWorkflowForItem(MidiQOL, activity);

    LogUtil.log("DnDBIntegration.executeDamageWithMidi - Routing decision", [
      "itemRequiresAttack:", itemRequiresAttack,
      "hasWorkflowWaiting:", !!workflowWaiting,
      "hasWorkflowByActivity:", !!workflowByActivity,
      "hasRecentWorkflow:", !!recentWorkflow,
      "recentWorkflowState:", recentWorkflow?.currentAction,
      "item:", item?.name,
      "activity:", activity.name
    ]);

    if (itemRequiresAttack) {
      if (workflowWaiting) {
        LogUtil.log("DnDBIntegration: Case A - Item requires attack + workflow waiting for damage, using Midi");
        return await this._executeDamageExistingWorkflow(activity, rollInfo, workflowWaiting);
      } else if (recentWorkflow) {
        LogUtil.log("DnDBIntegration: Case C - Item requires attack + recent workflow, attaching damage");
        return await this._executeDamageAttachToWorkflow(activity, rollInfo, recentWorkflow);
      } else {
        LogUtil.log("DnDBIntegration: Case D - Item requires attack but NO workflow, falling back to vanilla");
        return false;
      }
    } else {
      LogUtil.log("DnDBIntegration: Case B - Damage-only item, creating new Midi workflow");
      return await this._executeDamageNewWorkflow(actor, activity, rollInfo, options);
    }
  }

  /**
   * Find a Midi workflow for the given activity that is waiting for a damage roll
   * Searches by activity UUID first, then by item UUID as fallback
   * @param {Object} MidiQOL - The MidiQOL module
   * @param {Activity} activity - The activity to find a workflow for
   * @returns {Object|null} The workflow if found and waiting for damage, null otherwise
   */
  static _findWorkflowWaitingForDamage(MidiQOL, activity) {
    if (!activity || !MidiQOL?.Workflow?.workflows) {
      LogUtil.log("DnDBIntegration._findWorkflowWaitingForDamage - No activity or workflows", [
        "activity:", activity?.name,
        "hasWorkflows:", !!MidiQOL?.Workflow?.workflows
      ]);
      return null;
    }

    const workflows = MidiQOL.Workflow.workflows;
    const itemUuid = activity.item?.uuid;
    LogUtil.log("DnDBIntegration._findWorkflowWaitingForDamage - Searching workflows", [
      "activityUuid:", activity.uuid,
      "itemUuid:", itemUuid,
      "workflowCount:", workflows.size
    ]);

    for (const [key, workflowRef] of workflows.entries()) {
      const workflow = workflowRef instanceof WeakRef ? workflowRef.deref() : workflowRef;
      if (!workflow) continue;

      const matchesActivity = workflow.activity?.uuid === activity.uuid;
      const matchesItem = workflow.item?.uuid === itemUuid;

      LogUtil.log("DnDBIntegration._findWorkflowWaitingForDamage - Checking workflow", [
        workflow.id,
        "workflowActivityUuid:", workflow.activity?.uuid,
        "workflowItemUuid:", workflow.item?.uuid,
        "matchesActivity:", matchesActivity,
        "matchesItem:", matchesItem,
        "currentAction:", workflow.currentAction,
        "waitForDamageState:", workflow.WorkflowState_WaitForDamageRoll
      ]);

      if ((matchesActivity || matchesItem) &&
          workflow.currentAction === workflow.WorkflowState_WaitForDamageRoll) {
        LogUtil.log("DnDBIntegration._findWorkflowWaitingForDamage - Found workflow", [
          workflow.id,
          "activity:", workflow.activity?.name,
          "item:", workflow.item?.name,
          "state:", workflow.currentAction
        ]);
        return workflow;
      }
    }

    LogUtil.log("DnDBIntegration._findWorkflowWaitingForDamage - No matching workflow found");
    return null;
  }

  /**
   * Find any recent Midi workflow for the given activity that doesn't have damage yet
   * Used when damage is rolled separately from attack (e.g., bonus made attack hit)
   * Searches by activity UUID first, then by item UUID as fallback
   * @param {Object} MidiQOL - The MidiQOL module
   * @param {Activity} activity - The activity to find a workflow for
   * @returns {Object|null} The most recent workflow for this activity without damage, or null
   */
  static _findRecentWorkflowForItem(MidiQOL, activity) {
    if (!activity || !MidiQOL?.Workflow?.workflows) {
      return null;
    }

    const workflows = MidiQOL.Workflow.workflows;
    const itemUuid = activity.item?.uuid;
    let mostRecentWorkflow = null;

    for (const [key, workflowRef] of workflows.entries()) {
      const workflow = workflowRef instanceof WeakRef ? workflowRef.deref() : workflowRef;
      if (!workflow) continue;

      const hasDamage = workflow.damageRolls?.length > 0 || workflow.damageTotal > 0;
      const matchesActivity = workflow.activity?.uuid === activity.uuid;
      const matchesItem = workflow.item?.uuid === itemUuid;

      if ((matchesActivity || matchesItem) && !hasDamage) {
        mostRecentWorkflow = workflow;
      }
    }

    if (mostRecentWorkflow) {
      LogUtil.log("DnDBIntegration._findRecentWorkflowForItem - Found workflow without damage", [
        mostRecentWorkflow.id,
        "activity:", mostRecentWorkflow.activity?.name,
        "item:", mostRecentWorkflow.item?.name,
        "state:", mostRecentWorkflow.currentAction
      ]);
      return mostRecentWorkflow;
    }

    const chatWorkflow = this._findWorkflowFromRecentChat(MidiQOL, activity);
    return chatWorkflow;
  }

  /**
   * Find a workflow from recent chat messages for the activity's item
   * Used when workflow completed/suspended (e.g., attack missed) but user still rolled damage
   * @param {Object} MidiQOL - The MidiQOL module
   * @param {Activity} activity - The activity to find a workflow for
   * @returns {Object|null} A workflow reconstructed from chat, or null
   */
  static _findWorkflowFromRecentChat(MidiQOL, activity) {
    if (!activity?.item) return null;

    const itemUuid = activity.item.uuid;
    const recentMessages = game.messages.contents.slice(-20).reverse();

    for (const message of recentMessages) {
      const flags = message.flags?.["midi-qol"];
      if (!flags) continue;

      const msgItemUuid = flags.itemUuid;
      if (msgItemUuid !== itemUuid) continue;

      const hasDamageRolls = flags.damageRolls?.length > 0 || flags.damageTotal > 0;
      if (hasDamageRolls) continue;

      LogUtil.log("DnDBIntegration._findWorkflowFromRecentChat - Found candidate message", [
        message.id,
        "itemUuid:", msgItemUuid
      ]);

      const workflow = MidiQOL.Workflow.getWorkflow(message.uuid);
      if (workflow) {
        LogUtil.log("DnDBIntegration._findWorkflowFromRecentChat - Reconstructed workflow from chat", [
          workflow.id,
          "item:", workflow.item?.name,
          "suspended:", workflow.suspended
        ]);
        return workflow;
      }
    }

    return null;
  }

  /**
   * Execute damage within an existing Midi workflow (Case A)
   * @param {Activity} activity - The damage activity
   * @param {Object} rollInfo - Parsed DnDB roll info
   * @param {Object} workflow - The existing Midi workflow
   * @returns {Promise<boolean>} Success status
   */
  static async _executeDamageExistingWorkflow(activity, rollInfo, workflow) {
    this.setPendingRoll(rollInfo);

    const rollConfig = {
      workflow: workflow,
      midiOptions: {
        fastForwardDamage: true,
        isCritical: workflow.isCritical,
        workflowOptions: {
          fastForwardDamage: true,
          autoRollDamage: 'always'
        },
        ...workflow.rollOptions
      }
    };

    const dialogConfig = { configure: false };
    const messageConfig = { create: false };

    try {
      await activity.rollDamage(rollConfig, dialogConfig, messageConfig);
      return true;
    } catch (error) {
      LogUtil.error("DnDBIntegration._executeDamageExistingWorkflow failed", [error]);
      this.clearPendingRoll();
      return false;
    }
  }

  /**
   * Attach damage to a workflow that's not waiting for damage (Case C)
   * Used when damage is rolled after attack completed (e.g., attack missed but user rolled damage anyway)
   * Rolls damage independently (NOT passing workflow) then attaches to the existing workflow
   * @param {Activity} activity - The damage activity
   * @param {Object} rollInfo - Parsed DnDB roll info
   * @param {Object} workflow - The Midi workflow to attach damage to
   * @returns {Promise<boolean>} Success status
   */
  static async _executeDamageAttachToWorkflow(activity, rollInfo, workflow) {
    this.setPendingRoll(rollInfo);

    const isWorkflowCompleted = workflow.currentAction === workflow.WorkflowState_Completed ||
                                 workflow.currentAction === workflow.WorkflowState_RollFinished;

    LogUtil.log("DnDBIntegration._executeDamageAttachToWorkflow - Entry", [
      "workflowId:", workflow.id,
      "isWorkflowCompleted:", isWorkflowCompleted,
      "currentAction:", workflow.currentAction?.name,
      "suspended:", workflow.suspended
    ]);

    const rollConfig = isWorkflowCompleted ? {} : {
      workflow: workflow,
      midiOptions: {
        fastForwardDamage: true,
        isCritical: workflow.isCritical,
        workflowOptions: {
          fastForwardDamage: true
        }
      }
    };

    const dialogConfig = { configure: false };
    const messageConfig = { create: false };

    LogUtil.log("DnDBIntegration._executeDamageAttachToWorkflow - Calling rollDamage", [
      "rollConfig:", rollConfig,
      "dialogConfig:", dialogConfig,
      "messageConfig:", messageConfig
    ]);

    try {
      const rolls = await activity.rollDamage(rollConfig, dialogConfig, messageConfig);
      if (!rolls?.length) {
        LogUtil.warn("DnDBIntegration._executeDamageAttachToWorkflow - No rolls returned");
        this.clearPendingRoll();
        return false;
      }

      LogUtil.log("DnDBIntegration._executeDamageAttachToWorkflow - Got damage rolls", [
        "rollCount:", rolls.length,
        "workflowId:", workflow.id,
        "workflowSuspended:", workflow.suspended
      ]);

      if (typeof workflow.setDamageRolls === 'function') {
        await workflow.setDamageRolls(rolls);
        LogUtil.log("DnDBIntegration._executeDamageAttachToWorkflow - Used setDamageRolls API", [
          "damageTotal:", workflow.damageTotal,
          "hasDamageRollHTML:", !!workflow.damageRollHTML
        ]);
      } else {
        workflow.damageRolls = rolls;
        workflow.damageRoll = rolls[0];
        workflow.damageTotal = rolls.reduce((total, roll) => total + roll.total, 0);
        LogUtil.log("DnDBIntegration._executeDamageAttachToWorkflow - Set damageRolls directly (fallback)");
      }

      await workflow.displayDamageRolls?.();

      return true;
    } catch (error) {
      LogUtil.error("DnDBIntegration._executeDamageAttachToWorkflow failed", [error]);
      this.clearPendingRoll();
      return false;
    }
  }

  /**
   * Execute damage with a new Midi workflow (no existing attack workflow)
   * Used for save spells and other damage-only activities
   * For spells with templates, prompts the user to place the template first
   * @param {Actor} actor - The Foundry actor
   * @param {Activity} activity - The damage activity
   * @param {Object} rollInfo - Parsed DnDB roll info
   * @param {Object} options - Additional options
   * @returns {Promise<boolean>} Success status
   */
  static async _executeDamageNewWorkflow(actor, activity, rollInfo, options = {}) {
    const MidiQOL = ModuleHelpers.getMidiQOL();

    this.setPendingRoll(rollInfo);

    const hasTemplate = activity.target?.template?.type;
    LogUtil.log("DnDBIntegration._executeDamageNewWorkflow", [
      "activity:", activity.name,
      "hasTemplate:", hasTemplate,
      "templateType:", activity.target?.template?.type
    ]);

    const consumeSpellSlot = !DnDBRollExecutor.shouldSkipSpellSlotConsumption();
    const usageConfig = {
      consume: { resources: true, spellSlot: consumeSpellSlot },
      create: { measuredTemplate: !!hasTemplate, _isDnDBRoll: true },
      midiOptions: {
        fastForwardAttack: true,
        fastForwardDamage: true,
        autoRollDamage: 'always',
        workflowOptions: {
          fastForwardAttack: true,
          fastForwardDamage: true,
          autoRollDamage: 'always'
        }
      }
    };

    const dialogConfig = { configure: false };
    const messageConfig = {
      create: true,
      data: {
        flags: {
          [MODULE_ID]: {
            isDnDBRoll: true,
            ddbCharacterId: rollInfo.characterId,
            ddbSource: rollInfo.source
          }
        }
      }
    };

    try {
      await MidiQOL.completeActivityUse(activity, usageConfig, dialogConfig, messageConfig);
      return true;
    } catch (error) {
      LogUtil.error("DnDBIntegration._executeDamageNewWorkflow failed", [error]);
      this.clearPendingRoll();
      return false;
    }
  }

  /**
   * Execute healing through Midi-QOL workflow with DnDB dice values
   * Similar to damage workflow but for heal activities
   * @param {Actor} actor - The Foundry actor
   * @param {Activity} activity - The heal activity
   * @param {Object} rollInfo - Parsed DnDB roll info
   * @returns {Promise<boolean>} Success status
   */
  static async executeHealingWithMidi(actor, activity, rollInfo) {
    const MidiQOL = ModuleHelpers.getMidiQOL();
    if (!MidiQOL) {
      LogUtil.warn("DnDBIntegration: MidiQOL not available for healing");
      return false;
    }

    this.setPendingRoll(rollInfo);

    LogUtil.log("DnDBIntegration.executeHealingWithMidi", [
      "activity:", activity.name,
      "item:", activity.item?.name
    ]);

    const consumeSpellSlot = !DnDBRollExecutor.shouldSkipSpellSlotConsumption();
    const usageConfig = {
      consume: { resources: true, spellSlot: consumeSpellSlot },
      midiOptions: {
        fastForwardAttack: true,
        fastForwardDamage: true,
        autoRollDamage: 'always',
        workflowOptions: {
          fastForwardAttack: true,
          fastForwardDamage: true,
          autoRollDamage: 'always'
        }
      }
    };

    const dialogConfig = { configure: false };
    const messageConfig = {
      create: true,
      data: {
        flags: {
          [MODULE_ID]: {
            isDnDBRoll: true,
            ddbCharacterId: rollInfo.characterId,
            ddbSource: rollInfo.source
          }
        }
      }
    };

    try {
      await MidiQOL.completeActivityUse(activity, usageConfig, dialogConfig, messageConfig);
      return true;
    } catch (error) {
      LogUtil.error("DnDBIntegration.executeHealingWithMidi failed", [error]);
      this.clearPendingRoll();
      return false;
    }
  }
}
