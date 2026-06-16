import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const port = Number(process.env.PORT) || 5173;
const behindReverseProxy = Boolean(process.env.PORT);

export default defineConfig({
	plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
	server: {
		host: true,
		port,
		strictPort: true,
		...(behindReverseProxy && {
			hmr: {
				clientPort: 443,
				protocol: "wss",
			},
		}),
	},
});
