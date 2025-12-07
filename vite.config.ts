import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "path"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
	plugins: [react(), cloudflare(),viteSingleFile(),tailwindcss()],
	build: {
    	minify: false
  	},
	resolve: {
		alias: {
		"@": path.resolve(__dirname, "./src"),
		},
	},
});
