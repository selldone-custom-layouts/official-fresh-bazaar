/*
 * Copyright (c) 2024. Selldone® Business OS™
 *
 * Author: M.Pajuhaan
 * Web: https://selldone.com
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * All rights reserved. In the weave of time, where traditions and innovations intermingle, this content was crafted.
 * From the essence of thought, through the corridors of creativity, each word, and sentiment has been molded.
 * Not just to exist, but to inspire. Like an artist's stroke or a sculptor's chisel, every nuance is deliberate.
 * Our journey is not just about reaching a destination, but about creating a masterpiece.
 * Tread carefully, for you're treading on dreams.
 */

import {defineConfig, loadEnv} from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";
import fs from "fs";
import vitePluginRequire from "vite-plugin-require";
import basicSsl from "@vitejs/plugin-basic-ssl";
import {
  baseName,
  layoutChunks,
  layoutInlineLimit,
  safeName,
  selldoneLayoutPlugins,
} from "./scripts/selldone-layout-vite";

const manifest = require("./manifest.json");

//import vuetify from 'vite-plugin-vuetify'
/**
 * Storefront layout version. This unique identifier is used for naming each app version published on Selldone.
 * @type {string}
 */
const VERSION_DIR = manifest.version;

let IS_PRODUCTION: boolean;
let DEV_HOST: string;
let DEV_PORT: number;
let IS_HTTPS: boolean;

const MODULES_ROOT = path.resolve(__dirname, "modules");

function resolveSelldoneModule(packageName: string, gitFolderName: string) {
  const gitModulePath = path.resolve(MODULES_ROOT, gitFolderName);
  if (fs.existsSync(gitModulePath)) {
    return gitModulePath;
  }

  return path.resolve(__dirname, `node_modules/${packageName}`);
}

// ▃▃▃▃▃▃▃▃▃▃▃▃ Storefront Web App ▃▃▃▃▃▃▃▃▃▃▃▃
export default ({mode}: any) => {
  const env = loadEnv(mode, process.cwd());

  IS_PRODUCTION = mode === "production";
  DEV_HOST = env.VITE_APP_DEV_SERVER_HOST || "localhost";
  DEV_PORT = env.VITE_APP_DEV_SERVER_PORT
      ? parseInt(env.VITE_APP_DEV_SERVER_PORT)
      : 8080;
  IS_HTTPS =
      !!env.VITE_APP_DEV_SERVER_HTTPS && env.VITE_APP_DEV_SERVER_HTTPS === "TRUE";

  // Calculate base URL
  // Production references are relative: every lazy chunk and asset resolves
  // against the address shop.js and shop.css are actually served from. The
  // Layout service stores each upload as layouts/<id>/releases/<ULID>/app and
  // serves it from wherever the storefront host decides, so an absolute
  // <deploy_server>/<package>/<version>/ base would point at an address that
  // never exists. (scripts/selldone-layout-vite.ts explains the other rules.)
  const baseURL = IS_PRODUCTION
      ? "./"
      : `${IS_HTTPS ? "https" : "http"}://${DEV_HOST}:${DEV_PORT}/`;

  console.log("Build base URL:", baseURL);

  printDevServerConfig();

  return defineConfig({
    base: baseURL,

    plugins: [
      // mapbox-gl 3.x no longer exports setRTLTextPlugin (RTL is built in); route the bare
      // import through a shim so the storefront's map module doesn't throw (helpers/mapbox-gl-compat.ts)
      {
        name: "mapbox-gl-compat",
        enforce: "pre",
        async resolveId(source, importer) {
          if (source !== "mapbox-gl" || importer?.replace(/\\/g, "/").endsWith("helpers/mapbox-gl-compat.ts")) return null;
          return path.resolve(__dirname, "helpers/mapbox-gl-compat.ts");
        },
      },
      vue(),
   //   vuetify({ autoImport: true }), tree shaking problem in dynamic components in page builder (vSheet works but v-sheet not!)

      //@ts-ignore
      vitePluginRequire.default(),
      // Build-only: flags from CDN, WOFF2-only fonts, "use strict"; prefix,
      // and the chunk-graph check (no ../shop.js imports, no cycles).
      ...selldoneLayoutPlugins(),
      ...(IS_HTTPS
          ? [
            basicSsl({name: "selldone-test-cert"}), // Enable if you want to use https
          ]
          : []),
    ],
    resolve: {
      alias: {
        // ━━━━━━━━━━━━ Define fix path for modules ━━━━━━━━━━━━
        "@app-storefront": path.resolve(__dirname, ""),
        "@app-vendor": path.resolve(__dirname, "src/Applications/Vendor/"),

        '@selldone/core-js': resolveSelldoneModule('@selldone/core-js', 'core'),
        '@selldone/components-vue': resolveSelldoneModule('@selldone/components-vue', 'components'),
        '@selldone/page-builder': resolveSelldoneModule('@selldone/page-builder', 'pagebuilder'),
        '@selldone/translate': resolveSelldoneModule('@selldone/translate', 'translate'),
        '@selldone/sdk-storefront': resolveSelldoneModule('@selldone/sdk-storefront', 'storefront-sdk'),
        '@selldone/sdk-community': resolveSelldoneModule('@selldone/sdk-community', 'community-sdk'),

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      },
    },
    server: {
      // open: `${root}/index.html`,
      origin: `http://${DEV_HOST}:${DEV_PORT}`, // Ensure this matches your Vite server
      // Additional Vite server configuration...
      host: "localhost",
      port: DEV_PORT as number,
      cors: true, // Enable CORS
      fs: {
        strict: false, // Load files from nested packages inside node-modules

        // Allow all folders under the project root
        allow: [
          // Use path.resolve with an empty string to resolve to the project root directory
          path.resolve(""),
          MODULES_ROOT,
        ],
      },
    },

    build: {
      outDir: "dist/",
      // Fewer files: Selldone extracts the ZIP inside the upload request
      // (~100 s); ~714 files were cut off and burned the version. Small SVG
      // and PNG icons are inlined; 3D assets (.bin, textures, .hdr) stay files.
      assetsInlineLimit: layoutInlineLimit,
      // One stylesheet (app/shop.css) instead of one per lazy chunk.
      cssCodeSplit: false,
      rollupOptions: {
        input: {
          shop: "index.html",
        },
        // Selldone Layout artifact contract (selldone/cli artifact-contract.md):
        // dist/app/shop.js + dist/app/shop.css (+ app/js, app/assets). Every
        // ZIP member lives under app/ (scripts/layout-postbuild.mjs removes
        // dist/index.html, which the Layout host never uses).
        output: {
          // Entry keeps only itself, shared code in "core", lazy code in a
          // few groups; no chunk imports ../shop.js (see layoutChunks).
          manualChunks: layoutChunks,
          entryFileNames: `app/[name].js`,
          chunkFileNames: (chunk) => `app/js/${safeName(chunk.name)}.[hash].js`,
          assetFileNames: (assetInfo) => {
            const name = (assetInfo as any).names?.[0] || assetInfo.name || "";
            if (name.endsWith(".css")) {
              // With cssCodeSplit off Vite names the one stylesheet
              // style.css/index.css; the Layout runtime loads app/shop.css.
              return ["shop.css", "index.css", "style.css"].includes(name)
                  ? `app/shop.css`
                  : `app/css/${safeName(baseName(name))}.[hash].[ext]`;
            }
            return `app/assets/${safeName(baseName(name))}.[hash].[ext]`;
          },
        },
      },
    },
    assetsInclude: ["**/*.m4v"],
  });
};

