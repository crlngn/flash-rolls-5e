# Flash Rolls 5e Module Architecture

## Overview
Flash Rolls 5e (flash-rolls-5e) is a FoundryVTT module that enables GMs to request rolls from players through socket-based communication. The module intercepts D&D5e roll events and can redirect them to players with custom configuration.

## Module Structure Overview
The module follows a modular architecture with clear separation of concerns:

### Core Components
- **Main.mjs**: Core initialization and module coordination
- **RollRequestUtil.mjs**: Handles incoming roll requests from GM to players
- **RollInterceptor.mjs**: Intercepts rolls from character sheets
- **HooksUtil.mjs**: Centralized hook management
- **RollHandlers.mjs**: Roll type handlers for all roll types

### Helper Components
- **helpers/Helpers.mjs**: General utility functions, presentation utilities
- **helpers/RollHelpers.mjs**: Roll configuration helpers (buildRollConfig, addSituationalBonus, ensureRollFlags)
- **helpers/RollValidationHelpers.mjs**: Roll validation utilities (combat, initiative, death saves)
- **helpers/ModuleHelpers.mjs**: Module detection and compatibility helpers

### Utility Components
- **DiceConfigUtil.mjs**: Dice configuration management
- **SocketUtil.mjs**: Socket communication wrapper
- **SettingsUtil.mjs**: Module settings management
- **ActivityUtil.mjs**: D&D5e activity-based rolls
- **SidebarUtil.mjs**: Sidebar controls management
- **LogUtil.mjs**: Debug logging utility

### UI Components
- **RollRequestsMenu.mjs**: GM interface for roll requests
- **dialogs/GMRollConfigDialog.mjs**: Extended roll configuration dialogs with mixin pattern
- **dialogs/CustomRollDialog.mjs**: Custom roll formula dialog (Note: CustomRollDialog is still in components/)

## Core Components

### 1. Main.mjs
**Purpose**: Core module initialization and coordination

#### Methods
- **`init()`**: Module initialization
  - Initializes SocketUtil with socket callbacks
  - Initializes HooksUtil for all hook management

- **`getDiceConfig()`**: Wrapper method that delegates to DiceConfigUtil

- **`receiveDiceConfig(userId, diceConfig)`**: Wrapper method that delegates to DiceConfigUtil

- **`handleRollRequest(requestData)`**: Delegates to RollRequestUtil.handleRequest()

- **`registerSocketCalls()`**: Registers socket methods with SocketUtil

### 2. HooksUtil.mjs
**Purpose**: Centralized hook management for the entire module

#### Static Properties
- `registeredHooks`: Map tracking all registered hooks for cleanup

#### Methods
- **`initialize()`**: Sets up all module hooks
  - Registers init and ready hooks

- **`_onInit()`**: Handler for Foundry init phase
  - Sets up module CSS class
  - Registers settings
  - Initializes DiceConfigUtil
  - Registers sidebar control hook

- **`_onReady()`**: Handler for Foundry ready phase
  - Initializes RollInterceptor
  - Registers D&D5e hooks
  - Registers GM-specific hooks
  - Updates sidebar state
  - Requests dice configs

- **`_registerDnd5eHooks()`**: Registers all D&D5e specific hooks
  - Post roll configuration
  - Pre-create chat message (2 handlers)
  - Render roll configuration dialog

- **`_registerGMHooks()`**: Registers GM-only hooks
  - User connected events
  - Initial dice config requests

- **`_onPostRollConfig()`**: Handles post roll configuration
  - Checks for _showRequestedBy flag to add requester info to chat message
- **`_onPreCreateChatMessage()`**: Handles pre-create chat message for requested rolls
  - Adds "[Requested by GM]" flavor text when _showRequestedBy flag is present
- **`_onPreCreateChatMessageFlavor()`**: Handles custom flavor preservation
- **`_onRenderRollConfigDialog()`**: Handles situational bonus in roll dialogs
- **`_onUserConnected()`**: Handles user connection events
- **`_onRenderSidebarTab()`**: Handles sidebar tab rendering

- **`_registerHook(hookName, handler)`**: Registers and tracks a hook

- **`unregisterAll()`**: Cleans up all registered hooks

- **`isRegistered(hookName)`**: Checks if a hook is registered

