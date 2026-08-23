import { MODULE, ROLL_TYPES } from "../../constants/General.mjs";
import { RollMenuOrchestrator } from "../managers/roll-menu/RollMenuOrchestrator.mjs";
import RollRequestsMenu from "../ui/RollRequestsMenu.mjs";
import { getActorData, getFullRollName } from "../helpers/Helpers.mjs";
import { LogUtil } from "../utils/LogUtil.mjs";
import { SettingsUtil } from "../utils/SettingsUtil.mjs";
import { getSettings } from "../../constants/Settings.mjs";
import { RollHelpers } from "../helpers/RollHelpers.mjs";
import { ChatMessageManager } from "../managers/ChatMessageManager.mjs";
import { ModuleSettingsMenu } from "../ui/dialogs/ModuleSettingsMenu.mjs";
import { PremiumFeaturesDialog } from "../ui/dialogs/PremiumFeaturesDialog.mjs";
import { RollMenuEventManager } from "../managers/roll-menu/RollMenuEventManager.mjs";
import { TokenMovementManager } from "../utils/TokenMovementManager.mjs";
import { RollMenuStateManager } from "../managers/roll-menu/RollMenuStateManager.mjs";
import { SidebarController } from "../managers/SidebarController.mjs";
import { TokenPlacementManager } from "../managers/TokenPlacementManager.mjs";
import { TokenTeleportManager } from "../managers/TokenTeleportManager.mjs";
import { TransformationManager } from "../managers/TransformationManager.mjs";
import { GeneralUtil } from "../utils/GeneralUtil.mjs";

/**
 * Public API for Flash Token Bar 5e that can be used by other modules
 * Accessible via FlashAPI or game.modules.get('flash-rolls-5e').api
 * Legacy access: FlashRolls5e (deprecated, use FlashAPI instead)
 */
export class FlashAPI {
  
  /**
   * Request a roll for specified actors
   * @param {Object} options - Roll request options
   * @param {string} options.requestType - The type of roll request (lowercase from ROLL_TYPES, e.g., 'skill', 'ability', 'savingthrow')
   * @param {string} [options.rollKey=null] - The specific roll key (e.g., 'acr' for Acrobatics, 'str' for Strength)
   * @param {string[]} [options.actorIds=[]] - Array of actor IDs or token IDs to roll for
   * @param {number} [options.dc] - Difficulty Class for the roll
   * @param {string} [options.situationalBonus] - Situational bonus (e.g., '+2', '1d4')
   * @param {boolean} [options.advantage] - Roll with advantage
   * @param {boolean} [options.disadvantage] - Roll with disadvantage
   * @param {string} [options.rollMode] - Roll visibility mode (CONST.DICE_ROLL_MODES: 'publicroll', 'gmroll', 'blindroll', 'selfroll')
   * @param {boolean} [options.skipRollDialog] - Skip the roll dialog
   * @param {boolean} [options.sendAsRequest] - Send to players instead of rolling locally
   * @param {string} [options.groupRollId=null] - Group roll identifier for combining multiple rolls into one message
   * @param {boolean} [options.isContestedRoll=false] - Whether this is part of a contested roll
   * @returns {Promise<void>}
   */
  static async requestRoll(options = {}) {
    try {
      // Validate input parameters
      if (!options || typeof options !== 'object') {
        ui.notifications.error(game.i18n.localize("FLASH_ROLLS.notifications.invalidMacroData"));
        return;
      }

      let { requestType, rollKey = null } = options;
      const { actorIds = [], dc, situationalBonus, advantage, disadvantage, rollMode, skipRollDialog, sendAsRequest = true, groupRollId = null, isContestedRoll = false, workflowId = null } = options;

      if (!requestType) {
        ui.notifications.error(game.i18n.localize("FLASH_ROLLS.notifications.missingRequestType"));
        return;
      }

      const fromMidiWorkflow = !!workflowId;
      const config = { dc, situationalBonus, advantage, disadvantage, rollMode, skipRollDialog, sendAsRequest, groupRollId, isContestedRoll, fromMidiWorkflow, workflowId };

      LogUtil.log('FlashAPI.requestRoll', [requestType, rollKey, actorIds, 'workflowId:', workflowId, 'fromMidiWorkflow:', fromMidiWorkflow, config]);

      const normalized = FlashAPI.normalizeCheckRequest(FlashAPI.resolveRequestTypeAlias(requestType), rollKey, workflowId);
      requestType = normalized.requestType;
      rollKey = normalized.rollKey;

      // Find roll option by either uppercase key or lowercase name
      let rollOption = MODULE.ROLL_REQUEST_OPTIONS[requestType];
      if (!rollOption) {
        // Try finding by lowercase name if not found by key
        const rollRequestOptions = Object.values(MODULE.ROLL_REQUEST_OPTIONS);
        rollOption = rollRequestOptions.find(option => option.name === requestType);
      }

      if (!rollOption) {
        ui.notifications.error(game.i18n.format("FLASH_ROLLS.notifications.unknownRequestType", {
          requestType: requestType
        }));
        return;
      }
      
      const normalizedRequestType = rollOption.name;
      
      if (actorIds.length === 0) {
        FlashAPI.notify('warn', game.i18n.localize("FLASH_ROLLS.notifications.noActorsSelected"));
        return;
      }
      
      // Validate actorIds array
      if (!Array.isArray(actorIds)) {
        ui.notifications.error(game.i18n.localize("FLASH_ROLLS.notifications.invalidActorIdsFormat"));
        return;
      }
      
      // Create actor data array and track invalid IDs
      const invalidActorIds = [];
      const actorsData = [];
      
      for (const uniqueId of actorIds) {
        const actor = getActorData(uniqueId);
        if (!actor) {
          invalidActorIds.push(uniqueId);
          continue;
        }
        
        let tokenId = null;
        if (!game.actors.get(uniqueId)) {
          tokenId = uniqueId;
        }
        
        actorsData.push({
          actor,
          uniqueId,
          tokenId
        });
      }
      
      // Show notification for invalid actors but continue with valid ones
      if (invalidActorIds.length > 0) {
        const invalidIds = invalidActorIds.join(', ');
        FlashAPI.notify('info', game.i18n.format("FLASH_ROLLS.notifications.invalidActorIds", {
          numIds: invalidActorIds.length,
          invalidIds: invalidIds
        }));
      }
      
      if (actorsData.length === 0) {
        ui.notifications.error(game.i18n.localize("FLASH_ROLLS.notifications.noValidActorsSelected"));
        return;
      }
      
      // Create a mock menu object with the necessary properties
      const mockMenu = {
        selectedActors: new Set(actorIds),
        selectedRequestType: requestType,
        isLocked: true,
        close: () => {}
      };

      // Use orchestrator to handle the roll request
      return RollMenuOrchestrator.triggerRoll(normalizedRequestType, rollKey, mockMenu, config);
    } catch (error) {
      LogUtil.error('FlashAPI.requestRoll - Execution error:', [error]);
      ui.notifications.error(game.i18n.localize("FLASH_ROLLS.notifications.macroExecutionFailed"));
      return;
    }
  }
  
