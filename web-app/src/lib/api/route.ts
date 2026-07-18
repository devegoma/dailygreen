import { ApiError, apiErrorResponse, jsonResponse } from "./errors";
import { writeApiLog } from "./logger.server";

export type ApiRequestContext<TUser> = {
	request: Request;
	user: TUser;
};

type HandleApiRequestOptions<TUser, TResult> = {
	request: Request;
	authenticate: (request: Request) => Promise<TUser | null>;
	handler: (
		context: ApiRequestContext<TUser>,
	) => TResult | Response | Promise<TResult | Response>;
	successStatus?: number;
};

export async function handleApiRequest<TUser, TResult>({
	request,
	authenticate,
	handler,
	successStatus = 200,
}: HandleApiRequestOptions<TUser, TResult>): Promise<Response> {
	const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
	const startedAt = performance.now();
	let userId: string | undefined;
	let caughtError: unknown;
	let response: Response;
	try {
		const user = await authenticate(request);
		if (!user) {
			throw new ApiError("UNAUTHORIZED");
		}
		userId =
			typeof user === "object" && user !== null && "id" in user
				? String(user.id)
				: undefined;

		const result = await handler({ request, user });
		if (result instanceof Response) {
			response = result;
		} else {
			response = jsonResponse(result, { status: successStatus });
		}
	} catch (error) {
		caughtError = error;
		response = apiErrorResponse(error);
	}
	response.headers.set("x-request-id", requestId);
	writeApiLog({
		requestId,
		request,
		startedAt,
		status: response.status,
		userId,
		error: caughtError,
	});
	return response;
}
