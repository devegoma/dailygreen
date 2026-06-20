import { requireAuthenticatedUser } from "./auth.server";
import { type ApiRequestContext, handleApiRequest } from "./route";

export function handleAuthenticatedApi<TResult>(
	request: Request,
	handler: (
		context: ApiRequestContext<
			Awaited<ReturnType<typeof requireAuthenticatedUser>>
		>,
	) => TResult | Response | Promise<TResult | Response>,
	options: { successStatus?: number } = {},
): Promise<Response> {
	return handleApiRequest({
		request,
		authenticate: requireAuthenticatedUser,
		handler,
		successStatus: options.successStatus,
	});
}
