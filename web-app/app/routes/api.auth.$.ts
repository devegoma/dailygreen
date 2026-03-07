import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { auth } from "../lib/auth.server";

export const loader = ({ request }: LoaderFunctionArgs) => {
	return auth.handler(request);
};

export const action = ({ request }: ActionFunctionArgs) => {
	return auth.handler(request);
};