  /**
   * Request type aliases accepted from external callers, mapped to the canonical roll request names
   * @type {Object<string, string>}
   */
  static REQUEST_TYPE_ALIASES = {
    [ROLL_TYPES.ABILITY]: ROLL_TYPES.ABILITY_CHECK,
    check: ROLL_TYPES.ABILITY_CHECK,
    [ROLL_TYPES.SAVE]: ROLL_TYPES.SAVING_THROW
  };

  /**
   * Resolve an aliased request type to the canonical roll request name
   * @param {string} requestType - Request type provided by the caller
   * @returns {string} Canonical request type, or the original value when it is not an alias
   */
  static resolveRequestTypeAlias(requestType) {
    return FlashAPI.REQUEST_TYPE_ALIASES[requestType?.toLowerCase()] ?? requestType;
  }

  /**
   * Classify a check identifier as a skill, tool or ability roll type
   * @param {string} key - Identifier coming from a check activity or an external request
   * @returns {string|null} One of ROLL_TYPES.SKILL / ROLL_TYPES.TOOL / ROLL_TYPES.ABILITY_CHECK, or null when unknown
   */
  static classifyCheckKey(key) {
    if (!key) return null;
    if (CONFIG.DND5E?.skills?.[key]) return ROLL_TYPES.SKILL;
    if (CONFIG.DND5E?.tools?.[key] || CONFIG.DND5E?.vehicleTypes?.[key]) return ROLL_TYPES.TOOL;
    if (CONFIG.DND5E?.abilities?.[key]) return ROLL_TYPES.ABILITY_CHECK;
    return null;
  }

  /**
   * Resolve the check activity a Midi-QOL workflow id points at
   * The workflow object only exists on the client that used the item, so this falls back to the item card
   * the id refers to, which is available on every client, and reads the activity from its DnD5e flags
   * @param {string|null} workflowId - Midi-QOL workflow id passed with the request
   * @returns {Activity5e|null} The check activity, or null when it can not be resolved
   */
  static getWorkflowCheckActivity(workflowId) {
    if (!workflowId) return null;

    let activity = null;
    try {
      if (typeof MidiQOL !== 'undefined') {
        activity = MidiQOL.Workflow?.getWorkflow?.(workflowId)?.saveActivity ?? null;
      }

      if (!activity?.check) {
        const referenced = fromUuidSync(workflowId);
        const messageFlags = referenced?.flags?.dnd5e;
        if (messageFlags?.item?.uuid && messageFlags?.activity?.id) {
          const item = fromUuidSync(messageFlags.item.uuid);
          activity = item?.system?.activities?.get(messageFlags.activity.id) ?? null;
        } else {
          activity = referenced ?? null;
        }
      }
    } catch (error) {
      LogUtil.warn('FlashAPI.getWorkflowCheckActivity - unable to resolve activity', [workflowId, error]);
      return null;
    }

    LogUtil.log('FlashAPI.getWorkflowCheckActivity', [workflowId, activity?.item?.name, activity?.type, !!activity?.check]);
    return activity?.check ? activity : null;
  }

