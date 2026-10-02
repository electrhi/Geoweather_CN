self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "체감온도 단계가 상승했습니다." };
  }

  const title = data.title || "충남권 온열질환 알림";
  const options = {
    body: data.body || "체감온도 단계가 상승했습니다.",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    tag: data.data?.region_id ? "heat-" + data.data.region_id : "heat-alert",
    renotify: true,
    data: { url: data.url || "./" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "./", self.location.origin).href;

  event.waitUntil((async () => {
    const clientsList = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clientsList) {
      if ("focus" in client) {
        client.navigate(target);
        return client.focus();
      }
    }
    return clients.openWindow(target);
  })());
});
