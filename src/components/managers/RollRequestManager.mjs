import { MODULE_ID, ROLL_TYPES, FLASH_ROLL_MODES } from "../../constants/General.mjs";
import { getRollTypeDisplay, applyTargetTokens, NotificationManager, getConsumptionConfig, getCreateConfig, getConcentrationConfig, showConsumptionConfig } from "../helpers/Helpers.mjs";
import { RollHandlers } from "../handlers/RollHandlers.mjs";
import { LogUtil } from "../utils/LogUtil.mjs";
import { getSettings } from "../../constants/Settings.mjs";
import { SettingsUtil } from "../utils/SettingsUtil.mjs";
import { GeneralUtil } from "../utils/GeneralUtil.mjs";
import { RollHelpers } from "../helpers/RollHelpers.mjs";
import { DiceConfigUtil } from "../utils/DiceConfigUtil.mjs";
import { ModuleHelpers } from "../helpers/ModuleHelpers.mjs";
import { ChatMessageManager } from "./ChatMessageManager.mjs";

/**
 * @typedef {Object} RollRequestData
 * @property {string} type - "rollRequest"
 * @property {string} requestId - Unique identifier for this request
 * @property {string} actorId - ID of the actor to roll for
 * @property {string} rollType - Type of roll (ability, save, skill, etc.) from ROLL_TYPES
 * @property {string} rollKey - Specific roll key (e.g., "str", "acr", "perception")
 * @property {string|null} activityId - Activity ID for item-based rolls
 * @property {BasicRollProcessConfiguration} rollProcessConfig - D&D5e roll process configuration
 * @property {boolean} skipRollDialog - Whether to skip the roll configuration dialog
 * @property {string[]} targetTokenIds - Array of targeted token IDs
 * @property {boolean} preserveTargets - Whether to apply GM's targets to the player
 */

/**
 * Handles roll requests from GM to players
 */
export class RollRequestManager {
  /**
   * Queue for managing roll requests per user
   * @type {Array<{actor: Actor, requestData: RollRequestData}>}
   */
  static rollQueue = [];

  /**
   * Flag indicating if a roll dialog is currently active
   * @type {boolean}
   */
  static isProcessingRoll = false;

  /**
   * Resolver function for the current pending roll
   * @type {Function|null}
   */
  static pendingRollResolver = null;

  /**
   * Actor ID for the current pending roll
   * @type {string|null}
   */
  static pendingRollActorId = null;

  /**
   * Map of pending auto-roll timeouts by actor unique ID
   * @type {Map<string, {timeoutId: number, requestData: RollRequestData}>}
   */
  static pendingAutoRollTimeouts = new Map();

  /**
   * Set of actor unique IDs that have been auto-rolled (timeout fired)
   * Used to prevent duplicate rolls when original dialog is closed
   * @type {Set<string>}
   */
  static autoRolledActors = new Set();

  /**
   * Handle activity-use request from GM on player side
   * Resolves the activity by UUID and calls activity.use() locally so the
   * player consumes resources, applies effects, and rolls any formula.
   * @param {Object} requestData
   * @param {string} requestData.actorId - Actor ID for permission check / fallback resolution
   * @param {string} requestData.activityUuid - UUID of the activity to use
   * @param {Object} requestData.usage - Activity usage configuration (cleaned of circular refs)
   * @param {Object} [requestData.dialog] - Dialog configuration
   * @param {Object} [requestData.message] - Message configuration
   */
  static async handleActivityUseRequest(requestData) {
    LogUtil.log('handleActivityUseRequest', [requestData]);
    if (game.user.isGM) return;

    const activity = await fromUuid(requestData.activityUuid);
    if (!activity) {
      LogUtil.warn('handleActivityUseRequest - activity not found', [requestData.activityUuid]);
      return;
    }
    if (!activity.actor?.isOwner) {
      LogUtil.warn('handleActivityUseRequest - actor not owned by this user', [activity.actor?.name]);
      return;
    }

    const usage = {
      ...(requestData.usage ?? {}),
      _isFlashRollRequest: true,
      isRollRequest: true
    };
    const dialog = requestData.dialog ?? {};
    const message = requestData.message ?? {};

    NotificationManager.notify('info', game.i18n.format('FLASH_ROLLS.notifications.rollRequestSent', {
      player: requestData.requestedBy || 'GM',
      actor: activity.actor.name || 'Unknown'
    }));

    try {
      await activity.use(usage, dialog, message);
    } catch (error) {
      LogUtil.error('handleActivityUseRequest - activity.use error', [error]);
    }
  }

