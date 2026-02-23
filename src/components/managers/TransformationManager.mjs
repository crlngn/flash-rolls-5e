import { LogUtil } from "../utils/LogUtil.mjs";
import { getSettings } from "../../constants/Settings.mjs";
import { getActorData } from "../helpers/Helpers.mjs";
import { TransformationDialog } from "../ui/dialogs/TransformationDialog.mjs";
import { GeneralUtil } from "../utils/GeneralUtil.mjs";
import { FlashAPI } from "../core/FlashAPI.mjs";

/**
 * Manager for actor transformation (polymorph/wild shape)
 * Handles transformation orchestration, animations, and reversion
 */
export class TransformationManager {

  /**
   * Transform selected actors from the menu (interactive mode)
   * @param {Object} menu - The roll requests menu instance
   * @returns {Promise<void>}
   */
  static async transformSelectedActors(menu) {
    if (!menu || !menu.selectedActors || menu.selectedActors.size === 0) {
      FlashAPI.notify('warn', game.i18n.localize("FLASH_ROLLS.notifications.noActorsSelected"));
      return;
    }

    const actorIds = Array.from(menu.selectedActors);
    await this.transformActors(actorIds);
  }

  /**
   * Transform actors into a target actor
   * @param {string[]} actorIds - Array of actor/token IDs to transform
   * @param {string} [targetActorUuid] - UUID of actor to transform into (shows dialog if omitted)
   * @param {Object} [options] - Transformation options
   * @param {string} [options.preset] - Preset name: "wildshape", "polymorph", or "custom"
   * @param {Object} [options.settings] - Custom TransformationSetting configuration
   * @param {boolean} [options.renderSheet=false] - Show actor sheet after transformation
   * @param {boolean} [options.skipRevertCheck=false] - Skip checking if actors are already transformed
   * @returns {Promise<void>}
   */
  static async transformActors(actorIds, targetActorUuid = null, options = {}) {
    LogUtil.log('TransformationManager.transformActors', [actorIds, targetActorUuid, options]);

    if (!actorIds || actorIds.length === 0) {
      FlashAPI.notify('warn', game.i18n.localize("FLASH_ROLLS.notifications.noActorsSelected"));
      return;
    }

    if (!game.user.isGM) {
      ui.notifications.error(game.i18n.localize("FLASH_ROLLS.notifications.gmOnly"));
      return;
    }

    const actors = actorIds.map(id => getActorData(id)).filter(a => a);
    if (actors.length === 0) {
      ui.notifications.error(game.i18n.localize("FLASH_ROLLS.notifications.noValidActorsSelected"));
      return;
    }

    const transformedActors = actors.filter(a => a.getFlag("dnd5e", "isPolymorphed"));
    if (transformedActors.length > 0 && !options.skipRevertCheck) {
      const revert = await foundry.applications.api.DialogV2.confirm({
        window: {
          title: game.i18n.localize("FLASH_ROLLS.ui.dialogs.transformation.revertTitle")
        },
        content: `<p>${game.i18n.localize("FLASH_ROLLS.ui.dialogs.transformation.revertConfirm")}</p>`,
        rejectClose: false,
        modal: true
      });

      if (revert) {
        const idsToRevert = transformedActors.map(a => {
          const token = canvas.tokens.placeables.find(t => t.actor === a);
          return token ? token.document.id : a.id;
        });
        await this.revertTransformation(idsToRevert);
        return;
      }
    }

    let targetActor;
    let transformSettings;

    if (targetActorUuid) {
      targetActor = await fromUuid(targetActorUuid);
      if (!targetActor) {
        ui.notifications.error(game.i18n.localize("FLASH_ROLLS.notifications.invalidActorUuid"));
        return;
      }

      transformSettings = this._createTransformSettings(options.preset, options.settings);
    } else {
      const dialogResult = await TransformationDialog.show(actors);
      if (!dialogResult) {
        return;
      }

      targetActor = dialogResult.targetActor;
      transformSettings = dialogResult.settings;
      options.renderSheet = dialogResult.renderSheet ?? false;
    }

    await this._performTransformations(actors, targetActor, transformSettings, options);
  }

