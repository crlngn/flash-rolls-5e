import { readFileSync, writeFileSync } from 'fs';
import path from 'path';

/**
 * Updates version in module.json to match package.json during build
 */
export default function vitePluginVersion() {
  return {
    name: 'vite-plugin-version',
    configResolved(config) {
      // Detect if running in watch mode
      const isWatchMode = process.env.WATCH_MODE === 'true';

      if (isWatchMode) {
        console.log("Skipping version updates in watch mode...");
        return; // Stop execution if watching files
      }

      console.log("Updating version files for build...");
      
      try {
        // Read package.json
        const packageJsonPath = path.resolve('./package.json');
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        const version = packageJson.version;

        // Read module.json
        const moduleJsonPath = path.resolve('./src/module.json');
        const moduleJson = JSON.parse(readFileSync(moduleJsonPath, 'utf-8'));

        // Update version in module.json
        moduleJson.version = version;
        
        // Update download URL to include version
        if (moduleJson.download && moduleJson.download.includes('/v')) {
          const downloadUrlParts = moduleJson.download.split('/v');
          if (downloadUrlParts.length >= 2) {
            const baseUrl = downloadUrlParts[0];
            moduleJson.download = `${baseUrl}/v${version}/module.zip`;
          }
        }

        // Write updated module.json
        writeFileSync(moduleJsonPath, JSON.stringify(moduleJson, null, 2));
        console.log(`Updated module.json version to ${version}`);
      } catch (error) {
        console.error('Error updating version:', error);
      }
    }
  };
}