### 3. RollRequestUtil.mjs
**Purpose**: Handles incoming roll requests from GM to players

#### Methods
- **`handleRequest(requestData)`**: Main handler for incoming roll requests (player side)
  - Only processes on player side (returns early if GM)
  - Validates actor ownership
  - Applies GM targets if configured
  - Uses NotificationManager for batched notifications
  - Calls executePlayerRollRequest()

- **`executePlayerRollRequest(actor, requestData)`**: Executes the actual roll (renamed from executeRequest)
  - Extracts roll configuration from requestData.rollProcessConfig
  - Builds handlerRequestData with all necessary fields including attack-specific options:
    - Basic fields: rollKey, activityId
    - Config fields: advantage, disadvantage, situational, rollMode, target, ability
    - Attack options: attackMode, ammunition, mastery, elvenAccuracy, halflingLucky, criticalSuccess
  - Sets up dialogConfig and messageConfig
  - Uses RollHandlers to execute the appropriate roll type
  - Uses NotificationManager for error notifications

### 4. helpers/Helpers.mjs
**Purpose**: Reusable utility functions used across the module

#### Methods
- **`getRollTypeDisplay(rollType, rollKey)`**: Formats roll type for display
  - Returns localized string with details (e.g., "Skill Check (Athletics)")
  - Uses ROLL_TYPES constants

- **`showBatchedNotifications(pendingNotifications)`**: Shows consolidated notifications to players
  - Groups notifications by roll type
  - Creates single or multiple notification messages

- **`getPlayerOwner(actor)`**: Gets the player owner of an actor
  - Returns first non-GM user with OWNER permission

- **`getActorStats(actor)`**: Extracts ability scores for display
  - Returns array of stat objects with name, value, and modifier

- **`applyTargetTokens(tokenIds, user)`**: Applies target tokens to user

- **`clearTargetTokens(user)`**: Clears all target tokens for user

- **`formatMultiActorNotification(actorNames, action)`**: Formats notifications for multiple actors
  - Uses localized "and" string

- **`isPlayerOwned(actor)`**: Checks if actor is owned by a player (not GM)

- **`hasTokenInScene(actor)`**: Checks if actor has token in current scene

- **`updateCanvasTokenSelection(actorId, selected)`**: Updates token selection on canvas

- **`delay(ms)`**: Promise-based delay utility

- **`isSidebarExpanded()`**: Checks if sidebar is expanded

- **`updateSidebarClass(isExpanded)`**: Updates body class for sidebar state

- **`buildRollTypes(selectedRequestType, selectedActors)`**: Builds roll types array for menu
  - Handles tools, skills, abilities based on request type
  - Returns array of objects with id, name, rollable properties

#### NotificationManager Class
Centralized notification system with batching support:

- **`notify(type, message, options)`**: Shows notification with optional batching
  - type: 'info', 'warn', or 'error'
  - options.batch: Enable batching
  - options.batchData: Data for batched notifications

- **`notifyRollRequestsSent(requestsByPlayer, rollTypeName)`**: Shows GM-side notifications
  - Handles single/multiple player formatting
  - Consolidates multiple actor requests

- **`clearPending()`**: Clears any pending batched notifications

### 4a. helpers/ModuleHelpers.mjs
**Purpose**: Helper functions for module detection and compatibility

#### Methods
- **`isModuleActive(moduleId)`**: Checks if a module is installed and active
  - Validates module existence and active state
  - Returns boolean

- **`isModuleActive('midi-qol')`**: Checks if MidiQOL module is active
  - Returns boolean

- **`getMidiQOL()`**: Gets MidiQOL global if available
  - Returns MidiQOL object or null

### 5. RollHandlers.mjs
**Location**: `src/components/RollHandlers.mjs`

**Purpose**: Contains all roll type handlers for processing roll requests

#### RollHandlers Export
Object containing handler functions for each roll type:

- **`ability(actor, requestData, rollConfig, dialogConfig, messageConfig)`**: Handles ability check rolls
  - Uses RollHelpers.buildRollConfig to create proper configuration
  - Calls actor.rollAbilityCheck

- **`save(actor, requestData, rollConfig, dialogConfig, messageConfig)`**: Handles saving throw rolls
  - Uses RollHelpers.buildRollConfig
  - Calls actor.rollSavingThrow