  /**
   * Read the check identifiers configured on the check activity behind a Midi-QOL workflow id
   * Falls back to the base item of a tool item when the activity has no associated entries
   * @param {string|null} workflowId - Midi-QOL workflow id passed with the request
   * @returns {string[]} Associated check identifiers, empty when the activity can not be resolved
   */
  static getWorkflowCheckKeys(workflowId) {
    const activity = this.getWorkflowCheckActivity(workflowId);
    if (!activity) return [];

    const associated = Array.from(activity.check.associated ?? []);
    if (associated.length === 0 && activity.item?.type === 'tool') {
      const baseItem = activity.item.system?.type?.baseItem;
      if (baseItem) return [baseItem];
    }
    return associated;
  }

  /**
   * Reconcile the request type and roll key of an incoming skill/tool check request
   * Midi-QOL sends the check activity's ability as rollKey even for skill and tool requests, which makes
   * DnD5e silently downgrade the roll to an ability check with a wrong title and wrong modifiers.
   * Recovers the real skill/tool from the check activity the workflow points at. When that fails the request
   * is left untouched so the client that performs the roll can try again against its own workflow
   * @param {string} requestType - Requested roll type
   * @param {string|null} rollKey - Requested roll key
   * @param {string|null} [workflowId=null] - Midi-QOL workflow id, when the request comes from a workflow
   * @returns {{requestType: string, rollKey: string|null}} Normalized request type and roll key
   */
  static normalizeCheckRequest(requestType, rollKey, workflowId = null) {
    const type = requestType?.toLowerCase();
    if (type !== ROLL_TYPES.SKILL && type !== ROLL_TYPES.TOOL) return { requestType, rollKey };
    if (this.classifyCheckKey(rollKey) === type) return { requestType, rollKey };

    const recovered = this.getWorkflowCheckKeys(workflowId).find(key => this.classifyCheckKey(key) !== null);
    if (recovered) {
      const recoveredType = this.classifyCheckKey(recovered);
      LogUtil.log('FlashAPI.normalizeCheckRequest - recovered check key from workflow', [requestType, rollKey, '->', recoveredType, recovered]);
      return { requestType: recoveredType, rollKey: recovered };
    }

    LogUtil.warn('FlashAPI.normalizeCheckRequest - could not resolve the check key, leaving it for the rolling client', [requestType, rollKey, workflowId]);
    return { requestType, rollKey };
  }

  /**
   * Get list of available roll types
   * @returns {Object} Available roll request options with name and label only
   */
  static getAvailableRollTypes() {
    const cleanedOptions = {};
    
    for (const [key, option] of Object.entries(MODULE.ROLL_REQUEST_OPTIONS)) {
      cleanedOptions[key] = {
        name: option.name,
        label: option.label
      };
    }
    
    return cleanedOptions;
  }
  
  /**
   * Get currently selected actors from the roll requests menu
   * @param {boolean} tokenOnly - If true, only return token IDs (filters out actors without tokens on canvas)
   * @returns {string[]} Array of selected actor/token IDs
   */
  static getSelectedActors(tokenOnly = false) {
    const menu = RollRequestsMenu.getInstance();
    if (menu && menu.selectedActors) {
      const selectedIds = Array.from(menu.selectedActors);

      if (!tokenOnly) {
        return selectedIds;
      }

      return selectedIds.map(uniqueId => {
        const token = canvas.tokens.placeables.find(t => t.id === uniqueId);
        if (token) {
          return token.id;
        }
        const actor = game.actors.get(uniqueId);
        if (actor) {
          const actorToken = canvas.tokens.placeables.find(t => t.actor?.id === actor.id);
          if (actorToken) {
            return actorToken.id;
          }
        }
        return null;
      }).filter(id => id !== null);
    }
    return [];
  }
  
  /**
   * Check if the roll requests menu is currently open
   * @returns {boolean} True if menu is rendered and visible
   */
  static isMenuOpen() {
    const menu = RollRequestsMenu.getInstance();
    return menu && menu.rendered;
  }
  
