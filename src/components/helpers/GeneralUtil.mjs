import { LogUtil } from "../LogUtil.mjs";
import { SettingsUtil } from "../SettingsUtil.mjs";

/**
 * Utility class providing general-purpose functionality for the module */
export class GeneralUtil {
  /**
   * Checks if module is currently installed and active
   * @param {string} moduleName 
   * @returns {boolean}
   */
  static isModuleOn(moduleName){
    const module = game.modules?.get(moduleName);
    return Boolean(module?.active);
  }

  /**
   * Finds and returns the first element matching the selector within the parent element
   * @param {HTMLElement} parent - The parent element to search within
   * @param {string} selector - CSS selector string
   * @returns {HTMLElement|null} The first matching element or null if not found
   */
  static html(parent, selector) {
    return parent.querySelector(selector);
  }

  /**
   * Gets the full width of an element including margins and borders
   * @param {HTMLElement} element - The element to measure
   * @returns {number} The full width in pixels
   */
  static getFullWidth(element) {
    const style = window.getComputedStyle(element);
    if (style.width === '0px') {
      return 0;
    }
    return element.offsetWidth;
  }

  /**
   * Prevents dialog flicker by applying opacity transition
   * @param {HTMLElement} element - The dialog element to apply the transition to
   * @param {number} delay - Delay in milliseconds before fading in (default: 100)
   */
  static preventDialogFlicker(element, delay = 100) {
    if (!element) return;
    
    element.style.opacity = '0';
    element.style.transition = 'opacity 0.15s ease-in';
    
    setTimeout(() => {
      if (element) {
        element.style.opacity = '1';
      }
    }, delay);
  }