  /**
   * Handle roll request from GM on player side
   * @param {RollRequestData} requestData - The roll request data
   */
  static async handleRequest(requestData) {
    const isMidiRequest = GeneralUtil.isModuleOn('midi-qol');
    LogUtil.log('handleRequest', [requestData]);
    if (game.user.isGM) return;
    
    let actor;
    if (requestData.isTokenActor) {
      const tokenDoc = game.scenes.active?.tokens.get(requestData.actorId);
      actor = tokenDoc?.actor;
      if (!actor) {
        LogUtil.warn('Token actor not found:', requestData.actorId);
        return;
      }
    } else {
      actor = game.actors.get(requestData.actorId);
    }
    
    if (!actor || !actor.isOwner) {
      return;
    }
    
    if (requestData.preserveTargets && 
      requestData.targetTokenIds?.length > 0 
      // && game.user.targets.size === 0
    ) {
      LogUtil.log('handleRequest - applyTargetTokens', [requestData]);
      applyTargetTokens(requestData.targetTokenIds);
    }

    if(isMidiRequest && requestData.rollProcessConfig.midiOptions){
      requestData.rollProcessConfig.midiOptions = {
        ...requestData.rollProcessConfig.midiOptions,
        fastForward: false,
        fastForwardAttack: false,
        // autoRollDamage: 'onHit',
        dialogOptions: {
          ...requestData.rollProcessConfig.midiOptions.dialogOptions,
          fastForward: false,
          fastForwardAttack: false,
        },
        workflowOptions: {
          ...requestData.rollProcessConfig.midiOptions.workflowOptions,
          fastForward: false,
          fastForwardAttack: false,
        }
      };
    }
    
    NotificationManager.notify('info', '', {
      batch: true,
      batchData: {
        actor: actor.name,
        rollType: requestData.rollType,
        rollKey: requestData.rollKey,
        gm: requestData.rollProcessConfig._requestedBy || 'GM'
      }
    });
    
    this.rollQueue.push({ actor, requestData });

    if (!this.isProcessingRoll) {
      this.isProcessingRoll = true;
      this.processNextRoll();
    }
  }
  
  /**
   * Process the next roll in the queue to be executed on the player side
   */
  static async processNextRoll() {
    LogUtil.log('processNextRoll - called', [this.rollQueue.length, 'in queue', this.isProcessingRoll]);

    if (this.rollQueue.length === 0) {
      this.isProcessingRoll = false;
      LogUtil.log('processNextRoll - queue empty, stopping');
      return;
    }

    const { actor, requestData } = this.rollQueue.shift();

    LogUtil.log('processNextRoll - Processing', [actor.name, requestData.rollType, this.rollQueue.length, 'remaining']);

    const normalizedRollType = requestData.rollType?.toLowerCase();
    const isNoWaitRoll = normalizedRollType === ROLL_TYPES.DAMAGE ||
                         normalizedRollType === ROLL_TYPES.ATTACK ||
                         normalizedRollType === ROLL_TYPES.ITEM;

    if (isNoWaitRoll) {
      this.executePlayerRollRequest(actor, requestData).catch(error => {
        LogUtil.error('Error processing roll request:', [error]);
      });
      this.processNextRoll();
      return;
    }

    try {
      await this.executePlayerRollRequest(actor, requestData);
    } catch (error) {
      LogUtil.error('Error processing roll request:', [error]);
    }

    this.processNextRoll();
  }

  /**
   * Called when a roll message is created to signal roll completion
   * @param {string} [actorUniqueId] - Optional actor unique ID to cancel auto-roll timeout
   */
  static onRollCompleted(actorUniqueId) {
    if (this.pendingRollResolver) {
      this.pendingRollResolver();
      this.pendingRollResolver = null;
      this.pendingRollActorId = null;
    }
    if (actorUniqueId) {
      this.cancelAutoRollTimeout(actorUniqueId);
    }
  }
  
