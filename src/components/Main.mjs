import { getSettings } from "../constants/Settings.mjs";
import { MODULE_ID, ROLL_TYPES, SOCKET_CALLS } from "../constants/General.mjs";
import { SocketUtil } from "./SocketUtil.mjs";
import { ActivityUtil } from "./ActivityUtil.mjs";
import { DiceConfigUtil } from "./DiceConfigUtil.mjs";
import { getRollTypeDisplay, showBatchedNotifications, applyTargetTokens } from "./Helpers.mjs";
import { HooksUtil } from "./HooksUtil.mjs";
import { SettingsUtil } from "./SettingsUtil.mjs";

/**
 * Main class handling core module initialization and setup
 * Manages module lifecycle, hooks, and core functionality
 */
export class Main {
  // Batch notification system for player-side
  static pendingNotifications = [];
  static notificationTimer = null;
  static NOTIFICATION_BATCH_DELAY = 500; // ms to wait for additional notifications
  
  /**
   * Initialize the module and set up core hooks
   * @static
   */
  static init(){
    // Initialize socket utility
    SocketUtil.initialize(Main.registerSocketCalls);
    
    // Initialize hooks utility
    HooksUtil.initialize();
  }



  // Wrapper methods for socket calls to DiceConfigUtil
  static getDiceConfig() {
    return DiceConfigUtil.getDiceConfig();
  }
  
  static receiveDiceConfig(userId, diceConfig) {
    DiceConfigUtil.receiveDiceConfig(userId, diceConfig);
  }

