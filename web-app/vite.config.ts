import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
	server: {
		port: 5173,
	},
	plugins: [
		tsconfigPaths({ projects: ["./tsconfig.json"] }),
		tanstackStart(),
		nitro(),
		tailwindcss(),
		viteReact(),
	],
});
