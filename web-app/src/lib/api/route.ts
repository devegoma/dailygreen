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
	successHeaders?: HeadersInit;
};

const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function resolveRequestId(request: Request): string {
	const requestId = request.headers.get("x-request-id");
	return requestId && uuidPattern.test(requestId)
		? requestId
		: crypto.randomUUID();
}

function withRequestId(response: Response, requestId: string): Response {
	try {
		const headers = new Headers(response.headers);
		headers.set("x-request-id", requestId);

		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers,
		});
	} catch {
		return response;
	}
}

export async function handleApiRequest<TUser, TResult>({
	request,
	authenticate,
	handler,
	successStatus = 200,
	successHeaders,
}: HandleApiRequestOptions<TUser, TResult>): Promise<Response> {
	const requestId = resolveRequestId(request);
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
			response = jsonResponse(result, {
				status: successStatus,
				headers: successHeaders,
			});
		}
	} catch (error) {
		caughtError = error;
		response = apiErrorResponse(error);
	}
	response = withRequestId(response, requestId);
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
