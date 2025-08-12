import { MODULE } from '../../constants/General.mjs';
import { LogUtil } from '../LogUtil.mjs';
import { adjustMenuOffset } from '../helpers/Helpers.mjs';
import { GeneralUtil } from '../helpers/GeneralUtil.mjs';

/**
 * Utility class for drag and position handling in the Roll Requests Menu
 */
export class RollMenuDragUtil {
  static SNAP_DISTANCE = 50; // pixels
  static DRAG_HANDLE_SELECTOR = '.drag-handle';
  static LIGHTNING_BOLT_SELECTOR = '#flash-rolls-icon';
  
  /**
   * Initialize drag functionality for the menu
   * @param {RollRequestsMenu} menu - The menu instance
   */
  static initializeDrag(menu) {
    const dragHandle = menu.element.querySelector(this.DRAG_HANDLE_SELECTOR);
    
    if (!dragHandle) {
      LogUtil.error('RollMenuDragUtil.initializeDrag - No drag handle found!');
      return;
    }
    
    dragHandle.addEventListener('mousedown', (e) => {
      this.handleDragStart(e, menu);
    });
    
    const customPosition = this.loadCustomPosition();
    if (customPosition?.isCustom) {
      this.applyCustomPosition(menu, customPosition);
    }
  }
  
  /**
   * Handle drag start
   * @param {MouseEvent} event 
   * @param {RollRequestsMenu} menu 
   */
  static handleDragStart(event, menu) {
    event.preventDefault();
    event.stopPropagation();

    menu.isDragging = true;
    if(!menu.element){return}
    menu.element.classList.add('dragging');
    
    const menuRect = menu.element.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const initialLeft = menuRect.left;
    const initialTop = menuRect.top;
    
    const parent = menu.element.parentElement;

    document.body.appendChild(menu.element);
    menu.element.style.position = 'fixed';
    menu.element.style.inset = '';  // Clear inset first
    menu.element.style.top = `${initialTop}px`;
    menu.element.style.left = `${initialLeft}px`;
    menu.element.style.right = 'auto';
    menu.element.style.bottom = 'auto';
    menu.element.style.zIndex = 'var(--z-index-app)'; // Ensure it's on top while dragging
    
    menu.element.offsetHeight;
    
    // Store drag data
    const dragData = {
      startX,
      startY,
      initialLeft,
      initialTop,
      currentLeft: initialLeft,
      currentTop: initialTop
    };
    
    // Create move and up handlers
    const handleMove = (e) => this.handleDragMove(e, menu, dragData);
    const handleUp = (e) => this.handleDragEnd(e, menu, dragData, handleMove, handleUp);
    
    // Add document-level listeners
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }
  
  /**
   * Handle drag move
   * @param {MouseEvent} event 
   * @param {RollRequestsMenu} menu 
   * @param {Object} dragData 
   */
  static handleDragMove(event, menu, dragData) {
    if (!menu.isDragging) return;
    const deltaX = event.clientX - dragData.startX;
    const deltaY = event.clientY - dragData.startY;
    
    dragData.currentLeft = dragData.initialLeft + deltaX;
    dragData.currentTop = dragData.initialTop + deltaY;
    
    menu.element.style.inset = '';
    menu.element.style.right = 'auto';
    menu.element.style.bottom = 'auto';
    
    menu.element.style.position = 'fixed';
    menu.element.style.top = `${dragData.currentTop}px`;
    menu.element.style.left = `${dragData.currentLeft}px`;
    
    const computed = window.getComputedStyle(menu.element);

    const distance = this.calculateSnapDistance(menu);
    if (distance < this.SNAP_DISTANCE) {
      menu.element.classList.add('near-snap');
    } else {
      menu.element.classList.remove('near-snap');
    }
  }
  