  /**
   * Create a macro for a specific roll type and configuration
   * @param {Object} macroData - Macro configuration data
   * @param {string} macroData.requestType - The type of roll request
   * @param {string} macroData.rollKey - The specific roll key (null for non-nested rolls)
   * @param {string[]} macroData.actorIds - Array of actor IDs to include in macro
   * @param {Object} macroData.config - Roll configuration
   * @returns {Promise<Macro>} Created macro document
   */
  static async createMacro(macroData) {
    const SETTINGS = getSettings();
    const addMacrosToFolder = SettingsUtil.get(SETTINGS.addMacrosToFolder.tag);
    
    LogUtil.log('FlashAPI.createMacro', [macroData]);
    
    const { requestType, rollKey = null, actorIds = [], config = {} } = macroData;
    
    let rollOption = MODULE.ROLL_REQUEST_OPTIONS[requestType];
    if (!rollOption) {
      const rollRequestOptions = Object.values(MODULE.ROLL_REQUEST_OPTIONS);
      rollOption = rollRequestOptions.find(option => option.name === requestType);
    }
    if (!rollOption) {
      FlashAPI.notify('warn', `Unknown request type: ${requestType}`);
      return;
    }
    
    // Generate macro name using label property
    let macroName = rollOption.label;
    LogUtil.log('FlashAPI.createMacro', [macroName, rollOption.subList]);
    if (rollKey && rollOption.subList && Array.isArray(rollOption.subList)) {
      const subItem = rollOption.subList.find(item => item.id === rollKey);
      if (subItem) {
        macroName = subItem.name;
      }
    } else if (rollKey) {
      const fullName = getFullRollName(rollOption.name, rollKey);
      macroName = fullName;
    }
    
    const requestOptions = {
      requestType: rollOption.name,
      ...(rollKey && { rollKey }),
      ...(actorIds.length > 0 && { actorIds }),
      ...config
    };
    
    if (requestOptions.advantage === undefined) requestOptions.advantage = false;
    if (requestOptions.disadvantage === undefined) requestOptions.disadvantage = false;
    
    const command = `// Flash Token Bar: ${macroName} - ${rollKey || ''}
    try {
      FlashAPI.requestRoll(${JSON.stringify(requestOptions, null, 2)});
    } catch (error) {
      ui.notifications.error(game.i18n.localize("FLASH_ROLLS.notifications.macroDataMalformed"));
    }`;
    let folderId = null;
    if (addMacrosToFolder) {
      folderId = await this._ensureFlashRollsFolder();
    }

    // Create the macro
    const macroDocumentData = {
      name: `Flash Token Bar: ${macroName}`,
      type: "script",
      command: command,
      img: "modules/flash-rolls-5e/assets/bolt-circle.svg",
      ...(folderId && { folder: folderId }),
      flags: {
        "flash-rolls-5e": {
          requestType,
          rollKey,
          actorIds,
          config
        }
      }
    };
    
    const macro = await Macro.create(macroDocumentData);
    FlashAPI.notify('info', game.i18n.format("FLASH_ROLLS.notifications.macroCreated", {
      macroName: macro.name
    }));
    
    // Open the macro configuration sheet for editing
    macro.sheet.render(true);
    
    return macro;
  }
  
  /**
   * Ensure 'Flash Token Bar' folder exists, creating it if necessary
   * @returns {Promise<string|null>} The folder ID or null if creation failed
   * @private
   */
  static async _ensureFlashRollsFolder() {
    const folderName = 'Flash Token Bar';
    let folder = game.folders.find(f => f.type === 'Macro' && f.name === folderName);
    
    if (!folder) {
      try {
        folder = await Folder.create({
          name: folderName,
          type: 'Macro',
          color: '#302437',
          sort: 0
        });
        LogUtil.log('Created Flash Token Bar macro folder', [folder]);
      } catch (error) {
        LogUtil.error('Failed to create Flash Token Bar macro folder:', [error]);
        FlashAPI.notify('warn', 'Failed to create Flash Token Bar macro folder. Macro will be created without folder organization.');
        return null;
      }
    }
    
    return folder?.id || null;
  }
  