  /**
   * Revert transformed actors to original form
   * @param {string[]} actorIds - Array of actor/token IDs to revert
   * @returns {Promise<void>}
   */
  static async revertTransformation(actorIds) {
    LogUtil.log('TransformationManager.revertTransformation', [actorIds]);

    if (!actorIds || actorIds.length === 0) {
      FlashAPI.notify('warn', game.i18n.localize("FLASH_ROLLS.notifications.noActorsSelected"));
      return;
    }

    const actors = actorIds.map(id => getActorData(id)).filter(a => a);
    if (actors.length === 0) {
      ui.notifications.error(game.i18n.localize("FLASH_ROLLS.notifications.noValidActorsSelected"));
      return;
    }

    const transformedActors = actors.filter(a => a.getFlag("dnd5e", "isPolymorphed"));
    if (transformedActors.length === 0) {
      FlashAPI.notify('warn', game.i18n.localize("FLASH_ROLLS.notifications.notTransformed"));
      return;
    }

    const tokens = this._getTokensForActors(transformedActors);
    if (tokens.length > 0 && (this._hasJB2A() || this._hasCustomAnimation())) {
      await this._playTransformationAnimation(tokens);
    }

    let successCount = 0;
    for (const actor of transformedActors) {
      try {
        await actor.revertOriginalForm();
        successCount++;
      } catch (error) {
        LogUtil.error(`Failed to revert ${actor.name}:`, [error]);
        ui.notifications.error(game.i18n.format("FLASH_ROLLS.notifications.transformationFailed", {
          name: actor.name,
          error: error.message
        }));
      }
    }

    if (successCount > 0) {
      FlashAPI.notify('info', game.i18n.format("FLASH_ROLLS.notifications.reversionSuccess", {
        count: successCount
      }));
    }
  }

  /**
   * Perform transformations for all actors
   * @param {Actor[]} actors - Actors to transform
   * @param {Actor} targetActor - Actor to transform into
   * @param {TransformationSetting} settings - Transformation settings
   * @param {Object} options - Additional options
   * @returns {Promise<void>}
   * @private
   */
  static async _performTransformations(actors, targetActor, settings, options = {}) {
    const tokens = this._getTokensForActors(actors);

    if (tokens.length > 0 && (this._hasJB2A() || this._hasCustomAnimation())) {
      this._playTransformationAnimation(tokens);
    }

    let successCount = 0;
    for (const actor of actors) {
      try {
        const sanitizedTarget = this._sanitizeTargetActor(actor, targetActor);
        await actor.transformInto(sanitizedTarget, settings, {
          renderSheet: options.renderSheet ?? false
        });
        successCount++;

        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        LogUtil.error(`Failed to transform ${actor.name}:`, [error]);
        ui.notifications.error(game.i18n.format("FLASH_ROLLS.notifications.transformationFailed", {
          name: actor.name,
          error: error.message
        }));
      }
    }

    if (successCount > 0) {
      FlashAPI.notify('info', game.i18n.format("FLASH_ROLLS.notifications.transformationSuccess", {
        count: successCount,
        target: targetActor.name
      }));
    }
  }