- **`skill(actor, requestData, rollConfig, dialogConfig, messageConfig)`**: Handles skill check rolls
  - Includes ability selection support
  - Calls actor.rollSkill

- **`tool(actor, requestData, rollConfig, dialogConfig, messageConfig)`**: Handles tool check rolls
  - Includes ability selection support
  - Calls actor.rollToolCheck

- **`concentration(actor, requestData, rollConfig, dialogConfig, messageConfig)`**: Handles concentration rolls
  - Calls actor.rollConcentration

- **`attack(actor, requestData, rollConfig, dialogConfig, messageConfig)`**: Handles attack rolls
  - Delegates to RollHandlers.handleActivityRoll

- **`damage(actor, requestData, rollConfig, dialogConfig, messageConfig)`**: Handles damage rolls
  - Delegates to RollHandlers.handleActivityRoll

- **`itemsave(actor, requestData, rollConfig, dialogConfig, messageConfig)`**: Handles item-based saves
  - Delegates to RollHandlers.handleActivityRoll

- **`initiative(actor, requestData, rollConfig, dialogConfig, messageConfig)`**: Handles initiative rolls
  - Validates combat existence
  - Handles situational bonus via temporary storage
  - Calls actor.rollInitiativeDialog or actor.rollInitiative

- **`deathsave(actor, requestData, rollConfig, dialogConfig, messageConfig)`**: Handles death saving throws
  - Calls actor.rollDeathSave

- **`hitdie(actor, requestData, rollConfig, dialogConfig, messageConfig)`**: Handles hit die rolls
  - Forces dialog for players
  - Includes denomination in config
  - Calls actor.rollHitDie

- **`custom(actor, requestData, rollConfig, dialogConfig, messageConfig)`**: Handles custom formula rolls
  - Delegates to RollHandlers.handleCustomRoll

#### Static Methods:
- **`handleActivityRoll(actor, rollType, requestData, rollConfig, dialogConfig, messageConfig)`**: Handles activity-based rolls
  - Extracts attack-specific options from requestData.config
  - Builds activity configuration with proper options
  - Adds situational bonus if present
  - Delegates to ActivityUtil.executeActivityRoll

- **`handleCustomRoll(actor, requestData)`**: Shows custom roll dialog and executes roll
  - Creates CustomRollDialog with readonly formula
  - Executes roll with proper flags on confirmation
  - Posts to chat with requester attribution

- **`handleHitDieRecovery(actor)`**: Handles hit dice recovery for long rest
  - Used when refilling hit dice before sending request
  - Updates actor and item data
  - Returns recovery result object

### 5a. helpers/RollHelpers.mjs
**Location**: `src/components/helpers/RollHelpers.mjs`

**Purpose**: Helper functions for roll handling, separated from handlers

#### Methods
- **`buildRollConfig(requestData, rollConfig, additionalConfig)`**: Builds BasicRollProcessConfiguration
  - Creates proper rolls array structure
  - Applies situational bonus if present
  - Merges additional configuration
  - Ensures roll flags via ensureRollFlags

- **`addSituationalBonus(config, situational)`**: Adds situational bonus to roll configuration
  - Sets rolls[0].data.situational (D&D5e adds @situational automatically)
  - Ensures proper roll structure

- **`ensureRollFlags(config, requestData)`**: Adds required flags to prevent re-interception
  - Sets isRollRequest (false for GM, true for players)
  - Adds _showRequestedBy and _requestedBy flags

### 6. DiceConfigUtil.mjs
**Purpose**: Centralized management of dice configurations for all users

#### Static Properties
- `diceConfig`: Current user's dice configuration
- `playerDiceConfigs`: All player dice configurations (GM only)

#### Methods
- **`initialize()`**: Sets up dice configuration from client settings

- **`setDiceConfig()`**: Updates dice configuration from client settings

- **`getDiceConfig()`**: Gets current user's config and sends to GMs if applicable

- **`receiveDiceConfig(userId, diceConfig)`**: Stores dice config from a player

- **`getUserDiceConfig(userId)`**: Gets specific user's dice configuration

- **`requestDiceConfigFromUser(userId)`**: Requests config from specific user via socket

- **`requestDiceConfigFromAllPlayers()`**: Requests configs from all active players

- **`clearPlayerConfigs()`**: Clears all stored player configurations