  /**
   * Handle roll request from GM on player side
   * @param {Object} requestData - The roll request data
   */
  static async handleRollRequest(requestData) {
    // Only handle on player side
    if (game.user.isGM) return;
    
    
    // Get the actor
    const actor = game.actors.get(requestData.actorId);
    if (!actor) {
      return;
    }
    
    // Check if the user owns this actor
    if (!actor.isOwner) {
      return;
    }
    
    // Apply GM targets if configured
    if (requestData.preserveTargets && 
        requestData.targetTokenIds?.length > 0 && 
        game.user.targets.size === 0) {
      applyTargetTokens(requestData.targetTokenIds);
    }
    
    // Add to pending notifications for batching
    Main.pendingNotifications.push({
      actor: actor.name,
      rollType: requestData.rollType,
      rollKey: requestData.rollKey,
      gm: requestData.config.requestedBy || 'GM'
    });
    
    // Clear existing timer and set new one
    if (Main.notificationTimer) {
      clearTimeout(Main.notificationTimer);
    }
    
    Main.notificationTimer = setTimeout(() => {
      showBatchedNotifications(Main.pendingNotifications);
      Main.pendingNotifications = [];
      Main.notificationTimer = null;
    }, Main.NOTIFICATION_BATCH_DELAY);
    
    // Execute the requested roll
    Main._executeRequestedRoll(actor, requestData);
  }

  
  /**
   * Execute a roll based on the request data
   * @param {Actor} actor 
   * @param {Object} requestData 
   */
  static async _executeRequestedRoll(actor, requestData) {
    try {
      const rollConfig = {
        advantage: requestData.config.advantage || false,
        disadvantage: requestData.config.disadvantage || false,
        isRollRequest: true, // Custom flag to prevent re-interception
        target: requestData.config.target, // DC value
        // Don't pass a fake event object - it causes issues with D&D5e's event handling
        _isRequestedRoll: true, // Internal flag to identify requested rolls
        _requestedBy: requestData.config.requestedBy || 'GM' // Who requested the roll
      };
      
      
      // Add situational bonus if provided
      if (requestData.config.situational) {
        rollConfig.bonus = requestData.config.situational;
      }
      
      // Add ability for skills/tools if provided
      if (requestData.config.ability && [ROLL_TYPES.SKILL, ROLL_TYPES.TOOL].includes(requestData.rollType)) {
        rollConfig.ability = requestData.config.ability;
      }
      
      // Dialog configuration (second parameter)
      const dialogConfig = {
        configure: !requestData.skipDialog,
        options: {
          defaultButton: requestData.config.advantage ? 'advantage' : 
                         requestData.config.disadvantage ? 'disadvantage' : 'normal',
          // Add dialog window configuration
          window: {
            title: requestData.config.rollTitle || getRollTypeDisplay(requestData.rollType, requestData.rollKey),
            subtitle: actor.name
          }
        }
      };
      
      
      // Message configuration (third parameter)
      const messageConfig = {
        rollMode: requestData.config.rollMode || game.settings.get("core", "rollMode"),
        create: requestData.config.chatMessage !== false
      };

      
      switch (requestData.rollType) {
        case ROLL_TYPES.ABILITY:
          // For ability checks, use the same structure as skills which works
          const abilityCheckConfig = {
            ability: requestData.rollKey,
            advantage: requestData.config.advantage || false,
            disadvantage: requestData.config.disadvantage || false,
            target: requestData.config.target,
            isRollRequest: true,
            _isRequestedRoll: true,
            _requestedBy: requestData.config.requestedBy || 'GM'
          };
          
          // Add situational bonus if provided
          // For ability checks, D&D5e expects rolls configuration
          if (requestData.config.situational) {
            abilityCheckConfig.rolls = [{
              parts: [],  // Don't add @situational to parts - let the dialog handle it
              data: { situational: requestData.config.situational },
              options: {},
              situational: requestData.config.situational // Pre-populate the field
            }];
          }
          
          await actor.rollAbilityCheck(abilityCheckConfig, dialogConfig, messageConfig);
          break;
        case ROLL_TYPES.SAVE:
          // For saving throws, use the same structure as skills which works
          const saveConfig = {
            ability: requestData.rollKey,
            advantage: requestData.config.advantage || false,
            disadvantage: requestData.config.disadvantage || false,
            target: requestData.config.target,
            isRollRequest: true,
            _isRequestedRoll: true,
            _requestedBy: requestData.config.requestedBy || 'GM'
          };
          
          // Add situational bonus if provided
          // For saving throws, D&D5e expects rolls configuration
          if (requestData.config.situational) {
            saveConfig.rolls = [{
              parts: [],  // Don't add @situational to parts - let the dialog handle it
              data: { situational: requestData.config.situational },
              options: {},
              situational: requestData.config.situational // Pre-populate the field
            }];
          }
          
          await actor.rollSavingThrow(saveConfig, dialogConfig, messageConfig);
          break;
        case ROLL_TYPES.SKILL:
          // For skills, pass configuration object with skill property
          const skillConfig = { 
            ...rollConfig,
            skill: requestData.rollKey, // Add the skill key to the config
            chooseAbility: true // Allow ability selection in dialog
          };
          if (requestData.config.ability) {
            skillConfig.ability = requestData.config.ability;
          }
          
          
          await actor.rollSkill(skillConfig, dialogConfig, messageConfig);
          break;
        case ROLL_TYPES.TOOL:
          // For tools, pass configuration object with tool property
          const toolConfig = { 
            ...rollConfig,
            tool: requestData.rollKey, // Add the tool key to the config
            chooseAbility: true // Allow ability selection in dialog
          };
          if (requestData.config.ability) {
            toolConfig.ability = requestData.config.ability;
          }
          await actor.rollToolCheck(toolConfig, dialogConfig, messageConfig);
          break;
        case ROLL_TYPES.CONCENTRATION:
          // Add situational bonus if provided - concentration uses same format as ability checks
          if (requestData.config.situational) {
            rollConfig.rolls = [{
              parts: [],  // Don't add @situational to parts - let the dialog handle it
              data: { situational: requestData.config.situational },
              options: {},
              situational: requestData.config.situational // Pre-populate the field
            }];
          }
          await actor.rollConcentration(rollConfig, dialogConfig, messageConfig);
          break;
        case ROLL_TYPES.ATTACK:
          if (requestData.rollKey) {
            // Activities might need different handling
            await ActivityUtil.executeActivityRoll(actor, ROLL_TYPES.ATTACK, requestData.rollKey, requestData.activityId, {
              ...rollConfig,
              dialog: dialogConfig,
              message: messageConfig
            });
          }
          break;
        case ROLL_TYPES.DAMAGE:
          if (requestData.rollKey) {
            await ActivityUtil.executeActivityRoll(actor, ROLL_TYPES.DAMAGE, requestData.rollKey, requestData.activityId, {
              ...rollConfig,
              dialog: dialogConfig,
              message: messageConfig
            });
          }
          break;
        case ROLL_TYPES.ITEM_SAVE:
          if (requestData.rollKey) {
            await ActivityUtil.executeActivityRoll(actor, ROLL_TYPES.ITEM_SAVE, requestData.rollKey, requestData.activityId, {
              ...rollConfig,
              dialog: dialogConfig,
              message: messageConfig
            });
          }
          break;
        case ROLL_TYPES.INITIATIVE:
          // Initiative rolls require an active combat
          if (!game.combat) {
            ui.notifications.warn(game.i18n.localize("COMBAT.NoneActive"));
            break;
          }
          // Add situational bonus if provided - initiative uses same format as ability checks
          if (requestData.config.situational) {
            rollConfig.rolls = [{
              parts: [],  // Don't add @situational to parts - let the dialog handle it
              data: { situational: requestData.config.situational },
              options: {},
              situational: requestData.config.situational // Pre-populate the field
            }];
          }
          await actor.rollInitiativeDialog(rollConfig, dialogConfig, messageConfig);
          break;
        case ROLL_TYPES.DEATH_SAVE:
          await actor.rollDeathSave(rollConfig, dialogConfig, messageConfig);
          break;
        case ROLL_TYPES.HIT_DIE:
          rollConfig.denomination = requestData.rollKey;
          await actor.rollHitDie(rollConfig, dialogConfig, messageConfig);
          break;
        case ROLL_TYPES.CUSTOM:
          // For custom rolls, show dialog with readonly formula
          await Main._handleCustomRoll(actor, requestData);
          break;
      }
    } catch (error) {
      ui.notifications.error(game.i18n.localize('CRLNGN_ROLL_REQUESTS.notifications.rollError'));
    }
  }