  /**
   * Calculate group roll results using Flash Token Bar 5e calculation methods
   * @param {Object} options - Group roll calculation options
   * @param {number|string} options.method - Calculation method: 1/"Standard Rule", 2/"Group Average", 3/"Leader with Help", 4/"Weakest Link"
   * @param {Object[]} options.rollResults - Array of roll results with { actorId, total, actorName? }
   * @param {number} options.dc - Difficulty Class to check against
   * @param {Object[]} [options.actors] - Array of actor objects (auto-resolved from rollResults actorId if not provided)
   * @param {string} [options.rollType] - Type of roll (required for methods 3 & 4, e.g., 'skill', 'ability')
   * @param {string} [options.rollKey] - Specific roll key (required for methods 3 & 4, e.g., 'acr', 'str')
   * @returns {Object} Calculation result with { success, result, details, method, actorResults }
   * 
   * @example
   * // Standard Rule example (accepts method as number or string)
   * const result = FlashAPI.calculateGroupRoll({
   *   method: "Standard Rule", // or method: 1
   *   rollResults: [
   *     { actorId: "ABC", total: 15 }, // actorName optional - will be looked up
   *     { actorId: "DEF", total: 12, actorName: "Rogue" }, // or provided
   *     { actorId: "GHI", total: 8 }
   *   ],
   *   dc: 12
   * });
   * // Returns: { 
   * //   success: true, 
   * //   result: 1, // 1=success, 0=failure for Standard Rule
   * //   details: { finalResult: true, successes: 2, failures: 1, summary: "..." },
   * //   method: 'Standard Rule',
   * //   actorResults: [{ actorId: "ABC", actorName: "Someone", total: 15, passed: true }, ...]
   * // }
   */
  static calculateGroupRoll(options = {}) {
    const { rollResults, dc, rollType, rollKey } = options;
    let { method, actors } = options;
    
    // Convert string method names to numbers
    const methodMap = {
      "standard rule": 1,
      "group average": 2, 
      "leader with help": 3,
      "weakest link": 4
    };
    
    if (typeof method === 'string') {
      const normalizedMethod = method.toLowerCase();
      method = methodMap[normalizedMethod];
      if (!method) {
        ui.notifications.error(`Invalid method name: "${options.method}". Valid options: "Standard Rule", "Group Average", "Leader with Help", "Weakest Link", or numbers 1-4`);
        return null;
      }
    }
    
    // Validate required parameters
    if (!method || ![1, 2, 3, 4].includes(method)) {
      ui.notifications.error("Method must be 1-4 or valid method name: 'Standard Rule', 'Group Average', 'Leader with Help', 'Weakest Link'");
      return null;
    }
    
    if (!Array.isArray(rollResults) || rollResults.length === 0) {
      ui.notifications.error("rollResults must be a non-empty array");
      return null;
    }
    
    if (typeof dc !== 'number' || dc < 0) {
      ui.notifications.error("dc must be a positive number");
      return null;
    }
    
    // Validate rollResults format and enhance with actor names
    const enhancedRollResults = [];
    for (let i = 0; i < rollResults.length; i++) {
      const roll = rollResults[i];
      if (!roll.hasOwnProperty('total') || typeof roll.total !== 'number') {
        ui.notifications.error(`rollResults[${i}] must have a 'total' property with a numeric value`);
        return null;
      }
      if (!roll.actorId) {
        ui.notifications.error(`rollResults[${i}] must have an 'actorId' property`);
        return null;
      }
      
      // Get actor name if not provided
      let actorName = roll.actorName;
      if (!actorName) {
        const actorData = getActorData(roll.actorId);
        actorName = actorData?.name || roll.actorId;
      }
      
      enhancedRollResults.push({
        ...roll,
        actorName,
        passed: roll.total >= dc
      });
    }
    
    // Methods 3 and 4 require additional parameters
    if ([3, 4].includes(method)) {
      if (!rollType) {
        ui.notifications.error("rollType is required for Leader with Help and Weakest Link methods");
        return null;
      }
      if (!rollKey) {
        ui.notifications.error("rollKey is required for Leader with Help and Weakest Link methods");
        return null;
      }
      
      // Auto-resolve actors from rollResults if not provided
      if (!Array.isArray(actors) || actors.length === 0) {
        actors = [];
        for (const roll of enhancedRollResults) {
          const actor = getActorData(roll.actorId);
          if (actor) {
            actors.push(actor);
          }
        }
        
        if (actors.length === 0) {
          ui.notifications.error("No valid actors could be resolved from the rollResults for Leader with Help and Weakest Link methods");
          return null;
        }
      }
    }
    
    try {
      let calculationResult;
      let methodName;
      
      switch (method) {
        case 1: // Standard Rule
          calculationResult = RollHelpers.calculateStandardRule(rollResults, dc);
          methodName = 'Standard Rule';
          return {
            success: calculationResult.finalResult,
            result: calculationResult.finalResult ? 1 : 0, // 1=success, 0=failure
            details: calculationResult,
            method: methodName,
            actorResults: enhancedRollResults
          };
          
        case 2: // Group Average
          calculationResult = RollHelpers.calculateGroupAverage(rollResults, dc);
          methodName = 'Group Average';
          return {
            success: calculationResult.success,
            result: calculationResult.finalResult, // Numeric average result
            details: calculationResult,
            method: methodName,
            actorResults: enhancedRollResults
          };
          
        case 3: // Leader with Help
          calculationResult = RollHelpers.calculateLeaderWithHelp(rollResults, dc, actors, rollType, rollKey);
          methodName = 'Leader with Help';
          // Add isLeadRoll property to identify the leader
          const enhancedResultsWithLeader = enhancedRollResults.map(result => ({
            ...result,
            isLeadRoll: result.actorId === calculationResult.leaderActorId
          }));
          return {
            success: calculationResult.success,
            result: calculationResult.finalResult, // Modified leader result
            details: calculationResult,
            method: methodName,
            actorResults: enhancedResultsWithLeader
          };
          
        case 4: // Weakest Link
          calculationResult = RollHelpers.calculateWeakestLink(rollResults, dc, actors, rollType, rollKey);
          methodName = 'Weakest Link';
          // Add isLeadRoll property to identify the weakest link (the "lead" in this context)
          const enhancedResultsWithWeakest = enhancedRollResults.map(result => ({
            ...result,
            isLeadRoll: result.actorId === calculationResult.weakestActorId
          }));
          return {
            success: calculationResult.success,
            result: calculationResult.finalResult, // Modified weakest result
            details: calculationResult,
            method: methodName,
            actorResults: enhancedResultsWithWeakest
          };
          
        default:
          ui.notifications.error(`Invalid calculation method: ${method}`);
          return null;
      }
    } catch (error) {
      LogUtil.error('FlashAPI.calculateGroupRoll - Error:', [error]);
      ui.notifications.error(`Error calculating group roll: ${error.message}`);
      return null;
    }
  }

  static async createGroupRollMessage(actorEntries, rollType, rollKey, config = {}, groupRollId) {
    return ChatMessageManager.createGroupRollMessage(actorEntries, rollType, rollKey, config, groupRollId);
  }

