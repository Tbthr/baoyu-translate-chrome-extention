let keepaliveInterval: ReturnType<typeof setInterval> | null = null;

export function startKeepalive(): void {
  stopKeepalive();

  keepaliveInterval = setInterval(() => {
    chrome.runtime.getPlatformInfo?.();
  }, 25000);
}

export function stopKeepalive(): void {
  if (keepaliveInterval) {
    clearInterval(keepaliveInterval);
    keepaliveInterval = null;
  }
}

export function setupPortKeepalive(): void {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'keepalive') {
      port.onDisconnect.addListener(() => {
        // Port disconnected, SW may shut down
      });
    }
  });
}
