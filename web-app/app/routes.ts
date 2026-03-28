import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
	route("api/auth/*", "./routes/api.auth.$.ts"),
	index("./routes/home.tsx"),
] satisfies RouteConfig;