function fixPath(str: string) {
  // Collapse duplicate slashes but keep the protocol's "//" (e.g. https://).
  const out = str.replace(/([^:]\/)\/+/g, "$1");
  return out.endsWith("/") ? out : out + "/";
}

function printDevServerConfig() {
  console.log("");
  console.log(
      "███████╗███████╗██╗     ██╗     ██████╗  ██████╗ ███╗   ██╗███████╗",
  );
  console.log(
      "██╔════╝██╔════╝██║     ██║     ██╔══██╗██╔═══██╗████╗  ██║██╔════╝",
  );
  console.log(
      "███████╗█████╗  ██║     ██║     ██║  ██║██║   ██║██╔██╗ ██║█████╗  ",
  );
  console.log(
      "╚════██║██╔══╝  ██║     ██║     ██║  ██║██║   ██║██║╚██╗██║██╔══╝  ",
  );
  console.log(
      "███████║███████╗███████╗███████╗██████╔╝╚██████╔╝██║ ╚████║███████╗",
  );
  console.log(
      "╚══════╝╚══════╝╚══════╝╚══════╝╚═════╝  ╚═════╝ ╚═╝  ╚═══╝╚══════╝",
  );
  console.log("");

  console.log("▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆");
  console.log("⬤ Vue Build Selldone® Business OS™ Storefront Project ⬤ ");
  console.log("The #1 operating system for fast-growing companies.");
  console.log("▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆");
  console.log("");

  const tableRow = (key: string, value: any) =>
      `┃ ${key.padEnd(20)} ┃ ${value.toString().padEnd(20)} ┃`;

  console.log("┏━━━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━━━━━━━━━━━━━┓");
  console.log("┃    Configuration     ┃       Value          ┃");
  console.log("┣━━━━━━━━━━━━━━━━━━━━━━╋━━━━━━━━━━━━━━━━━━━━━━┫");

  console.log(tableRow("ENVIRONMENT", process.env.NODE_ENV));

  if (IS_PRODUCTION) {
  } else {
    console.log(tableRow("DEV_HOST", DEV_HOST));
    console.log(tableRow("DEV_PORT", DEV_PORT));
    console.log(tableRow("IS_HTTPS", IS_HTTPS));
  }
  console.log("┗━━━━━━━━━━━━━━━━━━━━━━┻━━━━━━━━━━━━━━━━━━━━━━┛");

  console.log("");
}
