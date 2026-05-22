import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import "dotenv/config";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        organizer: resolve(__dirname, "organizer.html"),
      },
    },
  },
  server: {
    port: 3000,
    open: false,
    allowedHosts: ["localhost", process.env.VITE_APP_URL],
  },
});
