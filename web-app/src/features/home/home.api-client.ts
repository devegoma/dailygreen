import { requestJson } from "~/lib/api/client";
import type { HomeDataResponse } from "./home.contract";

export function getHomeData(signal?: AbortSignal): Promise<HomeDataResponse> {
	return requestJson<HomeDataResponse>("/api/home", { method: "GET", signal });
}