- **`hasUserConfig(userId)`**: Checks if user has stored configuration

### 6. RollRequestsMenu.mjs
**Purpose**: GM interface for selecting actors and initiating roll requests

#### Static Properties
- `#instance`: Private singleton instance of the menu

#### Properties
- `selectedActors`: Set of selected actor IDs
- `currentTab`: Current tab ('pc' or 'npc')
- `selectedRequestType`: Currently selected roll type
- `isLocked`: Lock state to prevent menu closing
- `optionsExpanded`: Options panel expanded state

#### Methods
- **`constructor(options)`**: Initializes menu state
  - Loads options expanded state from user flags
  - Initializes from selected tokens

- **`_prepareContext(options)`**: Prepares template data
  - Separates actors by PC/NPC using isPlayerOwned helper
  - Filters NPCs to current scene using hasTokenInScene helper
  - Prepares actor data with stats
  - Uses buildRollTypes helper for roll type list
  - Checks settings states

- **`_getActorStats(actor)`**: Extracts ability scores and modifiers

- **`_initializeFromSelectedTokens()`**: Pre-selects actors based on canvas selection

- **`_onRender(context, options)`**: Post-render setup
  - Manages menu positioning
  - Handles lock button state

- **`_toggleActorSelection(actorId)`**: Toggles actor selection state
  - Uses updateCanvasTokenSelection helper

- **`_updateAllActorsCheckbox()`**: Updates "select all" checkbox state

- **`_orchestrateRollsForActors(config, pcActors, npcActors, rollMethodName, rollKey)`**: Orchestrates roll execution (renamed from _executeRollRequests)
  - Separates online/offline players
  - Routes PC rolls to players via _sendRollRequestToPlayer
  - Routes NPC and offline player rolls to _handleGMRolls
  - Shows consolidated notifications

- **`_handleGMRolls(actors, requestType, rollKey, rollProcessConfig)`**: Executes rolls locally on GM client
  - Used for NPCs and offline player characters
  - Handles bulk rolls with delays using delay helper
  - Accepts BasicRollProcessConfiguration from dialog

- **`_sendRollRequestToPlayer(actor, owner, requestType, rollKey, config, suppressNotification)`**: Sends roll request to player
  - Handles special cases like hit die refills
  - Builds RollRequestData with rollProcessConfig
  - Sends via SocketUtil to specific player
  - Shows notification unless suppressed

- **`_initiateRoll(actor, requestType, rollKey, config)`**: Executes single actor roll
  - Builds requestData structure for RollHandlers
  - Uses RollHandlers for all roll types (same as player rolls)
  - Delegates to appropriate handler based on requestType
  - Uses NotificationManager for error handling

- **`toggle()`**: Static method to toggle the menu open/closed
  - Creates singleton instance if needed
  - Manages menu visibility state

### 7. RollInterceptor.mjs
**Purpose**: Intercepts rolls initiated from character sheets and redirects to players

#### Imports
- Dialog classes from `dialogs/GMRollConfigDialog.mjs`: GMRollConfigDialog, GMSkillToolConfigDialog, GMHitDieConfigDialog, GMDamageConfigDialog, GMAttackConfigDialog

#### Properties
- `registeredHooks`: Set of registered hook IDs for cleanup

#### Methods
- **`initialize()`**: Sets up roll interception (GM only)

- **`registerHooks()`**: Registers D&D5e pre-roll hooks
  - Hooks: ability checks, saving throws, skills, tools, attacks, damage, initiative, death saves, hit dice
  - Note: Concentration is handled as a Constitution saving throw

- **`_handlePreRoll(rollType, config, dialog, message)`**: Main interception handler
  - Data examined: config.isRollRequest, dialog.isRollRequest, message.isRollRequest
  - Checks if roll should be intercepted (returns early if isRollRequest flag present)
  - Extracts actor from config
  - Validates actor ownership and player status
  - Shows GM configuration dialog
  - Returns false to prevent original roll

- **`_showGMConfigDialog(actor, owner, rollType, config, dialog, message)`**: Shows GM configuration dialog
  - Creates appropriate dialog (GMRollConfigDialog or GMSkillToolConfigDialog)
  - Handles dialog result
  - Either sends to player or executes locally based on sendRequest toggle

