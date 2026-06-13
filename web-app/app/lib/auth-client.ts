import { oneTapClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";

export const authClient = createAuthClient({
	plugins: [
		oneTapClient({
			clientId: googleClientId,
		}),
	],
});

export const { signOut, useSession, oneTap } = authClient;