  /**
   * Play transformation animation using Sequencer
   * @param {Token[]} tokens - Tokens to animate
   * @returns {Promise<void>}
   * @private
   */
  static async _playTransformationAnimation(tokens) {
    if (!tokens || tokens.length === 0) return;

    let animationPath = this._getAnimationPath();
    if (!animationPath && this._hasJB2A()) {
      animationPath = await this._getDefaultJB2APath();
    }

    if (!animationPath) return;

    try {
      for (const token of tokens) {
        const { x: centerX, y: centerY } = token.center;

        new Sequence()
          .effect()
          .file(animationPath)
          .atLocation({ x: centerX, y: centerY })
          .scale(0.6)
          .fadeIn(200)
          .fadeOut(400)
          .duration(1500)
          .forUsers(game.users.map(u => u.id))
          .play();

        await new Promise(resolve => setTimeout(resolve, 200));
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      LogUtil.warn(`Transformation animation file not found: ${animationPath}`, [error]);
      FlashAPI.notify('warn', game.i18n.format("FLASH_ROLLS.notifications.animationFileNotFound", {
        path: animationPath
      }));
    }
  }

  /**
   * Get tokens for actors
   * @param {Actor[]} actors - Actors to get tokens for
   * @returns {Token[]} Array of tokens
   * @private
   */
  static _getTokensForActors(actors) {
    const tokens = [];

    for (const actor of actors) {
      const token = canvas.tokens.placeables.find(t => t.actor === actor);
      if (token) {
        tokens.push(token);
      }
    }

    return tokens;
  }

  /**
   * Create transformation settings based on preset or custom config
   * @param {string} [preset] - Preset name
   * @param {Object} [customSettings] - Custom settings configuration
   * @returns {TransformationSetting} Transformation settings
   * @private
   */
  static _createTransformSettings(preset, customSettings) {
    if (customSettings) {
      return new dnd5e.dataModels.settings.TransformationSetting(customSettings);
    }

    switch (preset) {
      case "wildshape":
        return new dnd5e.dataModels.settings.TransformationSetting({
          preset: "wildshape"
        });

      case "polymorph":
        return new dnd5e.dataModels.settings.TransformationSetting({
          keep: new Set(["mental"]),
          transformTokens: true
        });

      default:
        return new dnd5e.dataModels.settings.TransformationSetting({
          keep: new Set(["mental"]),
          transformTokens: true
        });
    }
  }

  /**
   * Get JB2A module if available
   * @returns {Module|null} JB2A module or null
   * @private
   */
  static _getJB2AModule() {
    return game.modules.get('JB2A_DnD5e') || game.modules.get('jb2a_patreon');
  }

  /**
   * Check if JB2A module is available
   * @returns {boolean} True if JB2A is active
   * @private
   */
  static _hasJB2A() {
    const module = this._getJB2AModule();
    return module?.active;
  }

  /**
   * Check if Sequencer module is active
   * @returns {boolean} True if Sequencer is active
   * @private
   */
  static _hasSequencer() {
    return game.modules.get('sequencer')?.active;
  }

  /**
   * Get default JB2A transformation animation path
   * @returns {Promise<string|null>} Path to animation or null
   * @private
   */
  static async _getDefaultJB2APath() {
    if (this._hasSequencer() && window.Sequencer?.Database) {
      const possiblePaths = [
        'jb2a.smoke.puff.centered.grey.1',
        'jb2a.smoke.puff.centered.grey',
        'jb2a.smoke.puff.grey'
      ];

      for (const dbPath of possiblePaths) {
        if (Sequencer.Database.entryExists(dbPath)) {
          LogUtil.log(`Found JB2A transformation animation via Sequencer: ${dbPath}`);
          return dbPath;
        }
      }
    }

    const jb2aModule = this._getJB2AModule();
    if (jb2aModule?.active) {
      const prefix = this._getJB2APrefix(jb2aModule);
      const filePath = `${prefix}/${jb2aModule.id}/Library/Generic/Smoke/SmokePuff01_02_Regular_Grey_400x400.webm`;

      LogUtil.log(`Using JB2A transformation animation file path: ${filePath}`);
      return filePath;
    }

    LogUtil.warn("JB2A module not found, transformation animations disabled");
    return null;
  }

  /**
   * Get the JB2A file path prefix from the module's location setting
   * @param {Module} jb2aModule - The JB2A module
   * @returns {string} The prefix for JB2A file paths
   * @private
   */
  static _getJB2APrefix(jb2aModule) {
    try {
      const location = game.settings.get(jb2aModule.id, 'jb2aLocation');
      if (location && location !== 'modules' && location !== '') {
        return location.replace(/\/+$/, '');
      }
    } catch (e) { }
    return 'modules';
  }

  /**
   * Check if custom animation path is configured
   * @returns {boolean} True if custom path exists
   * @private
   */
  static _hasCustomAnimation() {
    return !!this._getAnimationPath();
  }

  /**
   * Get custom animation path from settings
   * @returns {string|null} Animation file path or null
   * @private
   */
  static _getAnimationPath() {
    try {
      const SETTINGS = getSettings();
      if (!SETTINGS.transformAnimationPath?.tag) return null;
      const path = game.settings.get("flash-rolls-5e", SETTINGS.transformAnimationPath.tag);
      return path && path.trim() !== "" ? path : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Sanitize target actor to only include abilities present in source actor
   * Prevents DnD5e transformInto errors when target has extra abilities that source doesn't have
   * This handles cases where actors have optional abilities (san, hon) that aren't present in all actors
   * @param {Actor} sourceActor - Actor being transformed (original form)
   * @param {Actor} targetActor - Actor to transform into (new form)
   * @returns {Actor} Sanitized target actor or original if no sanitization needed
   * @private
   */
  static _sanitizeTargetActor(sourceActor, targetActor) {
    if (!sourceActor?.system?.abilities || !targetActor?.system?.abilities) {
      return targetActor;
    }

    const sourceData = sourceActor.toObject();
    const targetData = targetActor.toObject();

    const sourceAbilityKeys = Object.keys(sourceData.system.abilities);
    const targetAbilityKeys = Object.keys(targetData.system.abilities);

    LogUtil.log(`Sanitization check - Source (${sourceActor.name}) toObject:`, sourceAbilityKeys);
    LogUtil.log(`Sanitization check - Target (${targetActor.name}) toObject:`, targetAbilityKeys);

    const extraAbilities = targetAbilityKeys.filter(key => !sourceAbilityKeys.includes(key));

    if (extraAbilities.length === 0) {
      LogUtil.log('No extra abilities found in serialized data - skipping sanitization');
      return targetActor;
    }

    LogUtil.log(`Sanitizing target actor ${targetActor.name}: removing abilities not present in source toObject`, extraAbilities);

    for (const abilityKey of extraAbilities) {
      delete targetData.system.abilities[abilityKey];
    }

    LogUtil.log('Sanitized data abilities:', Object.keys(targetData.system.abilities));

    const TempActor = CONFIG.Actor.documentClass;
    const tempActor = new TempActor(targetData, { temporary: true });

    LogUtil.log('Temp actor abilities after creation:', Object.keys(tempActor.system.abilities));

    return tempActor;
  }
}
