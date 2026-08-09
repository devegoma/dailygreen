import { createFileRoute } from "@tanstack/react-router";
import { HomeScreen } from "~/features/home/home-screen";

export const Route = createFileRoute("/")({
	head: () => ({
		meta: [
			{ title: "Daily Green" },
			{ name: "description", content: "習慣化アプリ" },
		],
	}),
	component: HomeScreen,
});