  /**
   * Adds CSS variables to a style element
   * @param {string} varName 
   * @param {string} varValue 
   */
  static addCSSVars(varName, varValue) {
    let bodyStyle = document.querySelector('#flash5e-vars');
    
    if (!bodyStyle) {
      const body = document.querySelector('body.flash5e');
      if(!body){return}
      bodyStyle = document.createElement('style');
      bodyStyle.id = 'flash5e-vars';
      bodyStyle.textContent = 'body.flash5e {\n}\n';
      body.prepend(bodyStyle);
    }
    
    let cssText = bodyStyle.textContent;
    
    let ruleStart = cssText.indexOf('body.flash5e {');
    let ruleEnd = cssText.indexOf('}', ruleStart);
    
    if (ruleStart === -1) {
      cssText = 'body.flash5e {\n}\n';
      ruleStart = 0;
      ruleEnd = cssText.indexOf('}');
    }
    
    const rulePart = cssText.substring(ruleStart + 'body.flash5e {'.length, ruleEnd);
    
    const declarations = rulePart.split(';')
      .map(decl => decl.trim())
      .filter(decl => decl !== '');
    
    const varsMap = {};
    declarations.forEach(decl => {
      const parts = decl.split(':');
      if (parts.length >= 2) {
        const name = parts[0].trim();
        const value = parts.slice(1).join(':').trim(); // Handle values that might contain colons
        if (name) varsMap[name] = value;
      }
    });
    
    if (varName.includes('i18n') && 
        typeof varValue === 'string' && 
        !varValue.startsWith('"') && 
        !varValue.startsWith("'") && 
        !varValue.match(/^url\(|^rgba?\(|^hsla?\(/)) {
      varValue = `"${varValue}"`;
    }
    
    varsMap[varName] = varValue;
    
    const newRuleContent = Object.entries(varsMap)
      .map(([name, value]) => `  ${name}: ${value};`)
      .join('\n');
    
    const newCss = 
      cssText.substring(0, ruleStart) + 
      'body.flash5e {\n' + 
      newRuleContent + 
      '\n}' + 
      cssText.substring(ruleEnd + 1);
    
    bodyStyle.textContent = newCss;
  }
  
  /**
   * Gets the offset bottom of an element
   * @param {HTMLElement} element 
   * @returns {number}
   */
  static getOffsetBottom(element) {
    const offsetTop = element.offsetTop;
    const elementHeight = element.offsetHeight;
    return window.innerHeight - (offsetTop + elementHeight);
  }

  /**
   * Retrieves a list of all available fonts
   * @returns {Promise<string[]>}
   */
  static async getAllFonts() {
    const foundryFonts = new Set(Object.keys(CONFIG.fontDefinitions));
    const customFontsObj = game.settings.get("core", "fonts") || {};
    const customFonts = Object.entries(customFontsObj).map(([fontFamily]) => fontFamily);
  
    const cssImportedFonts = await this.processStyleSheets();
  
    const allFonts = Array.from(new Set([
      ...foundryFonts,
      ...customFonts,
      ...cssImportedFonts
    ]))
    .filter(f => !/FontAwesome|Font Awesome|FoundryVTT/.test(f))
    .map(f => f.replace(/['"]/g, '').trim())
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

    return allFonts || [];
  }

  // Helper function to format font names
  /**
   * Formats a font name by cleaning it and wrapping it in quotes if it contains spaces
   * @param {string} fontName - The font name to format
   * @returns {string} The formatted font name
   */
  static wrapFontName = (fontName) => {
    const cleanName = fontName.replace(/['"`]/g, '');
    return cleanName.includes(' ') ? `"${cleanName}"` : cleanName;
  }

  /**
   * Adds custom CSS to a style element
   * @param {string} content - CSS content to add
   * @param {string} [id='flash5e-custom-css'] - ID for the style element
   * @param {boolean} [checkForDuplicates=true] - Whether to check for duplicate rules
   */
  static addCustomCSS(content, id = 'flash5e-custom-css', checkForDuplicates = true) {
    if (!content) {
      return;
    }
    
    let customStyle = document.querySelector('#' + id);
    
    if (!customStyle) {
      customStyle = document.createElement('style');
      customStyle.id = id;
      customStyle.textContent = '';
      document.head.appendChild(customStyle);
    }

    const importRegex = /@import\s+(?:url\()?\s*['"]?[^'")]+['"]?\s*\)?\s*;/g;
    const imports = [];
    let contentWithoutImports = content;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[0]);
    }
    
    contentWithoutImports = content.replace(importRegex, '').trim();
    
    if (!checkForDuplicates) {
      customStyle.textContent = imports.join('\n') + (imports.length ? '\n\n' : '') + contentWithoutImports;
      return;
    }
    
    if (!customStyle.textContent.includes(contentWithoutImports)) {
      const currentContent = customStyle.textContent;
      const existingImports = [];
      let currentMatch;
      while ((currentMatch = importRegex.exec(currentContent)) !== null) {
        existingImports.push(currentMatch[0]);
      }
      
      const currentContentWithoutImports = currentContent.replace(importRegex, '').trim();
      const newImports = imports.filter(imp => !existingImports.includes(imp));
      const allImports = [...existingImports, ...newImports];
      customStyle.textContent = allImports.join('\n') + 
                               (allImports.length ? '\n\n' : '') + 
                               currentContentWithoutImports +
                               (currentContentWithoutImports && contentWithoutImports ? '\n\n' : '') +
                               contentWithoutImports;
    }
  }
  
  /**
   * Performs a smooth scroll with custom duration
   * @param {HTMLElement} element - The element to scroll
   * @param {number} to - The target scroll position
   * @param {string} [direction="horizontal"] - The scroll direction ("horizontal" or "vertical")
   * @param {number} [duration=300] - Duration of the animation in milliseconds
   * @param {Function} [onComplete] - Optional callback to run when animation completes
   * @returns {number} Animation ID that can be used to cancel the animation
   */
  static smoothScrollTo(element, to, direction = "horizontal", duration = 300, onComplete = null) {
    // Cancel any existing animation if it has the same ID as the element
    const animationId = element.dataset.scrollAnimationId;
    if (animationId) {
      cancelAnimationFrame(Number(animationId));
    }
    
    // Determine if we're scrolling horizontally or vertically
    const isHorizontal = direction === "horizontal";
    const start = isHorizontal ? element.scrollLeft : element.scrollTop;
    const change = to - start;
    
    // If there's no change or the element isn't scrollable, exit early
    if (change === 0) {
      if (onComplete) onComplete();
      return null;
    }
    
    const startTime = performance.now();
    
    const animateScroll = (currentTime) => {
      const elapsedTime = currentTime - startTime;
      
      if (elapsedTime >= duration) {
        if (isHorizontal) {
          element.scrollLeft = to;
        } else {
          element.scrollTop = to;
        }
        
        delete element.dataset.scrollAnimationId;
        if (onComplete) onComplete();
        return;
      }
      
      const progress = elapsedTime / duration;
      const easeProgress = progress < 0.5 
        ? 2 * progress * progress 
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      
      if (isHorizontal) {
        element.scrollLeft = start + change * easeProgress;
      } else {
        element.scrollTop = start + change * easeProgress;
      }
      
      const newAnimationId = requestAnimationFrame(animateScroll);
      element.dataset.scrollAnimationId = newAnimationId;
      return newAnimationId;
    };
    
    const newAnimationId = requestAnimationFrame(animateScroll);
    element.dataset.scrollAnimationId = newAnimationId;
    return newAnimationId;
  }

  /**
   * Opens a confirmation dialog to reload the page using DialogV2
   * @param {string} [title=""] - The title of the confirmation dialog
   * @param {string} [content=""] - The content message
   * @param {Object} [options={}] - Additional dialog options
   * @returns {Promise<boolean>} Resolves to true if confirmed, false otherwise
   */
  static confirmReload(
    title = game.i18n.localize("FLASH_ROLLS.ui.reloadRequiredTitle"), 
    content = game.i18n.localize("FLASH_ROLLS.ui.reloadRequiredLabel"),
    options = {}) {
    
    const dialogConfig = {
      window: {
        title
      },
      position: {
        width: 420,
        height: "auto"
      },
      content,
      yes: {
        label: game.i18n.localize("FLASH_ROLLS.ui.reloadButton"),
        callback: () => {
          LogUtil.log("Reloading page after confirmation");
          window.location.reload();
          return true;
        }
      },
      no: {
        label: game.i18n.localize("FLASH_ROLLS.ui.cancelButton"),
        callback: () => false
      },
      defaultYes: false,
      rejectClose: false
    };
    
    mergeObject(dialogConfig, options);
    return foundry.applications.api.DialogV2.confirm(dialogConfig);
  }

  /**
   * Alias for Foundry's method to render Handlebars template
   * @param {string} templatePath 
   * @param {Object} data 
   * @returns {Promise<string>} Rendered template HTML
   */
  static renderTemplate(templatePath, data){
    return foundry.applications.handlebars.renderTemplate(templatePath, data);
  }

  /**
   * Alias for Foundry's method to load Handlebars template
   * @param {string} templatePath 
   * @returns {Promise<HandlebarsTemplate>} Loaded template object
   */
  static loadTemplate(templatePath){
    return foundry.applications.handlebars.loadTemplate(templatePath);
  }

  /**
   * Alias for Foundry's method to load Handlebars template
   * @param {string[]} templatePaths 
   * @returns {Promise<HandlebarsTemplate>} Loaded template object
   */
  static loadTemplates(templatePaths){
    if(!Array.isArray(templatePaths)) templatePaths = [templatePaths];
    return foundry.applications.handlebars.loadTemplates(templatePaths);
  }

  /**
   * Validates if a string is a valid CSS rule or selector
   * @param {string} cssString - CSS rule or selector to validate
   * @return {boolean} Whether the CSS is valid
   */
  static isValidCSSRule(cssString) {
    if (!cssString || typeof cssString !== "string") return false;
    const trimmedCSS = cssString.trim();
    if (!trimmedCSS) return false;
    try {
      const style = document.createElement("style");
      const testCSS = `${trimmedCSS} { color: inherit; }`;
      style.textContent = testCSS;
      document.head.appendChild(style);
      const isValid = Boolean(style.sheet && style.sheet.cssRules && style.sheet.cssRules.length > 0);
      document.head.removeChild(style);
      return isValid;
    } catch (error) {
      LogUtil.log("CSS validation error:", [error, cssString]);
      return false;
    }
  }

  /**
   * Processes CSS rules with nested selectors to create valid CSS for multiple target selectors
   * @param {string} cssRules - CSS rules that may contain nested selectors
   * @param {string} targetSelectors - Comma-separated list of selectors to apply the rules to
   * @return {string} Valid CSS with properly combined selectors
   */
  static processCSSRules(cssRules, targetSelectors) {
    if (!cssRules || !targetSelectors) return "";
    const parsedCSS = this.#parseCSS(cssRules);
    const mainStyle = targetSelectors + " {\n" + parsedCSS.baseProperties.join("\n") + "\n}";
    const processedRules = [];
    const rulesByContent = new Map();
    
    parsedCSS.nestedRules.forEach(rule => {
      const { selector, content } = rule;
      
      if (selector.startsWith("&")) {
        const pseudoSelector = selector.substring(1);
        const combinedSelectors = targetSelectors.split(",")
          .map(s => s.trim())
          .filter(Boolean)
          .map(s => s + pseudoSelector)
          .join(", ");
        
        processedRules.push(`${combinedSelectors} {\n${content}\n}`);
        return;
      }
      
      if (!rulesByContent.has(content)) {
        rulesByContent.set(content, []);
      }
      
      const selectors = selector.split(",").map(s => s.trim());
      const targetList = targetSelectors.split(",").map(s => s.trim()).filter(Boolean);
      
      selectors.forEach(nestedSelector => {
        targetList.forEach(targetSelector => {
          rulesByContent.get(content).push(`${targetSelector} ${nestedSelector}`);
        });
      });
    });
    
    rulesByContent.forEach((selectors, content) => {
      processedRules.push(`${selectors.join(", ")} {\n${content}\n}`);
    });
    
    return mainStyle + "\n\n" + processedRules.join("\n\n");
  }
  
  /**
   * Parses CSS string into a structured format with base properties and nested rules
   * @param {string} css - CSS string to parse
   * @return {Object} Object with baseProperties array and nestedRules array
   * @private
   */
  static #parseCSS(css) {
    const baseProperties = [];
    const nestedRules = [];
    const lines = css.split("\n");
    
    let currentNested = null;
    let braceCount = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;
      
      if (line.includes("{") && !currentNested) {
        const selector = line.substring(0, line.indexOf("{")).trim();
        currentNested = { selector, content: "", startLine: i };
        braceCount = 1;
        
        const contentAfterBrace = line.substring(line.indexOf("{") + 1).trim();
        if (contentAfterBrace && !contentAfterBrace.includes("}")) {
          currentNested.content += contentAfterBrace + "\n";
        }
      } else if (currentNested) {
        braceCount += openBraces - closeBraces;
        
        if (braceCount > 0) {
          currentNested.content += line + "\n";
        } 
        else {
          currentNested.content = currentNested.content.replace(/}\s*$/, "").trim();
          nestedRules.push(currentNested);
          currentNested = null;
        }
      } else if (!line.includes("{") && !line.includes("}")) {
        baseProperties.push(line);
      }
    }
    
    return { baseProperties, nestedRules };
  }

  /**
   * Get the player owner of an actor
   * @param {Actor} actor 
   * @returns {User|null}
   */
  static getActorOwner(actor) {
    const ownership = actor.ownership || {};

    for (const [userId, level] of Object.entries(ownership)) {
      if (level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) {
        const user = game.users.get(userId);
        if (user && !user.isGM) {
          return user;
        }
      }
    }

    if(ownership?.default >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER){
      const user = game.users.filter(user => !user.isGM)[0];
      if (user) {
        return user;
      }
    }
    
    return null;
  }

  /**
   * Opens a confirmation dialog to reload the page using DialogV2
   * @param {string} [title=""] - The title of the confirmation dialog
   * @param {string} [content=""] - The content message
   * @param {Object} [options={}] - Additional dialog options
   * @returns {Promise<boolean>} Resolves to true if confirmed, false otherwise
   */
  static confirmReload(
    title = game.i18n.localize("FLASH_ROLLS.ui.dialogs.reloadRequiredTitle"), 
    content = game.i18n.localize("FLASH_ROLLS.ui.dialogs.reloadRequiredLabel"),
    options = {}) {
    
    const dialogConfig = {
      window: {
        title
      },
      position: {
        width: 420,
        height: "auto"
      },
      content,
      yes: {
        label: game.i18n.localize("FLASH_ROLLS.ui.buttons.reloadButton"),
        callback: () => {
          LogUtil.log("Reloading page after confirmation");
          window.location.reload();
          return true;
        }
      },
      no: {
        label: game.i18n.localize("FLASH_ROLLS.ui.buttons.cancelButton"),
        callback: () => false
      },
      defaultYes: false,
      rejectClose: false
    };
    
    mergeObject(dialogConfig, options);
    return foundry.applications.api.DialogV2.confirm(dialogConfig);
  }
}
