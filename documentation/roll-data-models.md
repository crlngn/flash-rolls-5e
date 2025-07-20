# D&D 5e Roll Data Models and Interfaces Documentation

This document provides a comprehensive overview of all data models and interfaces involved in the D&D 5e roll system.

## Table of Contents
- [Basic Roll Configuration](#basic-roll-configuration)
- [D20 Roll Configuration](#d20-roll-configuration)
- [Damage Roll Configuration](#damage-roll-configuration)
- [Roll Options](#roll-options)
- [Message Configuration](#message-configuration)
- [Dialog Configuration](#dialog-configuration)
- [Activity Configuration](#activity-configuration)
- [Additional Data Structures](#additional-data-structures)

## Basic Roll Configuration

### BasicRollProcessConfiguration
Configuration data for the process of creating one or more basic rolls.

```javascript
/**
 * @typedef {object} BasicRollProcessConfiguration
 * @property {BasicRollConfiguration[]} rolls  Configuration data for individual rolls.
 * @property {boolean} [evaluate=true]         Should the rolls be evaluated? If set to `false`, then no chat message
 *                                             will be created regardless of message configuration.
 * @property {Event} [event]                   Event that triggered the rolls.
 * @property {string[]} [hookNames]            Name suffixes for configuration hooks called.
 * @property {Document} [subject]              Document that initiated this roll.
 * @property {number} [target]                 Default target value for all rolls.
 */
```

### BasicRollConfiguration
Configuration data for an individual roll.

```javascript
/**
 * @typedef {object} BasicRollConfiguration
 * @property {string[]} [parts=[]]         Parts used to construct the roll formula.
 * @property {object} [data={}]            Data used to resolve placeholders in the formula.
 * @property {boolean} [situational=true]  Whether the situational bonus can be added to this roll in the prompt.
 * @property {BasicRollOptions} [options]  Additional options passed through to the created roll.
 */
```

### BasicRollOptions
Options allowed on a basic roll.

```javascript
/**
 * @typedef {object} BasicRollOptions
 * @property {number} [target]  The total roll result that must be met for the roll to be considered a success.
 */
```

## D20 Roll Configuration

### D20RollProcessConfiguration
Configuration data for the process of rolling d20 rolls.

```javascript
/**
 * @typedef {BasicRollProcessConfiguration} D20RollProcessConfiguration
 * @property {boolean} [advantage]             Apply advantage to each roll.
 * @property {boolean} [disadvantage]          Apply disadvantage to each roll.
 * @property {boolean} [elvenAccuracy]         Use three dice when rolling with advantage.
 * @property {boolean} [halflingLucky]         Add a re-roll once modifier to the d20 die.
 * @property {boolean} [reliableTalent]        Set the minimum for the d20 roll to 10.
 * @property {D20RollConfiguration[]} rolls    Configuration data for individual rolls.
 */
```

### D20RollConfiguration
D20 roll configuration data.

```javascript
/**
 * @typedef {BasicRollConfiguration} D20RollConfiguration
 * @property {string[]} parts          Parts used to construct the roll formula, not including the d20 die.
 * @property {D20RollOptions} options  Options passed through to the roll.
 */
```

### D20RollOptions
Options that describe a d20 roll.

```javascript
/**
 * @typedef {BasicRollOptions} D20RollOptions
 * @property {boolean} [advantage]       Does this roll potentially have advantage?
 * @property {boolean} [disadvantage]    Does this roll potentially have disadvantage?
 * @property {D20Roll.ADV_MODE} [advantageMode]  Final advantage mode.
 * @property {number} [criticalSuccess]  The value of the d20 die to be considered a critical success.
 * @property {number} [criticalFailure]  The value of the d20 die to be considered a critical failure.
 * @property {boolean} [elvenAccuracy]   Use three dice when rolling with advantage.
 * @property {boolean} [halflingLucky]   Add a re-roll once modifier to the d20 die.
 * @property {number} [maximum]          Maximum number the d20 die can roll.
 * @property {number} [minimum]          Minimum number the d20 die can roll.
 */
```

### D20Roll.ADV_MODE
Advantage mode enumeration for D20 rolls.

```javascript
/**
 * Advantage mode of a 5e d20 roll
 * @enum {number}
 */
D20Roll.ADV_MODE = {
  NORMAL: 0,
  ADVANTAGE: 1,
  DISADVANTAGE: -1
};
```

## Damage Roll Configuration

### DamageRollProcessConfiguration
Configuration data for the process of rolling a damage roll.

```javascript
/**
 * @typedef {BasicRollProcessConfiguration} DamageRollProcessConfiguration
 * @property {DamageRollConfiguration[]} rolls         Configuration data for individual rolls.
 * @property {CriticalDamageConfiguration} [critical]  Critical configuration for all rolls.
 * @property {boolean} [isCritical]                    Treat each roll as a critical unless otherwise specified.
 * @property {number} [scaling=0]                      Scale increase above base damage.
 */
```

### DamageRollConfiguration
Damage roll configuration data.

```javascript
/**
 * @typedef {BasicRollConfiguration} DamageRollConfiguration
 * @property {DamageRollOptions} [options] - Options passed through to the roll.
 */
```

### DamageRollOptions
Options that describe a damage roll.

```javascript
/**
 * @typedef {BasicRollOptions} DamageRollOptions
 * @property {boolean} [isCritical]                    Should critical damage be calculated for this roll?
 * @property {CriticalDamageConfiguration} [critical]  Critical configuration for this roll.
 * @property {string[]} [properties]                   Physical properties of the source (e.g. magical, silvered).
 * @property {string} [type]                           Type of damage represented.
 * @property {string[]} [types]                        List of damage types selectable in the configuration app. If no
 *                                                     type is provided, then the first of these types will be used.
 */
```

### CriticalDamageConfiguration
Critical effects configuration data.

```javascript
/**
 * @typedef {object} CriticalDamageConfiguration
 * @property {boolean} [allow=true]       Should critical damage be allowed?
 * @property {number} [multiplier=2]      Amount by which to multiply critical damage.
 * @property {number} [bonusDice=0]       Additional dice added to first term when calculating critical damage.
 * @property {string} [bonusDamage]       Additional, unmodified, damage formula added when calculating a critical.
 * @property {boolean} [multiplyDice]     Should dice result be multiplied rather than number of dice rolled increased?
 * @property {boolean} [multiplyNumeric]  Should numeric terms be multiplied along side dice during criticals?
 * @property {string} [powerfulCritical]  Maximize result of extra dice added by critical, rather than rolling.
 */
```

## Message Configuration

### BasicRollMessageConfiguration
Configuration data for creating a roll message.

```javascript
/**
 * @typedef {object} BasicRollMessageConfiguration
 * @property {boolean} [create=true]     Create a message when the rolling is complete.
 * @property {ChatMessage5e} [document]  Final created chat message document once process is completed.
 * @property {string} [rollMode]         The roll mode to apply to this message from `CONFIG.Dice.rollModes`.
 * @property {object} [data={}]          Additional data used when creating the message.
 */
```

### ActivityMessageConfiguration
Message configuration for activity usage.

```javascript
/**
 * @typedef {object} ActivityMessageConfiguration
 * @property {boolean} [create=true]     Whether to automatically create a chat message (if true) or simply return
 *                                       the prepared chat message data (if false).
 * @property {object} [data={}]          Additional data used when creating the message.
 * @property {boolean} [hasConsumption]  Was consumption available during activation.
 * @property {string} [rollMode]         The roll display mode with which to display (or not) the card.
 */
```

## Dialog Configuration

### BasicRollDialogConfiguration
Configuration data for the roll prompt.

```javascript
/**
 * @typedef {object} BasicRollDialogConfiguration
 * @property {boolean} [configure=true]  Display a configuration dialog for the rolling process.
 * @property {typeof RollConfigurationDialog} [applicationClass]  Alternate configuration application to use.
 * @property {BasicRollConfigurationDialogOptions} [options]      Additional options passed to the dialog.
 */
```

### BasicRollConfigurationDialogOptions
Dialog rendering options for a roll configuration dialog.

```javascript
/**
 * @typedef {object} BasicRollConfigurationDialogOptions
 * @property {typeof BasicRoll} rollType              Roll type to use when constructing final roll.
 * @property {object} [default]
 * @property {number} [default.rollMode]              Default roll mode to have selected.
 * @property {RollBuildConfigCallback} [buildConfig]  Callback to handle additional build configuration.
 * @property {BasicRollConfigurationDialogRenderOptions} [rendering]
 */
```

### BasicRollConfigurationDialogRenderOptions

```javascript
/**
 * @typedef BasicRollConfigurationDialogRenderOptions
 * @property {object} [dice]
 * @property {number} [dice.max=5]               The maximum number of dice to display in the large dice breakdown.
 * @property {Set<string>} [dice.denominations]  Valid die denominations to display in the large dice breakdown.
 */
```

### ActivityDialogConfiguration
Data for the activity activation configuration dialog.

```javascript
/**
 * @typedef {object} ActivityDialogConfiguration
 * @property {boolean} [configure=true]  Display a configuration dialog for the item usage, if applicable?
 * @property {typeof ActivityUsageDialog} [applicationClass]  Alternate activation dialog to use.
 * @property {object} [options]          Options passed through to the dialog.
 */
```

## Activity Configuration

### ActivityUseConfiguration
Configuration data for an activity usage being prepared.

```javascript
/**
 * @typedef {object} ActivityUseConfiguration
 * @property {object|false} create
 * @property {boolean} create.measuredTemplate     Should this item create a template?
 * @property {object} concentration
 * @property {boolean} concentration.begin         Should this usage initiate concentration?
 * @property {string|null} concentration.end       ID of an active effect to end concentration on.
 * @property {object|false} consume
 * @property {boolean} consume.action              Should action economy be tracked? Currently only handles
 *                                                 legendary actions.
 * @property {boolean|number[]} consume.resources  Set to `true` or `false` to enable or disable all resource
 *                                                 consumption or provide a list of consumption target indexes
 *                                                 to only enable those targets.
 * @property {boolean} consume.spellSlot           Should this spell consume a spell slot?
 * @property {Event} event                         The browser event which triggered the item usage, if any.
 * @property {boolean|number} scaling              Number of steps above baseline to scale this usage, or `false` if
 *                                                 scaling is not allowed.
 * @property {object} spell
 * @property {number} spell.slot                   The spell slot to consume.
 * @property {boolean} [subsequentActions=true]    Trigger subsequent actions defined by this activity.
 * @property {object} [cause]
 * @property {string} [cause.activity]             Relative UUID to the activity that caused this one to be used.
 *                                                 Activity must be on the same actor as this one.
 * @property {boolean|number[]} [cause.resources]  Control resource consumption on linked item.
 */
```

### ActivityUsageResults
Details of final changes performed by the usage.

```javascript
/**
 * @typedef {object} ActivityUsageResults
 * @property {ActiveEffect5e[]} effects              Active effects that were created or deleted.
 * @property {ChatMessage5e|object} message          The chat message created for the activation, or the message
 *                                                   data if `create` in ActivityMessageConfiguration was `false`.
 * @property {MeasuredTemplateDocument[]} templates  Created measured templates.
 * @property {ActivityUsageUpdates} updates          Updates to the actor & items.
 */
```

### ActivityUsageUpdates
Updates that will be applied during activity usage.

```javascript
/**
 * @typedef {object} ActivityUsageUpdates
 * @property {object} activity  Updates to apply to activities.
 * @property {object} actor     Updates to apply to the actor.
 * @property {object[]} create  Items to be created on the actor.
 * @property {string[]} delete  IDs of items to be deleted from the actor.
 * @property {object[]} item    Updates to apply to items.
 */
```

### ActivityConsumptionDescriptor
Describes consumption that occurred during activity usage.

```javascript
/**
 * @typedef ActivityConsumptionDescriptor
 * @property {{ keyPath: string, delta: number }[]} actor                 Changes for the actor.
 * @property {Record<string, { keyPath: string, delta: number }[]>} item  Changes for each item grouped by ID.
 */
```

## Additional Data Structures

### RollConfigData
Data structure for storing roll configuration within data models.

```javascript
/**
 * @typedef {object} RollConfigData
 * @property {string} [ability]  Default ability associated with this roll.
 * @property {object} roll
 * @property {number} roll.min   Minimum number on the die rolled.
 * @property {number} roll.max   Maximum number on the die rolled.
 * @property {number} roll.mode  Should the roll be with disadvantage or advantage by default?
 */
```

### Deprecated Interfaces

The system also includes deprecated interfaces for backward compatibility:

#### DeprecatedD20RollConfiguration
Used for backward compatibility with older modules.

```javascript
/**
 * @typedef {object} DeprecatedD20RollConfiguration
 * @property {string[]} [parts=[]]  The dice roll component parts, excluding the initial d20.
 * @property {object} [data={}]     Data that will be used when parsing this roll.
 * @property {Event} [event]        The triggering event for this roll.
 * // ... additional properties for backward compatibility
 */
```

## Roll Type Hierarchy

The roll system follows this class hierarchy:

```
Roll (Foundry Core)
└── BasicRoll
    ├── D20Roll
    └── DamageRoll
```

Each roll type has its associated configuration dialog:
- `RollConfigurationDialog` - Base configuration dialog
- `D20RollConfigurationDialog` - D20-specific configuration
- `DamageRollConfigurationDialog` - Damage-specific configuration
- `AttackRollConfigurationDialog` - Attack-specific configuration (extends D20)
- `SkillToolRollConfigurationDialog` - Skill/tool configuration (extends D20)

## Usage Patterns

### Creating a Basic Roll
```javascript
const rolls = await BasicRoll.build(
  { rolls: [{ parts: ["1d20", "@mod"], data: { mod: 5 } }] },
  { configure: true },
  { create: true }
);
```

### Creating a D20 Roll
```javascript
const rolls = await D20Roll.build(
  { 
    rolls: [{ parts: ["@mod"], data: { mod: 5 } }],
    advantage: true
  },
  { configure: true },
  { create: true }
);
```

### Creating a Damage Roll
```javascript
const rolls = await DamageRoll.build(
  {
    rolls: [{ parts: ["2d6", "@mod"], data: { mod: 3 } }],
    critical: { multiplier: 2 }
  },
  { configure: true },
  { create: true }
);
```