  /**
   * Toggle the menu lock state
   * When locked, the menu won't close when clicking outside
   */
  static async toggleLockMenu() {
    const currentLockState = game.user.getFlag(MODULE.ID, 'menuLocked') ?? false;
    const newLockState = !currentLockState;

    await game.user.setFlag(MODULE.ID, 'menuLocked', newLockState);

    const menu = RollRequestsMenu.getInstance();
    if (menu && menu.rendered) {
      menu.isLocked = newLockState;
      const lockIcon = menu.element?.querySelector('#flash5e-actors-lock');
      if (lockIcon) {
        lockIcon.classList.remove('fa-lock-keyhole', 'fa-lock-keyhole-open');
        lockIcon.classList.add(newLockState ? 'fa-lock-keyhole' : 'fa-lock-keyhole-open');
      }
    }
  }

  /**
   * Toggle the roll requests enabled state
   * Controls whether the module intercepts and processes roll requests
   */
  static async toggleRollRequests() {
    const SETTINGS = getSettings();
    const currentValue = SettingsUtil.get(SETTINGS.rollRequestsEnabled.tag);
    const newValue = !currentValue;

    await SettingsUtil.set(SETTINGS.rollRequestsEnabled.tag, newValue);

    SidebarController.updateRollRequestsIcon(newValue);
    SettingsUtil.applyRollRequestsEnabled(newValue);

    const menu = RollRequestsMenu.getInstance();
    if (menu && menu.rendered) {
      await menu.render();
    }
  }

  /**
   * Toggle the skip roll dialogs setting
   * When enabled, rolls are made immediately without showing configuration dialogs
   */
  static async toggleSkipDialogs() {
    const SETTINGS = getSettings();
    const currentValue = SettingsUtil.get(SETTINGS.skipRollDialog.tag);
    await SettingsUtil.set(SETTINGS.skipRollDialog.tag, !currentValue);

    const menu = RollRequestsMenu.getInstance();
    if (menu && menu.rendered) {
      await menu.render();
    }
  }

  /**
   * Toggle the group rolls message setting
   * When enabled, multiple rolls are combined into a single chat message
   */
  static async toggleGroupRolls() {
    const SETTINGS = getSettings();
    const currentValue = SettingsUtil.get(SETTINGS.groupRollsMsgEnabled.tag);
    await SettingsUtil.set(SETTINGS.groupRollsMsgEnabled.tag, !currentValue);

    const menu = RollRequestsMenu.getInstance();
    if (menu && menu.rendered) {
      await menu.render();
    }
  }

  /**
   * Toggle the show options list on hover setting
   * When enabled, the roll request options list is shown when hovering over the menu
   */
  static async toggleShowOptions() {
    const SETTINGS = getSettings();
    const currentValue = SettingsUtil.get(SETTINGS.showOptionsListOnHover.tag);
    await SettingsUtil.set(SETTINGS.showOptionsListOnHover.tag, !currentValue);

    const menu = RollRequestsMenu.getInstance();
    if (menu && menu.rendered) {
      await menu.render();
    }
  }

  /**
   * Open the module settings dialog
   */
  static openSettings() {
    new ModuleSettingsMenu().render(true);
  }

  /**
   * Open the Patreon features dialog
   */
  static openPatreonFeatures() {
    new PremiumFeaturesDialog().render(true);
  }

  /**
   * Toggle select all actors in the Roll Requests Menu
   * Toggles between selecting all and deselecting all based on current state
   * @param {string} tab - Optional tab to switch to before selecting ('pc', 'npc', or 'group')
   */
  static async selectAllActors(tab) {
    const menu = RollRequestsMenu.getInstance();
    if (!menu || !menu.rendered) {
      FlashAPI.notify('warn', game.i18n.localize("FLASH_ROLLS.notifications.menuNotOpen"));
      return;
    }

    if (tab && ['pc', 'npc', 'group'].includes(tab)) {
      if (menu.currentTab !== tab) {
        menu.currentTab = tab;
        await menu.render();
      }
    }

    const selectAllCheckbox = menu.element?.querySelector('#flash5e-actors-all');
    if (selectAllCheckbox) {
      selectAllCheckbox.checked = !selectAllCheckbox.checked;
      selectAllCheckbox.dispatchEvent(new Event('change'));
    }
  }

  /**
   * Apply actor filters or open the actor filter dialog
   * @param {Object} filters - Optional filter configuration { inCombat: boolean, visible: boolean, removeDead: boolean }
   */
  static async filterActors(filters) {
    const menu = RollRequestsMenu.getInstance();
    if (!menu || !menu.rendered) {
      FlashAPI.notify('warn', game.i18n.localize("FLASH_ROLLS.notifications.menuNotOpen"));
      return;
    }

    if (filters && typeof filters === 'object') {
      const validFilters = {
        inCombat: !!filters.inCombat,
        visible: !!filters.visible,
        removeDead: !!filters.removeDead
      };

      menu.actorFilters = validFilters;
      await game.user.setFlag(MODULE.ID, 'actorFilters', validFilters);
      menu.render();
    } else {
      const filterButton = menu.element?.querySelector('#flash5e-filter-actors');
      if (filterButton) {
        filterButton.click();
      }
    }
  }

