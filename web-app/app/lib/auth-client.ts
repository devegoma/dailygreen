import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	// ブラウザで動く前提なので baseURL は自動推論に任せる（省略）
});

// コンポーネントで使いやすいように hooks をエクスポート
export const { signIn, signOut, useSession } = authClient;