- **`_executeInterceptedRoll(actor, rollType, originalConfig, dialogResult)`**: Executes roll locally when not sending to player
  - Applies configuration from dialog
  - Sets isRollRequest flags to prevent re-interception
  - Calls appropriate actor roll method


- **`_getActorOwner(actor)`**: Finds the player owner of an actor
  - Returns first non-GM user with OWNER permission

- **`_sendRollRequest(actor, owner, rollType, config)`**: Sends roll request to player
  - Cleans config to remove non-serializable data
  - Builds request data structure
  - Sends via SocketUtil
  - Shows GM notification

### 8. helpers/RollValidationHelpers.mjs
**Purpose**: Roll validation utilities for combat, initiative, and death saves

#### Methods
- **`ensureCombatForInitiative()`**: Ensures combat exists before rolling initiative
  - Shows dialog if no combat active
  - Creates combat encounter if user confirms
  - Returns boolean indicating if combat is ready

- **`filterActorsForInitiative(actors)`**: Filters actors for initiative rolls
  - Separates actors that already have initiative
  - Shows dialog if some actors have initiative
  - Returns filtered array of actors to roll for

### 9. dialogs/GMRollConfigDialog.mjs
**Purpose**: Extended D&D5e roll configuration dialogs for GM use with mixin pattern

#### GMRollConfigMixin Function
Creates a mixin that adds GM-specific functionality to any D&D5e dialog class

#### Properties Added by Mixin
- `actors`: Array of actors being rolled for
- `sendRequest`: Whether to send to players (default true)
- `showDC`: Whether to show DC field
- `dcValue`: DC value if set
- `rollKey`: The specific roll key (skill, ability, etc.)
- `rollTypeString`: The roll type string

#### Methods Added by Mixin
- **`_buildConfig(config, formData, index)`**: Builds roll configuration from form data
  - Handles situational bonuses with proper D&D5e structure
  - Extracts ability selection for skills/tools
  - Applies DC values

- **`_onChangeForm(formConfig, event)`**: Handles form changes
  - Captures send request toggle state
  - Updates DC value
  - Manages form state across re-renders

- **`_processSubmission(event, form, formData)`**: Processes form submission
  - Handles send request flow
  - Returns dialog result for roll requests
  - Continues normal flow for local rolls

- **`_prepareConfigurationData(roll, config, dialog, message)`**: Adds GM-specific data
  
- **`_preparePartContext(partId, context, options)`**: Adds GM fields to dialog context

- **`_onRender(context, options)`**: Injects GM-specific form fields
  - Adds DC field and send request toggle
  - Handles formula rebuild triggers

#### Dialog Classes

##### GMRollConfigDialog
Extends D20RollConfigurationDialog with GMRollConfigMixin
- Used for ability checks, saves, concentration, initiative, death saves

##### GMSkillToolConfigDialog  
Extends SkillRollConfigurationDialog with GMRollConfigMixin
- Used for skill and tool checks
- Includes ability selection support

##### GMHitDieConfigDialog
Extends RollConfigurationDialog with GMRollConfigMixin
- Used for hit die rolls
- No DC field support

##### GMDamageConfigDialog
Extends DamageRollConfigurationDialog with GMRollConfigMixin
- Used for damage rolls
- Includes critical hit toggle
- Custom send request checkbox injection

##### GMAttackConfigDialog
Extends AttackRollConfigurationDialog with GMRollConfigMixin
- Used for attack rolls
- Includes attack mode, ammunition, and mastery options

### 10. SocketUtil.mjs
**Purpose**: Wrapper around socketlib for socket communication

#### Properties
- `socket`: socketlib instance
- `registeredCalls`: Map of registered socket methods

#### Methods
- **`initialize(registerCallback)`**: Sets up socketlib
  - Waits for socketlib.ready hook
  - Registers socket with module ID

- **`registerCall(callName, method)`**: Registers a socket method

- **`execForUser(callName, userId, ...args)`**: Executes method on specific user's client

- **`execForGMs(callName, ...args)`**: Executes method on all GM clients

- **`execForEveryone(callName, ...args)`**: Executes method on all clients

### 11. SettingsUtil.mjs
**Purpose**: Module settings management