  /**
   * Handle drag end
   * @param {MouseEvent} event 
   * @param {RollRequestsMenu} menu 
   * @param {Object} dragData 
   * @param {Function} moveHandler 
   * @param {Function} upHandler 
   */
  static async handleDragEnd(event, menu, dragData, moveHandler, upHandler) {
    LogUtil.log('RollMenuDragUtil.handleDragEnd');
    
    document.removeEventListener('mousemove', moveHandler);
    document.removeEventListener('mouseup', upHandler);
    
    menu.isDragging = false;
    menu.element.classList.remove('dragging');
    menu.element.classList.remove('near-snap');
    
    menu.element.style.zIndex = '';
    
    const distance = this.calculateSnapDistance(menu);
    
    if (distance < this.SNAP_DISTANCE) {
      const chatNotifications = document.querySelector('#chat-notifications');
      if (chatNotifications) {
        chatNotifications.insertBefore(menu.element, chatNotifications.firstChild);
      }
      await this.snapToDefault(menu);
    } else {
      menu.isCustomPosition = true;
      menu.customPosition = {
        x: dragData.currentLeft,
        y: dragData.currentTop,
        isCustom: true
      };
      
      GeneralUtil.addCSSVars('--flash-rolls-menu-offset', '0px');
      
      await this.saveCustomPosition(menu.customPosition);
      menu.element.classList.add('custom-position');
    }
  }
  
  /**
   * Check if menu should snap to default position
   * @param {RollRequestsMenu} menu 
   * @returns {boolean} True if within snap zone
   */
  static calculateSnapDistance(menu) {
    const lightningBolt = document.querySelector(this.LIGHTNING_BOLT_SELECTOR);
    if (!lightningBolt) return Infinity;
    
    const menuRect = menu.element.getBoundingClientRect();
    const boltRect = lightningBolt.getBoundingClientRect();
    
    const horizontalDistance = Math.abs(boltRect.left - menuRect.right);
    const distanceFromBottom = window.innerHeight - menuRect.bottom;
    
    return Math.max(
      horizontalDistance > 50 ? Infinity : horizontalDistance,
      distanceFromBottom > 50 ? Infinity : distanceFromBottom
    );
  }
  
  /**
   * Snap menu back to default position
   * @param {RollRequestsMenu} menu 
   */
  static async snapToDefault(menu) {
    LogUtil.log('RollMenuDragUtil.snapToDefault');
    
    menu.isCustomPosition = false;
    menu.customPosition = null;
    
    menu.element.classList.remove('custom-position');
    menu.element.classList.add('snapping');
    
    menu.element.style.position = '';
    menu.element.style.inset = '';
    menu.element.style.left = '';
    menu.element.style.top = '';
    menu.element.style.right = '';
    menu.element.style.bottom = '';
    menu.element.style.zIndex = '';  
    
    adjustMenuOffset();
    
    await this.saveCustomPosition(null);
    
    setTimeout(() => {
      menu.element.classList.remove('snapping');
    }, 300);
  }
  
  /**
   * Apply custom position to menu
   * @param {RollRequestsMenu} menu 
   * @param {Object} position 
   */
  static applyCustomPosition(menu, position) {
    if (!position || !position.isCustom) return;
    
    LogUtil.log('RollMenuDragUtil.applyCustomPosition', [position]);
    
    menu.isCustomPosition = true;
    menu.customPosition = position;
    
    document.body.appendChild(menu.element);
    
    menu.element.style.position = 'fixed';
    menu.element.style.inset = '';  // Clear inset first
    menu.element.style.top = `${position.y}px`;
    menu.element.style.left = `${position.x}px`;
    menu.element.style.right = 'auto';
    menu.element.style.bottom = 'auto';
    
    GeneralUtil.addCSSVars('--flash-rolls-menu-offset', '0px');
    
    menu.element.classList.add('custom-position');
  }
  
  /**
   * Save custom position to user flag
   * @param {Object|null} position 
   */
  static async saveCustomPosition(position) {
    await game.user.setFlag(MODULE.ID, 'menuCustomPosition', position);
  }
  
  /**
   * Load custom position from user flag
   * @returns {Object|null} Position object or null
   */
  static loadCustomPosition() {
    return game.user.getFlag(MODULE.ID, 'menuCustomPosition') || null;
  }
  
  /**
   * Reset menu to default position
   * @param {RollRequestsMenu} menu 
   */
  static async resetPosition(menu) {
    await this.snapToDefault(menu);
  }
}