  /**
   * Execute a roll request received by a player
   * @param {Actor} actor - The actor performing the roll
   * @param {RollRequestData} requestData - The roll request data from GM
   */
  static async executePlayerRollRequest(actor, requestData) {
    const SETTINGS = getSettings();
    const publicPlayerRolls = SettingsUtil.get(SETTINGS.publicPlayerRolls.tag);

    try {
      const normalizedRollType = requestData.rollType?.toLowerCase();
      LogUtil.log('executePlayerRollRequest - normalized roll type', [normalizedRollType]);

      const showRequestPrompt = SettingsUtil.get(SETTINGS.showRequestPrompt.tag);
      const isActivityRoll = [ROLL_TYPES.ATTACK, ROLL_TYPES.DAMAGE, ROLL_TYPES.ITEM].includes(normalizedRollType);

      if (!showRequestPrompt && !game.user.isGM) {
        if (isActivityRoll && !GeneralUtil.isModuleOn('midi-qol')) {
          LogUtil.log('executePlayerRollRequest - Activity roll with showRequestPrompt disabled, showing item card only', [actor.name, normalizedRollType]);
          await this.showItemCardOnly(actor, requestData);
          return;
        }

        if (!isActivityRoll) {
          LogUtil.log('executePlayerRollRequest - Skipping prompt (showRequestPrompt disabled)', [actor.name]);
          if (requestData.groupRollId) {
            const mapKey = actor.isToken ? (actor.token?.id || actor.id) : actor.id;
            ChatMessageManager.setTempGroupRollId(mapKey, requestData.groupRollId);
            if (actor.isToken && actor.actor) {
              ChatMessageManager.setTempGroupRollId(actor.actor.id, requestData.groupRollId);
            }
            LogUtil.log('executePlayerRollRequest - Set tempGroupRollId for manual roll interception', [requestData.groupRollId, actor.name]);
          }

          const actorUniqueId = requestData.isTokenActor ? requestData.actorId : actor.id;
          const timeoutSeconds = this.getMidiPlayerSaveTimeout();
          const hasWorkflow = requestData.fromMidiWorkflow || requestData.rollProcessConfig?.midiOptions?.workflowId;
          if (normalizedRollType === ROLL_TYPES.SAVE && timeoutSeconds > 0 && hasWorkflow) {
            LogUtil.log('executePlayerRollRequest - Setting up auto-roll for showRequestPrompt disabled', [actor.name, timeoutSeconds]);
            const rollConfig = requestData.rollProcessConfig.rolls?.[0] || { parts: [], data: {}, options: {} };
            const rollModeFromGM = requestData.rollProcessConfig.rollMode;
            const defaultRollMode = game.settings.get("core", "rollMode");
            const finalRollMode = (!rollModeFromGM || rollModeFromGM === FLASH_ROLL_MODES.PLAYER_CHOICE)
              ? defaultRollMode
              : rollModeFromGM;
            const rollMetadata = {
              [MODULE_ID]: {
                isFlashRollRequest: true,
                rollType: requestData.rollType,
                rollKey: requestData.rollKey,
                actorUniqueId: actorUniqueId,
                fromMidiWorkflow: requestData.fromMidiWorkflow || false
              }
            };
            const speaker = ChatMessage.getSpeaker({ actor });
            const messageConfig = {
              rollMode: finalRollMode,
              create: requestData.rollProcessConfig.chatMessage !== false,
              flags: rollMetadata,
              data: { speaker },
              messageData: { speaker, flags: rollMetadata }
            };
            const handlerRequestData = {
              rollKey: requestData.rollKey,
              activityId: requestData.activityId,
              config: requestData.rollProcessConfig,
              groupRollId: requestData.groupRollId
            };
            this.setupAutoRollTimeout(actor, requestData, actorUniqueId, handlerRequestData, rollConfig, messageConfig);
          }
          return;
        }
      }

      const rollConfig = requestData.rollProcessConfig.rolls?.[0] || {
        parts: [],
        data: {},
        options: {}
      };

      const skipToRollResolver = SettingsUtil.get(SETTINGS.skipToRollResolver.tag);
      const hasNonDigitalDice = skipToRollResolver && DiceConfigUtil.hasNonDigitalDice();

      const dialogConfig = {
        configure: showRequestPrompt ? !hasNonDigitalDice : false
      };

      const rollModeFromGM = requestData.rollProcessConfig.rollMode;
      const defaultRollMode = game.settings.get("core", "rollMode");
      const finalRollMode = (!rollModeFromGM || rollModeFromGM === FLASH_ROLL_MODES.PLAYER_CHOICE)
        ? defaultRollMode
        : rollModeFromGM;

      const actorUniqueId = requestData.isTokenActor ? requestData.actorId : actor.id;
      const rollMetadata = {
        [MODULE_ID]: {
          isFlashRollRequest: true,
          rollType: requestData.rollType,
          rollKey: requestData.rollKey,
          actorUniqueId: actorUniqueId,
          fromMidiWorkflow: requestData.fromMidiWorkflow || false
        }
      };

      const speaker = ChatMessage.getSpeaker({ actor });
      const messageConfig = {
        rollMode: finalRollMode,
        create: requestData.rollProcessConfig.chatMessage !== false,
        flags: rollMetadata,
        data: {
          speaker
        },
        messageData: {
          speaker,
          flags: rollMetadata
        }
      };

      const handlerRequestData = {
        rollKey: requestData.rollKey,
        activityId: requestData.activityId,
        config: requestData.rollProcessConfig,
        groupRollId: requestData.groupRollId
      };

      const handler = RollHandlers[normalizedRollType];

      if (handler) {
        LogUtil.log('executePlayerRollRequest - calling handler', [normalizedRollType, 'dialogConfig.configure:', dialogConfig.configure]);
        this.setupAutoRollTimeout(actor, requestData, actorUniqueId, handlerRequestData, rollConfig, messageConfig);
        await handler(actor, handlerRequestData, rollConfig, dialogConfig, messageConfig);
        this.cancelAutoRollTimeout(actorUniqueId);
        LogUtil.log('executePlayerRollRequest - handler completed', [normalizedRollType]);
      } else {
        LogUtil.warn(`No handler found for roll type: ${normalizedRollType}`);
        NotificationManager.notify('warn', game.i18n.format('FLASH_ROLLS.notifications.rollError', {
          actor: actor.name || 'Unknown Actor'
        }));
      }
    } catch (error) {
      LogUtil.error('Error executing roll request:', [error]);
      NotificationManager.notify('error', game.i18n.format('FLASH_ROLLS.notifications.rollError', {
        actor: actor.name || 'Unknown Actor'
      }));
    }
  }

