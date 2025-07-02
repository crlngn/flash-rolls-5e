# Situational Bonuses in Flash Rolls 5e

## Overview
This document details how situational bonuses are handled throughout the Flash Rolls 5e module for different roll types and scenarios.

## Key Concepts

### D&D5e System Expectations

The D&D5e system handles situational bonuses differently depending on the context:

1. **Direct Roll Methods** (e.g., `actor.rollAbilityCheck()`, `actor.rollSkill()`):
   - Expect situational bonus in the `bonus` property of the config object
   - Example: `config.bonus = "1d4"`

2. **Roll Configuration Dialogs**:
   - Expect situational bonus in `config.rolls[0].data.situational`
   - The dialog reads from this location to populate the situational bonus input field
   - When the dialog processes the form, it adds `@situational` to the parts array

## Implementation Details

### 1. GM Side (Local Rolls)

Located in: `/src/components/helpers/LocalRollHandlers.mjs`

#### For Ability Checks and Saving Throws:
```javascript
buildAbilityCheckConfig(rollKey, config) {
  const rollConfig = {
    ability: rollKey,
    advantage: config.advantage,
    disadvantage: config.disadvantage,
    target: config.target,
    isRollRequest: config.isRollRequest
  };
  
  // Add situational bonus if present
  if (config.situational) {
    rollConfig.rolls = [{
      parts: ["@situational"],
      data: { situational: config.situational },
      options: {},
      situational: true
    }];
  }
  
  return [rollConfig, dialogConfig, messageConfig];
}
```

#### For Skills and Tools:
```javascript
if (config.situational) rollConfig.bonus = config.situational;
```

#### For Other Roll Types (Concentration, Initiative, Death Saves):
```javascript
const rollConfig = {
  advantage: config.advantage,
  disadvantage: config.disadvantage,
  target: config.target
};

// Add situational bonus if present
if (config.situational) {
  rollConfig.bonus = config.situational;
}
```

### 2. Player Side (Roll Requests)

Located in: `/src/components/helpers/RollHandlers.mjs`

The `addSituationalBonus` helper method handles all roll types:

```javascript
addSituationalBonus(config, situational) {
  if (situational) {
    // Set bonus for direct roll execution
    config.bonus = situational;
    
    // Also set it in the rolls array structure for the dialog to find
    if (!config.rolls) {
      config.rolls = [{
        parts: [],
        data: {},
        options: {}
      }];
    }
    
    // Add the situational value where the dialog expects it
    config.rolls[0].data.situational = situational;
  }
  return config;
}
```

This dual approach ensures:
- The `bonus` property is set for direct roll execution
- The `rolls[0].data.situational` is set for the dialog to display the value

### 3. Roll Request Flow

1. **GM configures roll** with situational bonus in `config.situational`
2. **RollRequestUtil** transfers it to `rollConfig.bonus`
3. **RollHandlers** use `addSituationalBonus()` to set it in both places
4. **D&D5e dialog** reads from `config.rolls[0].data.situational` to display
5. **D&D5e roll method** uses `config.bonus` for execution

## Important Notes

### Avoiding Duplication

The player-side dialog automatically adds `@situational` to the formula when a value is entered. To avoid duplication:
- DO NOT manually add `@situational` to the parts array on the player side
- Let the dialog handle the formula construction

### HooksUtil Cleanup

In `/src/components/HooksUtil.mjs`, there's code that clears the situational value after the dialog renders:

```javascript
// Clear the situational value from the roll config data to prevent re-population
if (app.config?.rolls?.[0]?.data) {
  delete app.config.rolls[0].data.situational;
}
```

This prevents the value from being retained between different roll requests.

## Testing Checklist

When testing situational bonuses:

1. **GM Side Local Rolls**:
   - ✓ Formula shows situational bonus (e.g., "1d20 + 1 + 0 + 1d4")
   - ✓ Roll result includes the bonus

2. **Player Side Roll Requests**:
   - ✓ Dialog shows situational bonus in input field
   - ✓ Formula updates when bonus is modified
   - ✓ No duplication in formula (e.g., NOT "1d20 + 1 + 0 + 1d4 + 1d4")
   - ✓ Roll result includes the bonus

3. **All Roll Types**:
   - ✓ Ability Checks
   - ✓ Saving Throws
   - ✓ Skill Checks
   - ✓ Tool Checks
   - ✓ Concentration Saves
   - ✓ Initiative
   - ✓ Death Saves

## Troubleshooting

### Symptom: Situational bonus shows as "+ 0" in dialog
**Cause**: Dialog can't find the value in `config.rolls[0].data.situational`
**Fix**: Ensure `addSituationalBonus()` is called and sets the value correctly

### Symptom: Situational bonus appears twice in formula
**Cause**: Bonus is being added both programmatically and by the dialog
**Fix**: Don't manually add `@situational` to parts array on player side

### Symptom: Situational bonus not applied to roll result
**Cause**: `config.bonus` not set for the roll method
**Fix**: Ensure `config.bonus` is set in addition to the rolls array structure