  /**
   * Get the current actor filter values
   * @returns {Object} Current filter configuration { inCombat: boolean, visible: boolean, removeDead: boolean }
   */
  static getActorFilters() {
    return game.user.getFlag(MODULE.ID, 'actorFilters') || {
      inCombat: false,
      visible: false,
      removeDead: false
    };
  }

  /**
   * Toggle targeting for actors
   * If actorIds are provided, toggles targeting for those actors
   * If no actorIds provided, uses menu selection (or clears all targets if nothing selected)
   * @param {string[]} actorIds - Array of actor/token IDs to toggle targeting for
   */
  static toggleTargets(actorIds) {
    const menu = RollRequestsMenu.getInstance();

    if (actorIds && actorIds.length > 0) {
      actorIds.forEach(uniqueId => {
        const actor = getActorData(uniqueId);
        if (!actor) return;

        const actorId = actor.id;
        const tokenId = game.actors.get(uniqueId) ? null : uniqueId;
        RollMenuEventManager.toggleActorTargetById(actorId, tokenId);
      });
    } else if (menu && menu.rendered) {
      RollMenuEventManager.toggleTargetsForSelected(menu);
    }
  }

  /**
   * Heal actors to full HP
   * @param {string[]} actorIds - Array of actor/token IDs to heal
   */
  static healAll(actorIds) {
    const menu = RollRequestsMenu.getInstance();

    if (actorIds && actorIds.length > 0) {
      actorIds.forEach(uniqueId => {
        const actor = getActorData(uniqueId);
        if (!actor) return;

        const actorId = actor.id;
        const tokenId = game.actors.get(uniqueId) ? null : uniqueId;
        RollMenuEventManager.healActorById(actorId, tokenId);
      });
    } else if (menu && menu.rendered) {
      RollMenuEventManager.healSelectedActors(menu);
    }
  }

  /**
   * Set actor HP to 0
   * @param {string[]} actorIds - Array of actor/token IDs to set HP to 0
   */
  static killAll(actorIds) {
    const menu = RollRequestsMenu.getInstance();

    if (actorIds && actorIds.length > 0) {
      actorIds.forEach(uniqueId => {
        const actor = getActorData(uniqueId);
        if (!actor) return;

        const actorId = actor.id;
        const tokenId = game.actors.get(uniqueId) ? null : uniqueId;
        RollMenuEventManager.killActorById(actorId, tokenId);
      });
    } else if (menu && menu.rendered) {
      RollMenuEventManager.killSelectedActors(menu);
    }
  }

  /**
   * Remove all status effects from actors
   * @param {string[]} actorIds - Array of actor/token IDs to remove status effects from
   */
  static async removeStatusEffects(actorIds) {
    const menu = RollRequestsMenu.getInstance();

    if (actorIds && actorIds.length > 0) {
      let totalRemoved = 0;
      for (const uniqueId of actorIds) {
        const actor = getActorData(uniqueId);
        if (!actor) continue;

        const statusEffects = actor.appliedEffects.filter(effect =>
          effect.statuses?.size > 0 || effect.flags?.core?.statusId
        );

        for (const effect of statusEffects) {
          try {
            await effect.delete();
            totalRemoved++;
          } catch (error) {
            LogUtil.error(`Failed to remove status effect from ${actor.name}`, [error]);
          }
        }
      }

      if (totalRemoved > 0) {
        FlashAPI.notify('info', `Removed ${totalRemoved} status effects`);
      }
    } else if (menu && menu.rendered) {
      await RollMenuEventManager.removeAllStatusEffectsFromSelected(menu);
    }
  }

  /**
   * Open character sheets for actors
   * @param {string[]} actorIds - Array of actor/token IDs to open sheets for
   */
  static openSheets(actorIds) {
    const menu = RollRequestsMenu.getInstance();

    if (actorIds && actorIds.length > 0) {
      actorIds.forEach(uniqueId => {
        const actor = getActorData(uniqueId);
        if (!actor) return;

        const actorId = actor.id;
        const tokenId = game.actors.get(uniqueId) ? null : uniqueId;
        RollMenuEventManager.openActorSheetById(actorId, tokenId);
      });
    } else if (menu && menu.rendered) {
      RollMenuEventManager.openSheetsForSelected(menu);
    }
  }

  /**
   * Create a group or encounter from selected actors
   * @param {string[]} actorIds - Array of actor/token IDs to group
   */
  static async groupSelected(actorIds) {
    const menu = RollRequestsMenu.getInstance();

    if (actorIds && actorIds.length > 0) {
      const tempMenu = { selectedActors: new Set(actorIds) };
      await RollMenuEventManager.createGroupFromSelected(tempMenu);
    } else if (menu && menu.rendered) {
      await RollMenuEventManager.createGroupFromSelected(menu);
    } else {
      FlashAPI.notify('warn', game.i18n.localize("FLASH_ROLLS.notifications.noActorsSelected"));
    }
  }

  /**
   * Toggle movement restriction for actors
   * @param {string[]} actorIds - Array of actor/token IDs to toggle movement for
   */
  static async toggleMovement(actorIds) {
    const menu = RollRequestsMenu.getInstance();

    if (actorIds && actorIds.length > 0) {
      const tempMenu = { selectedActors: new Set(actorIds) };
      await TokenMovementManager.toggleMovementForSelected(tempMenu);
    } else if (menu && menu.rendered) {
      await TokenMovementManager.toggleMovementForSelected(menu);
    } else {
      FlashAPI.notify('warn', game.i18n.localize("FLASH_ROLLS.notifications.noActorsSelected"));
    }
  }