  /**
   * Get the midi-qol player save timeout setting in seconds
   * Only returns a value if midi-qol is configured to use Flash Token Bar for saves
   * @returns {number} - The timeout in seconds, or 0 if not applicable
   */
  static getMidiPlayerSaveTimeout() {
    const MidiQOL = ModuleHelpers.getMidiQOL();
    if (!MidiQOL?.currentConfigSettings) {
      LogUtil.log('getMidiPlayerSaveTimeout - no MidiQOL config', [!!MidiQOL]);
      return 0;
    }

    const playerRollSaves = MidiQOL.currentConfigSettings.playerRollSaves;
    const timeout = MidiQOL.currentConfigSettings.playerSaveTimeout;
    LogUtil.log('getMidiPlayerSaveTimeout - midi settings', [playerRollSaves, timeout]);

    if (playerRollSaves !== 'ftb') return 0;

    return timeout || 0;
  }

  /**
   * Set up auto-roll timeout for midi-qol integration
   * If playerSaveTimeout is > 0 and roll is a save, will auto-trigger after timeout
   * @param {Actor} actor - The actor
   * @param {RollRequestData} requestData - The roll request data
   * @param {string} actorUniqueId - Unique identifier for the actor
   * @param {Object} handlerRequestData - Handler request data
   * @param {Object} rollConfig - Roll configuration
   * @param {Object} messageConfig - Message configuration
   */
  static setupAutoRollTimeout(actor, requestData, actorUniqueId, handlerRequestData, rollConfig, messageConfig) {
    const normalizedRollType = requestData.rollType?.toLowerCase();
    LogUtil.log('setupAutoRollTimeout - checking', [normalizedRollType, ROLL_TYPES.SAVE, normalizedRollType === ROLL_TYPES.SAVE]);
    if (normalizedRollType !== ROLL_TYPES.SAVE) return;

    const hasWorkflow = requestData.fromMidiWorkflow || requestData.rollProcessConfig?.midiOptions?.workflowId;
    LogUtil.log('setupAutoRollTimeout - workflow check', [hasWorkflow, requestData.fromMidiWorkflow, requestData.rollProcessConfig?.midiOptions?.workflowId]);
    if (!hasWorkflow) return;

    const timeoutSeconds = this.getMidiPlayerSaveTimeout();
    LogUtil.log('setupAutoRollTimeout - timeout value', [timeoutSeconds]);
    if (timeoutSeconds <= 0) return;

    const handler = RollHandlers[normalizedRollType];
    if (!handler) return;

    LogUtil.log('setupAutoRollTimeout - Setting up auto-roll', [actor.name, timeoutSeconds, 'seconds']);

    const timeoutId = setTimeout(async () => {
      if (!this.pendingAutoRollTimeouts.has(actorUniqueId)) {
        LogUtil.log('setupAutoRollTimeout - Timeout cancelled (roll already completed)', [actor.name]);
        return;
      }

      LogUtil.log('setupAutoRollTimeout - Auto-rolling after timeout', [actor.name, timeoutSeconds]);
      this.pendingAutoRollTimeouts.delete(actorUniqueId);
      this.autoRolledActors.add(actorUniqueId);

      NotificationManager.notify('info', game.i18n.format('FLASH_ROLLS.notifications.autoRollTimeout', {
        actor: actor.name
      }));

      const autoRollDialogConfig = { configure: false };

      try {
        await handler(actor, handlerRequestData, rollConfig, autoRollDialogConfig, messageConfig);
        LogUtil.log('setupAutoRollTimeout - Auto-roll completed', [actor.name]);
      } catch (error) {
        LogUtil.error('setupAutoRollTimeout - Auto-roll error', [error]);
      } finally {
        this.autoRolledActors.delete(actorUniqueId);
      }
    }, timeoutSeconds * 1000);

    this.pendingAutoRollTimeouts.set(actorUniqueId, { timeoutId, requestData });
  }

