// @ts-nocheck
import copy from "rollup-plugin-copy";
import { defineConfig } from "vite";
import path from "path";
import vitePluginVersion from './vite-plugin-version.js';
import { mergeLang } from './shared/flash-token-bar-core/build/vite-plugin-merge-lang.mjs';

import { readFileSync } from 'fs';
const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'));
const version = packageJson.version;

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  base: '/modules/flash-rolls-5e/',
  css: {
    devSourcemap: true,
  },
  resolve: {
    alias: {
      "@host": path.resolve(__dirname, "./src/host"),
      "@ftb-core": path.resolve(__dirname, "./shared/flash-token-bar-core/src"),
      "@": path.resolve(__dirname, "./src")
    }
  },
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      input: "src/module.mjs",
      output: {
        dir: "dist/",
        entryFileNames:"scripts/flash-rolls-5e.js",
        chunkFileNames: "scripts/flash-rolls-5e.js",
        assetFileNames: (assetInfo) => {
          const isImgType = /\.(gif|jpe?g|png|svg)$/.test(assetInfo.name);
          const isStyleType = /\.css$/.test(assetInfo.name);

          if (isImgType){
            return 'assets/[name][extname]';
          }
          if (isStyleType) {
            return 'styles/flash-rolls-5e.css';
          }
          if (assetInfo.originalFileNames?.includes("src/module.mjs")) {
            return "scripts/flash-rolls-5e.js";
          }

          return 'assets/[name][extname]';
        },
        format: "es",
        inlineDynamicImports: true,
      },
    },
  },
  plugins: [
    vitePluginVersion(),
    mergeLang({ coreLangDir: "shared/flash-token-bar-core/src/lang", hostLangDir: "src/lang" }),
    copy({
      targets: [
        { src: "src/module.json", dest: "dist" },
        { src: "src/templates", dest: "dist" },
        { src: "shared/dnd5e-compact-cards/templates/*", dest: "dist/templates" },
        { src: "src/assets", dest: "dist" }
      ],
      hook: "writeBundle",
    })
  ],
});
