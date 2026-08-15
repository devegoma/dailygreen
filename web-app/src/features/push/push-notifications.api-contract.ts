export type NotificationSettingsResponse = {
	enabled: boolean;
	notifyAt: string;
	vapidPublicKey: string | null;
};

export type UpdateNotificationSettingsRequest = {
	enabled?: boolean;
	notifyAt?: string;
};

export type PushSubscriptionRequest = {
	endpoint: string;
	expirationTime: number | null;
	keys: {
		p256dh: string;
		auth: string;
	};
};

export type DeletePushSubscriptionRequest = {
	endpoint: string;
};