  /**
   * Handle custom roll request
   * @param {Actor} actor 
   * @param {Object} requestData 
   */
  static async _handleCustomRoll(actor, requestData) {
    const formula = requestData.rollKey; // Formula is stored in rollKey
    
    // Render the template with readonly formula
    const content = await renderTemplate(`modules/${MODULE_ID}/templates/custom-roll-dialog.hbs`, {
      formula: formula,
      readonly: true
    });
    
    const dialog = new Dialog({
      title: game.i18n.localize("CRLNGN_ROLLS.ui.dialogs.customRollTitle"),
      content,
      buttons: {
        roll: {
          icon: '<i class="fas fa-dice-d20"></i>',
          label: game.i18n.localize("Roll"),
          callback: async () => {
            try {
              // Create and evaluate the roll
              const roll = new Roll(formula, actor.getRollData());
              await roll.evaluate({async: true});
              
              // Post to chat
              await roll.toMessage({
                speaker: ChatMessage.getSpeaker({actor}),
                flavor: game.i18n.localize(`CRLNGN_ROLLS.rollTypes.${ROLL_TYPES.CUSTOM}`)
              });
            } catch (error) {
              ui.notifications.error(game.i18n.format("CRLNGN_ROLLS.ui.notifications.invalidFormula", {formula}));
            }
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: game.i18n.localize("Cancel")
        }
      },
      default: "roll"
    }, {
      classes: ["crlngn-rolls-dialog", "crlngn-custom-roll-dialog"]
    });
    
    dialog.render(true);
  }

  /**
   * Register methods with socketlib for remote execution
   */
  static registerSocketCalls() {
    SocketUtil.registerCall(SOCKET_CALLS.getDiceConfig, Main.getDiceConfig);
    SocketUtil.registerCall(SOCKET_CALLS.receiveDiceConfig, Main.receiveDiceConfig);
    SocketUtil.registerCall(SOCKET_CALLS.handleRollRequest, Main.handleRollRequest);
  }
}
