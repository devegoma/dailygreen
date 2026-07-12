import type { AuthenticatedUser } from "~/lib/api/auth.server";
import { notImplementedApiError } from "~/lib/api/errors";

export type GetHomeDataInput = {
	user: AuthenticatedUser;
	now?: Date;
};

export async function getHomeData(_input: GetHomeDataInput): Promise<never> {
	throw notImplementedApiError("GET /api/home");
}