  /**
   * Open the contested roll dialog for selected actors
   * @param {string[]} actorIds - Array of actor/token IDs for contested roll
   */
  static async openContestedRoll(actorIds) {
    const menu = RollRequestsMenu.getInstance();

    if (actorIds && actorIds.length > 0) {
      const tempMenu = { selectedActors: new Set(actorIds) };
      await RollMenuEventManager.openContestedRollDialog(tempMenu);
    } else if (menu && menu.rendered) {
      await RollMenuEventManager.openContestedRollDialog(menu);
    } else {
      FlashAPI.notify('warn', game.i18n.localize("FLASH_ROLLS.notifications.noActorsSelected"));
    }
  }

  /**
   * Place tokens for selected actors on the canvas
   * @param {string[]} actorIds - Array of actor/token IDs to place
   * @param {Object} [location] - Optional location to place tokens {x: number, y: number}. If not provided, enters interactive placement mode.
   */
  static async placeTokens(actorIds, location = null) {
    const menu = RollRequestsMenu.getInstance();

    if (actorIds && actorIds.length > 0) {
      if (location && typeof location === 'object' && typeof location.x === 'number' && typeof location.y === 'number') {
        await TokenPlacementManager.placeTokensAtLocation(actorIds, location);
      } else {
        const tempMenu = { selectedActors: new Set(actorIds) };
        await TokenPlacementManager.placeTokensForSelectedActors(tempMenu);
      }
    } else if (menu && menu.rendered) {
      await TokenPlacementManager.placeTokensForSelectedActors(menu);
    } else {
      FlashAPI.notify('warn', game.i18n.localize("FLASH_ROLLS.notifications.noActorsSelected"));
    }
  }

  /**
   * Teleport tokens to a destination scene and location
   * @param {string[]} actorIds - Array of actor/token IDs to teleport
   * @param {string|Object} [destinationScene] - Optional scene ID, name, or scene object. If not provided, enters interactive teleport mode.
   * @param {Object} [centerLocation] - Optional center location {x: number, y: number}. Required if destinationScene is provided.
   */
  static async teleportTokens(actorIds, destinationScene = null, centerLocation = null) {
    const menu = RollRequestsMenu.getInstance();

    if (actorIds && actorIds.length > 0) {
      if (destinationScene && centerLocation && typeof centerLocation === 'object' && typeof centerLocation.x === 'number' && typeof centerLocation.y === 'number') {
        await TokenTeleportManager.teleportToDestination(actorIds, destinationScene, centerLocation);
      } else {
        const tempMenu = { selectedActors: new Set(actorIds) };
        await TokenTeleportManager.teleportSelectedTokens(tempMenu);
      }
    } else if (menu && menu.rendered) {
      await TokenTeleportManager.teleportSelectedTokens(menu);
    } else {
      FlashAPI.notify('warn', game.i18n.localize("FLASH_ROLLS.notifications.noActorsSelected"));
    }
  }

  /**
   * Transform actors into a target actor
   * @param {string[]} actorIds - Array of actor/token IDs to transform
   * @param {string} [targetActorUuid] - UUID of actor to transform into (shows dialog if omitted)
   * @param {Object} [options] - Transformation options
   * @param {string} [options.preset] - Preset name: "wildshape", "polymorph", or "custom"
   * @param {Object} [options.settings] - Custom TransformationSetting configuration
   * @param {boolean} [options.renderSheet=false] - Show actor sheet after transformation
   * @returns {Promise<void>}
   */
  static async transformActors(actorIds, targetActorUuid = null, options = {}) {
    const menu = RollRequestsMenu.getInstance();

    if (actorIds && actorIds.length > 0) {
      await TransformationManager.transformActors(actorIds, targetActorUuid, options);
    } else if (menu && menu.rendered) {
      await TransformationManager.transformSelectedActors(menu);
    } else {
      FlashAPI.notify('warn', game.i18n.localize("FLASH_ROLLS.notifications.noActorsSelected"));
    }
  }

  /**
   * Revert transformed actors to original form
   * @param {string[]} actorIds - Array of actor/token IDs to revert
   * @returns {Promise<void>}
   */
  static async revertTransformation(actorIds) {
    const menu = RollRequestsMenu.getInstance();

    if (actorIds && actorIds.length > 0) {
      await TransformationManager.revertTransformation(actorIds);
    } else if (menu && menu.rendered) {
      const selectedActorIds = Array.from(menu.selectedActors);
      await TransformationManager.revertTransformation(selectedActorIds);
    } else {
      FlashAPI.notify('warn', game.i18n.localize("FLASH_ROLLS.notifications.noActorsSelected"));
    }
  }

  /**
   * Show a notification to the user
   * @param {string} type - Notification type ('info', 'warn', 'error')
   * @param {string} message - Message to display
   */
  static notify(type, message) {
    GeneralUtil.notify(type, message);
  }
}