#### Methods
- **`registerSettings()`**: Registers all module settings
  - rollRequestsEnabled: Master toggle
  - rollInterceptionEnabled: Auto-intercept rolls
  - skipRollDialog: Skip roll dialogs on player side
  - useGMTargetTokens: Apply GM's targets to player rolls
  - debugMode: Enable debug logging

- **`get(key)`**: Gets a setting value

- **`set(key, value)`**: Sets a setting value

- **`toggle(key)`**: Toggles a boolean setting

### 12. LogUtil.mjs
**Purpose**: Debug logging utility

#### Methods
- **`log(label, data, force)`**: Logs debug messages
  - Only logs if debugMode is enabled or force=true
  - Formats output with timestamp and module prefix

### 13. ActivityUtil.mjs
**Purpose**: Handles D&D5e activity-based rolls (attacks, damage, etc.)

#### Methods
- **`findActivityForRoll(item, rollType)`**: Finds appropriate activity on an item
  - Uses ROLL_TYPES constants

- **`executeActivityRoll(actor, rollType, itemId, activityId, config)`**: Executes activity-based roll

### 14. ActivityUtil.mjs
**Purpose**: Handles D&D5e activity-based rolls (attacks, damage, etc.)

#### Methods
- **`findActivityForRoll(item, rollType)`**: Finds appropriate activity on an item
  - Uses ROLL_TYPES constants
  - Returns activity matching roll type

- **`executeActivityRoll(actor, rollType, itemId, activityId, config)`**: Executes activity-based roll
  - Finds item on actor
  - Gets specific activity or uses findActivityForRoll
  - Handles different roll types (attack, damage, item save)
  - Special MidiQOL handling for attacks
  - Calls activity.use() with proper configuration

### 15. CustomRollDialog.mjs
**Purpose**: ApplicationV2 dialog for custom roll formulas

#### Properties
- `formula`: The roll formula
- `readonly`: Whether formula is read-only (true for player-requested rolls)
- `actor`: Actor performing the roll
- `callback`: Function to call on roll
- `diceCounts`: Map for dice consolidation

#### Methods
- **`addDie(event, target)`**: Adds die to formula with consolidation
  - Parses existing formula for dice expressions
  - Consolidates multiple dice of same type (e.g., 1d6 + 1d6 + 1d6 → 3d6)
  - Updates formula input

- **`validateFormula(formula)`**: Validates roll formula
  - Uses Roll.validate when available
  - Falls back to creating test roll
  - Returns boolean validity

- **`updateValidationMessage(messageElement)`**: Updates validation UI
  - Shows success/error state
  - Updates localized message text

- **`rollDice()`**: Executes the roll
  - Validates formula
  - Calls callback if provided
  - Closes dialog

- **`prompt(options)`**: Static method for showing dialog
  - Returns promise resolving to formula or null
  - Handles dialog cancellation

### 16. SidebarUtil.mjs
**Purpose**: Manages sidebar controls to avoid circular dependencies

#### Methods
- **`addSidebarControls(app, html, options)`**: Adds roll request icon to chat controls (GM only)
  - Creates toggle icon in chat sidebar
  - Updates icon state based on settings
  - Calls RollRequestsMenu.toggle() on click

- **`updateRollRequestsIcon(enabled)`**: Updates the chat control icon appearance
  - Updates icon active state based on enabled parameter

## Data Flow

### GM Initiates Roll Request
1. GM opens RollRequestsMenu
2. Selects actors and roll type
3. GMRollConfigDialog appears for configuration
4. If sendRequest=true: SocketUtil sends to player
5. If sendRequest=false: Local roll execution

### Character Sheet Roll Interception
1. GM clicks roll on character sheet
2. RollInterceptor catches pre-roll hook
3. GMRollConfigDialog appears
4. Same flow as manual request

### Player Receives Request
1. Main.handleRollRequest receives socket message
2. Delegates to RollRequestUtil.handleRequest
3. Validates actor ownership
4. Applies GM configuration
5. Shows roll dialog (unless skipRollDialog=true)
6. Executes roll using RollHandlers
7. Posts to chat with requester info

## Recent Architecture Changes

### Proper D&D5e Type Usage
- Module now uses standard D&D5e roll configuration types throughout
- GMRollConfigDialog.initConfiguration() returns proper BasicRollProcessConfiguration
- All RollHandlers updated to build correct BasicRollProcessConfiguration structures
- Situational bonuses properly stored in rolls[0].data.situational with "@situational" in parts[]
- Eliminates custom flat configuration objects in favor of D&D5e's expected types

