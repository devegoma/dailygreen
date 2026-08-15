self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function parsePushPayload(event) {
  if (!event.data) {
    return {};
  }

  try {
    return event.data.json();
  } catch {
    return { body: event.data.text() };
  }
}

function resolveSameOriginUrl(candidate) {
  try {
    const target = new URL(candidate || "/", self.location.origin);
    return target.origin === self.location.origin ? target.href : `${self.location.origin}/`;
  } catch {
    return `${self.location.origin}/`;
  }
}

self.addEventListener("push", (event) => {
  const payload = parsePushPayload(event);
  const title = typeof payload.title === "string" ? payload.title : "Daily Green";
  const body =
    typeof payload.body === "string"
      ? payload.body
      : "今日の習慣を確認してみましょう";
  const url = resolveSameOriginUrl(payload.url);

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/app-icon.svg",
      badge: "/app-icon.svg",
      tag: "daily-green-reminder",
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = resolveSameOriginUrl(event.notification.data?.url);

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (windowClients) => {
        for (const client of windowClients) {
          try {
            if (new URL(client.url).origin === self.location.origin) {
              if ("navigate" in client) {
                await client.navigate(url);
              }
              if ("focus" in client) {
                return client.focus();
              }
            }
          } catch {
            // Ignore stale or malformed client URLs and continue searching.
          }
        }

        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
        return undefined;
      }),
  );
});
