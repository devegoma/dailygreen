import { auth } from "~/lib/auth.server";
import { ApiError } from "./errors";

export type AuthenticatedSession = NonNullable<
	Awaited<ReturnType<typeof auth.api.getSession>>
>;
export type AuthenticatedUser = AuthenticatedSession["user"];

export async function getAuthenticatedSession(
	request: Request,
): Promise<AuthenticatedSession | null> {
	return auth.api.getSession({
		headers: request.headers,
	});
}

export async function requireAuthenticatedUser(
	request: Request,
): Promise<AuthenticatedUser> {
	const session = await getAuthenticatedSession(request);
	if (!session?.user) {
		throw new ApiError("UNAUTHORIZED");
	}

	return session.user;
}
