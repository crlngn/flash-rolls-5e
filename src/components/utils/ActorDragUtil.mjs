import { LogUtil } from '../LogUtil.mjs';
import { ActorStatusUtil } from '../ActorStatusUtil.mjs';

/**
 * Utility class for handling drag-to-remove functionality for actors in the Roll Requests Menu
 */
export class ActorDragUtil {
  /**
   * Initialize drag functionality for actor list items
   * @param {RollRequestsMenu} menu - The menu instance
   */
  static initializeActorDrag(menu) {
    const actorElements = menu.element.querySelectorAll('.actor-list .actor.drag-wrapper[draggable="true"]');
    
    actorElements.forEach(actorElement => {
      actorElement.addEventListener('dragstart', (e) => this.handleDragStart(e, menu));
      actorElement.addEventListener('dragend', (e) => this.handleDragEnd(e, menu));
    });
    
    const menuContainer = menu.element;
    menuContainer.addEventListener('dragover', (e) => this.handleDragOver(e));
    menuContainer.addEventListener('drop', (e) => this.handleDrop(e, menu));
    
    document.addEventListener('dragover', (e) => this.handleGlobalDragOver(e, menu));
    document.addEventListener('drop', (e) => this.handleGlobalDrop(e, menu));
  }
  
  /**
   * Handle drag start event
   * @param {DragEvent} event 
   * @param {RollRequestsMenu} menu 
   */
  static handleDragStart(event, menu) {
    const actorElement = event.currentTarget;
    const actorId = actorElement.dataset.actorId;
    const actor = game.actors.get(actorId);
    
    if (!actor) {
      event.preventDefault();
      return;
    }
    
    LogUtil.log('ActorDragUtil.handleDragStart', [actor.name, actorId]);
    
    event.dataTransfer.setData('text/plain', actorId);
    event.dataTransfer.setData('application/json', JSON.stringify({
      actorId: actorId,
      actorName: actor.name,
      uniqueId: actorElement.dataset.id,
      tokenId: actorElement.dataset.tokenId || null
    }));
    
    event.dataTransfer.effectAllowed = 'move';
    actorElement.classList.add('dragging');
    
    const rect = actorElement.getBoundingClientRect();
    const dragImage = actorElement.cloneNode(true);
    dragImage.style.opacity = '0.6';
    dragImage.style.position = 'absolute';
    dragImage.style.top = '-1000px';
    dragImage.style.left = '-1000px';
    dragImage.style.width = rect.width + 'px';
    dragImage.style.pointerEvents = 'none';
    document.body.appendChild(dragImage);
    
    event.dataTransfer.setDragImage(dragImage, rect.width / 2, rect.height / 2);
    
    setTimeout(() => {
      if (dragImage.parentNode) {
        dragImage.parentNode.removeChild(dragImage);
      }
    }, 0);
    
    menu._currentDragData = {
      actorId: actorId,
      actorElement: actorElement,
      startTime: Date.now()
    };
  }
  
  /**
   * Handle drag over event within the menu
   * @param {DragEvent} event 
   */
  static handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'none';
  }
  
  /**
   * Handle drop event within the menu
   * @param {DragEvent} event 
   * @param {RollRequestsMenu} menu 
   */
  static handleDrop(event, menu) {
    event.preventDefault();
    LogUtil.log('ActorDragUtil.handleDrop - dropped within menu, canceling remove');
    
    this.cleanupDrag(menu);
  }
  
  /**
   * Handle global drag over (outside the menu)
   * @param {DragEvent} event 
   * @param {RollRequestsMenu} menu 
   */
  static handleGlobalDragOver(event, menu) {
    if (!menu._currentDragData) return;
    
    const menuRect = menu.element.getBoundingClientRect();
    const isOverMenu = (
      event.clientX >= menuRect.left &&
      event.clientX <= menuRect.right &&
      event.clientY >= menuRect.top &&
      event.clientY <= menuRect.bottom
    );
    
    if (!isOverMenu) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      
      if (menu._currentDragData.actorElement) {
        menu._currentDragData.actorElement.classList.add('drag-remove-zone');
      }
    } else {
      if (menu._currentDragData.actorElement) {
        menu._currentDragData.actorElement.classList.remove('drag-remove-zone');
      }
    }
  }
  
  /**
   * Handle global drop (outside the menu)
   * @param {DragEvent} event 
   * @param {RollRequestsMenu} menu 
   */
  static handleGlobalDrop(event, menu) {
    if (!menu._currentDragData) return;
    
    const menuRect = menu.element.getBoundingClientRect();
    const isOverMenu = (
      event.clientX >= menuRect.left &&
      event.clientX <= menuRect.right &&
      event.clientY >= menuRect.top &&
      event.clientY <= menuRect.bottom
    );
    
    if (!isOverMenu) {
      event.preventDefault();
      
      const dragData = JSON.parse(event.dataTransfer.getData('application/json'));
      LogUtil.log('ActorDragUtil.handleGlobalDrop - blocking actor', [dragData.actorName]);
      
      this.blockActor(dragData.actorId, menu);
    }
    
    this.cleanupDrag(menu);
  }
  
  /**
   * Handle drag end event
   * @param {DragEvent} event 
   * @param {RollRequestsMenu} menu 
   */
  static handleDragEnd(event, menu) {
    LogUtil.log('ActorDragUtil.handleDragEnd');
    
    setTimeout(() => {
      this.cleanupDrag(menu);
    }, 100);
  }
  
  /**
   * Block an actor by setting the blocked flag
   * @param {string} actorId - The actor ID to block
   * @param {RollRequestsMenu} menu - The menu instance
   */
  static async blockActor(actorId, menu) {
    try {
      await ActorStatusUtil.blockActor(actorId);
      
      const actorElement = menu.element.querySelector(`[data-actor-id="${actorId}"]`);
      if (actorElement) {
        const uniqueId = actorElement.dataset.id;
        menu.selectedActors.delete(uniqueId);
      }
      
      // Let the ActorStatusUtil._refreshMenu() handle the re-render automatically
      
    } catch (error) {
      LogUtil.error('Error blocking actor', [error]);
      ui.notifications.error(`Failed to block actor: ${error.message}`);
    }
  }
  
  /**
   * Clean up drag-related state and visual feedback
   * @param {RollRequestsMenu} menu 
   */
  static cleanupDrag(menu) {
    if (menu._currentDragData?.actorElement) {
      menu._currentDragData.actorElement.classList.remove('dragging', 'drag-remove-zone');
    }
    
    menu._currentDragData = null;
  }
  
  /**
   * Remove drag event listeners (for cleanup)
   * @param {RollRequestsMenu} menu 
   */
  static removeDragListeners(menu) {
    document.removeEventListener('dragover', this.handleGlobalDragOver);
    document.removeEventListener('drop', this.handleGlobalDrop);
  }
}