import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import {defineConfig, loadEnv} from "vite";

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, ".", "");
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== "true",
    },
    build: {
      rollupOptions: {
        output: {
          // Split heavy vendor libraries into separate chunks so each route
          // only downloads the code it actually needs.
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            // TipTap + ProseMirror — only used by Builder/RichTextEditor
            if (id.includes("@tiptap") || id.includes("prosemirror")) return "vendor-editor";
            // Drag-and-drop — only used by Builder
            if (id.includes("@dnd-kit")) return "vendor-dnd";
            // Charts — only used by AnalyticsTab inside Builder
            if (id.includes("recharts") || id.includes("/d3-") || id.includes("/d3/")) return "vendor-charts";
            // Animation — shared between Builder and Renderer
            if (id.includes("framer-motion") || id.includes("/motion/")) return "vendor-motion";
            // Firebase — shared across pages
            if (id.includes("firebase")) return "vendor-firebase";
            return undefined;
          },
        },
      },
    },
  };
});