### Hit Die Multiclass Support
- Added denomination selector in hit die dialog for multiclass characters
- Hook `_onRenderHitDieDialog` dynamically adds UI based on available hit dice
- Consolidates hit dice by denomination across classes
- Allows real-time formula updates when denomination changes

### Initiative Situational Bonus Fix
- Uses temporary storage pattern (`actor._initiativeSituationalBonus`)
- Hook `_onPreRollInitiativeDialogV2` applies bonus from temporary storage
- Cleans up temporary data after use
- Works around D&D5e dialog not properly handling situational bonuses

### Improved Roll Flag Handling
- `RollHelpers.ensureRollFlags()` sets context-aware flags
- `isRollRequest` is false for GM, true for players
- Prevents re-interception of rolls in the correct context
- All handlers now use this centralized flag logic

### Custom Roll Implementation
- Working custom rolls from RollRequestsMenu
- Formula validation before execution
- Proper integration with roll request system
- Chat messages include requester attribution

## Key Data Structures

### Roll Request Data
```javascript
{
  type: "rollRequest",
  requestId: "unique-id",
  actorId: "actor-id",
  rollType: "ability|save|skill|tool|etc",
  rollKey: "str|dex|athletics|etc",
  activityId: "activity-id", // For item-based rolls
  config: {
    advantage: boolean,
    disadvantage: boolean,
    situational: "bonus formula",
    rollMode: "roll|gmroll|blindroll|selfroll",
    target: number, // DC value
    ability: "str|dex|etc", // For skills/tools
    requestedBy: "GM Name"
  },
  skipRollDialog: boolean,
  targetTokenIds: ["token-ids"],
  preserveTargets: boolean
}
```

### Roll Configuration Types

#### BasicRollConfiguration
Individual roll configuration used within BasicRollProcessConfiguration:
```javascript
{
  parts: string[],     // Roll formula parts like ["@mod", "@situational"]
  data: {              // Data for formula resolution
    situational?: string,  // Situational bonus formula
    // ... other data
  },
  options: {}          // Roll options
}
```

#### BasicRollProcessConfiguration  
Process-level configuration passed to D&D5e actor roll methods:
```javascript
{
  rolls: BasicRollConfiguration[],  // Array of roll configurations
  subject?: Actor,                  // Actor performing the roll
  ability?: string,                 // Ability key for ability checks/saves
  skill?: string,                   // Skill key for skill checks
  tool?: string,                    // Tool key for tool checks
  advantage?: boolean,              // Roll with advantage
  disadvantage?: boolean,           // Roll with disadvantage
  target?: number,                  // DC value
  chatMessage?: boolean,            // Create chat message
  rollMode?: string,                // Roll visibility mode
  // Custom module flags:
  isRollRequest?: boolean,          // Prevents re-interception
  sendRequest?: boolean,            // Send to player vs roll locally
  skipRollDialog?: boolean,             // Skip configuration dialog
  _showRequestedBy?: boolean,       // Show requester in chat
  _requestedBy?: string             // Requester name
}
```

### GM Dialog Result
GMRollConfigDialog.initConfiguration() returns BasicRollProcessConfiguration with:
- Properly structured rolls array containing situational bonus
- All standard D&D5e properties (advantage, disadvantage, target)
- Custom module flags (sendRequest, isRollRequest, etc.)

## Constants

### ROLL_TYPES
Used throughout the module to avoid hardcoded strings:
- `ABILITY`: "ability"
- `SAVE`: "save"
- `SKILL`: "skill"
- `TOOL`: "tool"
- `CONCENTRATION`: "concentration"
- `ATTACK`: "attack"
- `DAMAGE`: "damage"
- `INITIATIVE`: "initiative"
- `DEATH_SAVE`: "deathsave"
- `HIT_DIE`: "hitdie"
- `ITEM_SAVE`: "itemsave"
- `CUSTOM`: "custom"

### SOCKET_CALLS
Socket method names:
- `receiveDiceConfig`: "receiveDiceConfig"
- `getDiceConfig`: "getDiceConfig"
- `handleRollRequest`: "handleRollRequest"