self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data?.text() };
  }

  const title = payload.title || "Geoweather_CN";
  const options = {
    body: payload.body || "체감온도 알림이 도착했습니다.",
    tag: payload.tag || "geoweather-cn-alert",
    data: {
      url: payload.url || "./",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "./";

  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => client.url.includes("Geoweather_CN"));

    if (existing) {
      await existing.focus();
      return;
    }

    await clients.openWindow(url);
  })());
});