  /**
   * Cancel pending auto-roll timeout for an actor
   * Called when a roll is completed manually before timeout expires
   * @param {string} actorUniqueId - Unique identifier for the actor
   */
  static cancelAutoRollTimeout(actorUniqueId) {
    const pending = this.pendingAutoRollTimeouts.get(actorUniqueId);
    if (pending) {
      LogUtil.log('cancelAutoRollTimeout - Cancelling timeout', [actorUniqueId]);
      clearTimeout(pending.timeoutId);
      this.pendingAutoRollTimeouts.delete(actorUniqueId);
    }
  }

  /**
   * Check if an actor was auto-rolled due to timeout
   * @param {string} actorUniqueId - Unique identifier for the actor
   * @returns {boolean} - True if the actor was auto-rolled
   */
  static wasAutoRolled(actorUniqueId) {
    return this.autoRolledActors.has(actorUniqueId);
  }

  /**
   * Show item card without executing any rolls
   * Used when showRequestPrompt is disabled for activity rolls
   * @param {Actor} actor - The actor
   * @param {RollRequestData} requestData - The roll request data
   */
  static async showItemCardOnly(actor, requestData) {
    const item = actor.items.get(requestData.rollKey);
    if (!item) {
      LogUtil.warn('showItemCardOnly - Item not found', [requestData.rollKey]);
      return;
    }

    const activity = requestData.activityId
      ? item.system.activities?.get(requestData.activityId)
      : item.system.activities?.contents?.[0];

    if (!activity) {
      LogUtil.warn('showItemCardOnly - Activity not found', [item.name, requestData.activityId]);
      return;
    }

    LogUtil.log('showItemCardOnly - Displaying item card', [item.name, activity.name]);

    const rollProcessConfig = requestData.rollProcessConfig || {};
    const consumeConfig = getConsumptionConfig(rollProcessConfig.consume || {}, false);
    const createConfig = getCreateConfig(rollProcessConfig.create || {}, false);
    const concentrationConfig = getConcentrationConfig(undefined, false);
    const showDialog = showConsumptionConfig();

    const rollModeFromGM = rollProcessConfig.rollMode;
    const resolvedRollMode = (!rollModeFromGM || rollModeFromGM === FLASH_ROLL_MODES.PLAYER_CHOICE)
      ? game.settings.get("core", "rollMode")
      : rollModeFromGM;

    await activity.use({
      consume: consumeConfig,
      create: createConfig,
      concentration: concentrationConfig,
      _isFlashRollRequest: true,
      ...(rollProcessConfig.spell && { spell: rollProcessConfig.spell }),
      ...(rollProcessConfig.scaling !== undefined && { scaling: rollProcessConfig.scaling })
    }, {
      configure: showDialog
    }, {
      create: true,
      rollMode: resolvedRollMode
    });
  }
}