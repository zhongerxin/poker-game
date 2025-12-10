import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "path"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig(()=>{
    return {
        plugins: [react(), cloudflare(), viteSingleFile({ useRecommendedBuildConfig: true }), tailwindcss()],
        build: {
            minify: false,
        },
        environments: {
            client: {
                build: {
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
