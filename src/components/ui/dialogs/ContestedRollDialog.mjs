import { MODULE_ID } from "../../../constants/General.mjs";
import { LogUtil } from "../../utils/LogUtil.mjs";
import { SettingsUtil } from "../../utils/SettingsUtil.mjs";
import { getSettings } from "../../../constants/Settings.mjs";
import { RollHelpers } from "../../helpers/RollHelpers.mjs";
import { ChatMessageManager } from "../../managers/ChatMessageManager.mjs";
import { GeneralUtil } from "../../utils/GeneralUtil.mjs";
import { FlashAPI } from "../../core/FlashAPI.mjs";

/**
 * Contested Roll Dialog for requesting different roll types from selected actors
 */
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
export class ContestedRollDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.actors = options.actors || [];
    this.rollSelections = new Map();
    this.rollMode = "publicroll";
    this.flavor = "";
    this.hideNpcNames = false;
  }

  /**
   * Default application configuration
   */
  static DEFAULT_OPTIONS = {
    id: "flash5e-contested-roll-dialog",
    classes: ["flash5e-dialog", "flash5e-contested-roll-dialog"],
    tag: "div",
    window: {
      title: "FLASH_ROLLS.ui.dialogs.contestedRoll.title",
      icon: "fas fa-swords",
      resizable: false,
      positioned: true,
      frame: true
    },
    position: {
      width: 540,
      height: "auto"
    },
    actions: {
      request: ContestedRollDialog.prototype._onRequest,
      "show-code": ContestedRollDialog.prototype._onShowCode
    }
  };

  /**
   * Define template parts
   */
  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/contested-roll-dialog.hbs`
    }
  };

  /**
   * Prepare application rendering context
   */
  async _prepareContext(options = {}) {
    const context = await super._prepareContext(options);

    const abilities = {};
    for (const [key, config] of Object.entries(CONFIG.DND5E.abilities)) {
      abilities[key] = {
        label: game.i18n.localize(config.label),
        abbreviation: game.i18n.localize(config.abbreviation)
      };
    }

    const skills = {};
    for (const [key, config] of Object.entries(CONFIG.DND5E.skills)) {
      skills[key] = {
        label: game.i18n.localize(config.label)
      };
    }

    const rollModes = Object.entries(CONFIG.Dice.rollModes).map(([value, label]) => ({
      value,
      labelKey: typeof label === 'string' ? label : (label?.label || label?.name || value),
      selected: value === this.rollMode
    }));

    return {
      ...context,
      actors: this.actors.map(a => {
        const actor = a.actor || a;
        return {
          id: actor.id,
          name: actor.name,
          img: actor.img
        };
      }),
      abilities,
      skills,
      rollMode: this.rollMode,
      rollModes,
      flavor: this.flavor,
      hideNpcNames: this.hideNpcNames
    };
  }

  /**
   * Attach event listeners
   */
  _attachPartListeners(partId, htmlElement, options) {
    super._attachPartListeners(partId, htmlElement, options);

    const rollModeSelect = htmlElement.querySelector('.roll-mode-select');
    if (rollModeSelect) {
      rollModeSelect.addEventListener('change', (event) => {
        this.rollMode = event.target.value;
      });
    }

    const flavorInput = htmlElement.querySelector('input[name="flavor"]');
    if (flavorInput) {
      flavorInput.addEventListener('input', (event) => {
        this.flavor = event.target.value;
      });
    }

    const hideNpcCheckbox = htmlElement.querySelector('input[name="hideNpcNames"]');
    if (hideNpcCheckbox) {
      hideNpcCheckbox.addEventListener('change', (event) => {
        this.hideNpcNames = event.target.checked;
      });
    }

    const actorRollSelects = htmlElement.querySelectorAll('.actor-roll-type');
    actorRollSelects.forEach(select => {
      const actorId = select.dataset.actorId;
      if (select.value) {
        this.rollSelections.set(actorId, select.value);
      }

      select.addEventListener('change', (event) => {
        const actorId = event.target.dataset.actorId;
        this.rollSelections.set(actorId, event.target.value);
      });
    });
  }

  /**
   * Handle request button click
   */
  async _onRequest(event, target) {
    if (this.actors.length === 0) {
      FlashAPI.notify('warn',game.i18n.localize("FLASH_ROLLS.notifications.noActorsSelected"));
      return;
    }

    for (const actorEntry of this.actors) {
      const actor = actorEntry.actor || actorEntry;
      const selection = this.rollSelections.get(actor.id);
      if (!selection) {
        FlashAPI.notify('warn',game.i18n.format("FLASH_ROLLS.notifications.noRollSelected", { name: actor.name }));
        return;
      }
    }

    const result = {
      actors: this.actors.map(actorEntry => {
        const actor = actorEntry.actor || actorEntry;
        return {
          actor: actor,
          uniqueId: actorEntry.uniqueId || actor.id,
          tokenId: actorEntry.tokenId || null,
          rollType: this.rollSelections.get(actor.id)
        };
      }),
      rollMode: this.rollMode,
      flavor: this.flavor,
      hideNpcNames: this.hideNpcNames
    };

    await this._executeContestedRolls(result);
    this.close();
  }

  /**
   * Execute contested rolls for all actors
   */
  async _executeContestedRolls(config) {
    LogUtil.log('_executeContestedRolls', [config]);

    const SETTINGS = getSettings();
    const groupRollsMsgEnabled = SettingsUtil.get(SETTINGS.groupRollsMsgEnabled.tag);
    const groupRollId = groupRollsMsgEnabled ? foundry.utils.randomID() : null;
    LogUtil.log('ContestedRoll - groupRollId', [groupRollId]);

    const contestedConfig = { ...config, isContestedRoll: true };

    if (groupRollId) {
      const actorEntries = config.actors.map(actorConfig => {
        const actor = actorConfig.actor;
        const uniqueId = actorConfig.uniqueId || actor.id;
        const tokenId = actorConfig.tokenId || null;
        const [type, key] = actorConfig.rollType.split(':');
        const rollType = type;

        return {
          actor: actor,
          uniqueId: uniqueId,
          tokenId: tokenId,
          rollType: rollType,
          rollKey: key
        };
      });

      const firstRollType = config.actors[0].rollType.split(':');
      const rollType = firstRollType[0];
      const rollKey = firstRollType[1];

      await ChatMessageManager.createGroupRollMessage(
        actorEntries,
        rollType,
        rollKey,
        contestedConfig,
        groupRollId
      );
    }

    for (const actorConfig of config.actors) {
      await this._executeRollForActor(actorConfig, contestedConfig, groupRollId);
    }
  }

  /**
   * Execute a single roll for an actor
   */
  async _executeRollForActor(actorConfig, config, groupRollId = null) {
    const actor = actorConfig.actor;
    const tokenId = actorConfig.tokenId;
    const [type, key] = actorConfig.rollType.split(':');

    LogUtil.log('_executeRollForActor', [actor.name, type, key, 'tokenId:', tokenId, 'groupRollId:', groupRollId]);

    const SETTINGS = getSettings();
    const isPlayerOwned = RollHelpers.isPlayerOwned(actor);
    const rollRequestsEnabled = SettingsUtil.get(SETTINGS.rollRequestsEnabled.tag);
    const skipRollDialog = RollHelpers.shouldSkipRollDialog({
      isPC: isPlayerOwned,
      isNPC: !isPlayerOwned,
      sendRequest: isPlayerOwned && rollRequestsEnabled
    });

    try {
      if (type === 'dice') {
        const roll = await new Roll(key, actor.getRollData()).evaluate();

        const speakerData = { actor };
        if (tokenId) {
          const token = canvas.tokens?.get(tokenId) || game.scenes.active?.tokens?.get(tokenId);
          if (token) {
            speakerData.token = token;
          }
        }
        const speaker = ChatMessage.implementation.getSpeaker(speakerData);

        const flavor = config.flavor || game.i18n.localize("FLASH_ROLLS.ui.dialogs.contestedRoll.customRoll");

        const messageData = {
          speaker,
          flavor
        };

        if (config.rollMode) {
          messageData.rollMode = config.rollMode;
        }

        if (groupRollId) {
          messageData.flags = {
            "flash-rolls-5e": {
              groupRollId: groupRollId,
              isContestedRoll: true
            }
          };
        }

        await roll.toMessage(messageData);
      } else {
        const requestType = type === 'ability' ? 'abilitycheck' : type;
        const uniqueId = tokenId || actor.id;

        await FlashAPI.requestRoll({
          requestType: requestType,
          rollKey: key,
          actorIds: [uniqueId],
          sendAsRequest: isPlayerOwned && rollRequestsEnabled,
          skipRollDialog: skipRollDialog,
          groupRollId: groupRollId,
          isContestedRoll: config.isContestedRoll || false
        });
      }
    } catch (error) {
      LogUtil.error('Error executing roll', [error]);
      ui.notifications.error(game.i18n.format("FLASH_ROLLS.notifications.rollFailed", { name: actor.name }), [error]);
    }
  }

  /**
   * Handle show code button click to create a macro
   */
  async _onShowCode(event, target) {
    LogUtil.log('ContestedRollDialog _onShowCode', []);

    for (const actorEntry of this.actors) {
      const actor = actorEntry.actor || actorEntry;
      const selection = this.rollSelections.get(actor.id);
      if (!selection) {
        FlashAPI.notify('warn',game.i18n.format("FLASH_ROLLS.notifications.noRollSelected", { name: actor.name }));
        return;
      }
    }

    const macroCode = this._generateMacroCode();
    LogUtil.log('Generated macro code:', [macroCode]);

    try {
      await this._createContestedRollMacro(macroCode);
      this.close();
    } catch (error) {
      LogUtil.error('Failed to create macro:', [error]);
      ui.notifications.error(`Failed to create macro: ${error.message}`);
    }
  }

  /**
   * Generate macro code for the current configuration
   */
  _generateMacroCode() {
    const firstActor = this.actors[0].actor || this.actors[0];
    const firstSelection = this.rollSelections.get(firstActor.id);
    if (!firstSelection) {
      FlashAPI.notify('warn',"Please select a roll type for all actors before creating a macro.");
      return null;
    }

    const firstRoll = firstSelection.split(':');
    const firstType = firstRoll[0] === 'ability' ? 'abilitycheck' : firstRoll[0];
    const firstKey = firstRoll[1];

    const rollCommands = this.actors.map(actorEntry => {
      const a = actorEntry.actor || actorEntry;
      const selection = this.rollSelections.get(a.id);
      if (!selection) {
        return null;
      }
      const [type, key] = selection.split(':');
      const requestType = type === 'ability' ? 'abilitycheck' : type;

      if (type === 'dice') {
        return `  // ${a.name}: Custom Dice Roll
  const actor${a.id} = game.actors.get("${a.id}");
  if (actor${a.id}) {
    const roll = await new Roll("${key}", actor${a.id}.getRollData()).evaluate();
    await roll.toMessage({
      speaker: ChatMessage.implementation.getSpeaker({ actor: actor${a.id} }),
      flavor: "${this.flavor || 'Custom Roll'}",
      rollMode: "${this.rollMode}",
      flags: {
        "flash-rolls-5e": {
          groupRollId: groupRollId,
          isContestedRoll: true
        }
      }
    });
  }`;
      } else {
        return `  // ${a.name}: ${type}:${key}
  await FlashAPI.requestRoll({
    requestType: "${requestType}",
    rollKey: "${key}",
    actorIds: ["${a.id}"],
    skipRollDialog: true,
    groupRollId: groupRollId,
    isContestedRoll: true
  });`;
      }
    });

    if (rollCommands.includes(null)) {
      return null;
    }

    const joinedCommands = rollCommands.join('\n\n');

    const actorEntriesCode = this.actors.map(actorEntry => {
      const a = actorEntry.actor || actorEntry;
      return `    {
      actor: game.actors.get("${a.id}"),
      uniqueId: "${a.id}",
      tokenId: null
    }`;
    }).join(',\n');

    return `// Flash Token Bar: Contested Roll
