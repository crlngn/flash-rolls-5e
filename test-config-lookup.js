// Test script to explore CONFIG.DND5E structure
// This can be run in the browser console when Foundry is loaded

// Check for enrichmentLookup
console.log("CONFIG.DND5E.enrichmentLookup exists:", !!CONFIG.DND5E.enrichmentLookup);

// Check for tools
console.log("\nChecking for tools in CONFIG.DND5E:");
console.log("CONFIG.DND5E.toolIds:", CONFIG.DND5E.toolIds);
console.log("CONFIG.DND5E.toolProficiencies:", CONFIG.DND5E.toolProficiencies);
console.log("CONFIG.DND5E.tools:", CONFIG.DND5E.tools);

// Check for dynamic access patterns
console.log("\nChecking dynamic access patterns:");
const testKeys = ['abilities', 'skills', 'tools', 'toolIds', 'toolProficiencies'];
testKeys.forEach(key => {
  console.log(`CONFIG.DND5E[${key}]:`, CONFIG.DND5E[key]);
});

// Check if tools might be stored elsewhere
console.log("\nChecking other possible locations:");
console.log("CONFIG.DND5E.itemIds?.tool:", CONFIG.DND5E.itemIds?.tool);
console.log("CONFIG.DND5E.traits?.toolProf:", CONFIG.DND5E.traits?.toolProf);

// List all keys in CONFIG.DND5E to find tool-related data
console.log("\nAll CONFIG.DND5E keys containing 'tool':");
Object.keys(CONFIG.DND5E).filter(key => key.toLowerCase().includes('tool')).forEach(key => {
  console.log(`CONFIG.DND5E.${key}:`, CONFIG.DND5E[key]);
});