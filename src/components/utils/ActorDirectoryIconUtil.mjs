import { ActorStatusUtil } from '../ActorStatusUtil.mjs';
import { LogUtil } from '../LogUtil.mjs';
import { HOOKS_CORE } from '../../constants/Hooks.mjs';

/**
 * Utility class for managing Flash Rolls status icons in the Actor Directory
 */
export class ActorDirectoryIconUtil {
  /**
   * Initialize the Actor Directory icon system
   */
  static initialize() {
    LogUtil.log('ActorDirectoryIconUtil.initialize');
    
    // Hook into Actor Directory renders
    Hooks.on(HOOKS_CORE.RENDER_ACTOR_DIRECTORY, this.onRenderActorDirectory.bind(this));
    
    // Hook into actor flag changes to update icons
    Hooks.on(HOOKS_CORE.UPDATE_ACTOR, this.onUpdateActor.bind(this));
    
    // Update any already-rendered Actor Directory
    this.updateExistingDirectory();
  }

  /**
   * Update icons in an already-rendered Actor Directory
   */
  static updateExistingDirectory() {
    // Find any existing Actor Directory
    const actorDirectory = ui.actors;
    if (actorDirectory && actorDirectory.rendered && actorDirectory.element) {
      LogUtil.log('ActorDirectoryIconUtil.updateExistingDirectory - Found rendered directory, adding icons');
      this.onRenderActorDirectory(actorDirectory, actorDirectory.element);
    } else {
      LogUtil.log('ActorDirectoryIconUtil.updateExistingDirectory - No rendered directory found');
    }
  }

  /**
   * Handle Actor Directory render to add status icons
   * @param {ActorDirectory} app - The Actor Directory application
   * @param {HTMLElement} html - The rendered HTML
   */
  static onRenderActorDirectory(app, html) {
    LogUtil.log('ActorDirectoryIconUtil.onRenderActorDirectory', [app, html]);
    
    const actorItems = html.querySelectorAll('.directory-item.actor');
    actorItems.forEach((element) => {
      const actorId = element.dataset.entryId || element.dataset.documentId;
      if (actorId) {
        this.updateActorIcon(element, actorId);
      }
    });
  }

  /**
   * Handle actor updates to refresh icons when status changes
   * @param {Actor} actor - The updated actor
   * @param {Object} changes - The changes made to the actor
   */
  static onUpdateActor(actor, changes) {
    const flagChanges = changes.flags?.['flash-rolls-5e'];
    if (flagChanges) {
      LogUtil.log('ActorDirectoryIconUtil.onUpdateActor - Flash Rolls flags changed', [actor.name, flagChanges]);
      this.refreshActorIcon(actor.id);
    }
  }

  /**
   * Update the Flash Rolls status icon for a specific actor element
   * @param {HTMLElement} actorElement - The actor directory item element
   * @param {string} actorId - The actor ID
   */
  static updateActorIcon(actorElement, actorId) {
    const existingIcon = actorElement.querySelector('span.fas.fa-bolt, span.fas.fa-bolt-slash');
    if (existingIcon) {
      existingIcon.remove();
    }

    const actor = game.actors.get(actorId);
    if (!actor) return;

    const isFavorite = ActorStatusUtil.isFavorite(actor);
    const isBlocked = ActorStatusUtil.isBlocked(actor);

    if (!isFavorite && !isBlocked) return;
    const icon = document.createElement('span');
    
    if (isBlocked) {
      icon.className = 'fas fa-bolt-slash';
      icon.title = 'Blocked from Flash Rolls menu';
    } else if (isFavorite) {
      icon.className = 'fas fa-bolt';
      icon.title = 'Added to Flash Rolls menu';
    }
    actorElement.appendChild(icon);
  }

  /**
   * Refresh the icon for a specific actor by ID
   * @param {string} actorId - The actor ID
   */
  static refreshActorIcon(actorId) {
    const actorElement = document.querySelector(`.directory-item.actor[data-entry-id="${actorId}"], .directory-item.actor[data-document-id="${actorId}"]`);
    if (actorElement) {
      this.updateActorIcon(actorElement, actorId);
    }
  }

  /**
   * Refresh all actor icons in the directory
   */
  static refreshAllIcons() {
    LogUtil.log('ActorDirectoryIconUtil.refreshAllIcons');
    
    const actorItems = document.querySelectorAll('.directory-item.actor');
    actorItems.forEach(element => {
      const actorId = element.dataset.entryId || element.dataset.documentId;
      if (actorId) {
        this.updateActorIcon(element, actorId);
      }
    });
  }
}