// Roll Mode: ${this.rollMode}
${this.flavor ? `// Flavor: ${this.flavor}` : ''}

(async () => {
  try {
    const groupRollId = foundry.utils.randomID();

    const actorEntries = [
${actorEntriesCode}
    ];

    await FlashAPI.createGroupRollMessage(
      actorEntries,
      "${firstType}",
      "${firstKey}",
      { rollMode: "${this.rollMode}", flavor: "${this.flavor}", isContestedRoll: true },
      groupRollId
    );

${joinedCommands}
  } catch (error) {
    ui.notifications.error("Failed to execute contested roll: " + error.message);
  }
})();`;
  }

  /**
   * Create a macro with the contested roll configuration
   */
  async _createContestedRollMacro(command) {
    const SETTINGS = getSettings();
    const addMacrosToFolder = SettingsUtil.get(SETTINGS.addMacrosToFolder.tag);

    let folderId = null;
    if (addMacrosToFolder) {
      folderId = await this._ensureFlashRollsFolder();
    }

    const actorNames = this.actors.map(actorEntry => {
      const a = actorEntry.actor || actorEntry;
      return a.name;
    }).join(' vs ');
    const macroName = `Contested Roll: ${actorNames}`;

    const macroDocumentData = {
      name: macroName,
      type: "script",
      command: command,
      img: "modules/flash-rolls-5e/assets/bolt-circle.svg",
      ...(folderId && { folder: folderId }),
      flags: {
        "flash-rolls-5e": {
          type: "contested-roll",
          actors: this.actors.map(actorEntry => {
            const a = actorEntry.actor || actorEntry;
            return a.id;
          }),
          rollSelections: Array.from(this.rollSelections.entries()),
          rollMode: this.rollMode,
          flavor: this.flavor
        }
      }
    };

    const macro = await Macro.create(macroDocumentData);
    FlashAPI.notify('info', game.i18n.format("FLASH_ROLLS.notifications.macroCreated", {
      macroName: macro.name
    }));

    macro.sheet.render(true);
    return macro;
  }

  /**
   * Ensure Flash Token Bar folder exists for macro organization
   */
  async _ensureFlashRollsFolder() {
    const folderName = "Flash Token Bar";
    let folder = game.folders.find(f => f.type === "Macro" && f.name === folderName);

    if (!folder) {
      try {
        folder = await Folder.create({
          name: folderName,
          type: "Macro",
          color: "#302437",
          sort: 0
        });
        LogUtil.log('Created Flash Token Bar macro folder', [folder]);
      } catch (error) {
        LogUtil.error('Failed to create Flash Token Bar macro folder:', [error]);
        FlashAPI.notify('warn',"Failed to create Flash Token Bar macro folder. Macro will be created without folder organization.");
        return null;
      }
    }

    return folder?.id || null;
  }

  /**
   * Handle delete actor button click
   */
  async _onDeleteActor(event, target) {
    const actorId = target.dataset.actorId;
    LogUtil.log('ContestedRollDialog _onDeleteActor', [actorId]);

    this.actors = this.actors.filter(a => a.id !== actorId);
    this.rollSelections.delete(actorId);

    await this.render(true);
  }

  /**
   * Show the dialog
   */
  static async show(actors) {
    if (!actors || actors.length === 0) {
      FlashAPI.notify('warn',game.i18n.localize("FLASH_ROLLS.notifications.noActorsSelected"));
      return null;
    }

    const dialog = new this({ actors });
    dialog.render(true);
    return dialog;
  }
}