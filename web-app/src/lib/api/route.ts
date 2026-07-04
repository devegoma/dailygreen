import { ApiError, apiErrorResponse, jsonResponse } from "./errors";

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
	try {
		const user = await authenticate(request);
		if (!user) {
			throw new ApiError("UNAUTHORIZED");
		}

		const result = await handler({ request, user });
		if (result instanceof Response) {
			return result;
		}

		return jsonResponse(result, { status: successStatus });
	} catch (error) {
		return apiErrorResponse(error);
	}
}
