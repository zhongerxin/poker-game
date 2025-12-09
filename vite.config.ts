import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "path"
import tailwindcss from "@tailwindcss/vite"
import { resolve } from 'path';

export default defineConfig(()=>{
    const htmlInputs = {
		table: resolve(__dirname, 'table.html'),
		tableConfig: resolve(__dirname, 'tableConfig.html'),
    };
    return {
        plugins: [react(), cloudflare(), viteSingleFile({ useRecommendedBuildConfig: false }), tailwindcss()],
        build: {
            minify: false,
        },
        environments: {
            client: {
                build: {
                    rollupOptions: { input: htmlInputs, output: { inlineDynamicImports: false } },
                    cssCodeSplit: false,
                    assetsDir: '',
                },
                base: './',
            },
        },
        resolve: {
            alias: {
            "@": path.resolve(__dirname, "./src"),
            },
        },
    };
});
