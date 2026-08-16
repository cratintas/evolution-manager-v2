export type QrPayload = {
  code?: string;
  pairingCode?: string;
  base64?: string;
};

export function extractQrPayload(data: unknown): QrPayload {
  if (!data || typeof data !== "object") return {};
  const root = data as Record<string, unknown>;
  const nested = (root.qrcode || root.qrCode || root.data || root) as Record<string, unknown>;
  const deeper = (nested?.qrcode || nested) as Record<string, unknown>;
  return {
    code: typeof deeper?.code === "string" ? deeper.code : typeof nested?.code === "string" ? nested.code : undefined,
    pairingCode:
      typeof deeper?.pairingCode === "string"
        ? deeper.pairingCode
        : typeof nested?.pairingCode === "string"
          ? nested.pairingCode
          : undefined,
    base64: typeof deeper?.base64 === "string" ? deeper.base64 : typeof nested?.base64 === "string" ? nested.base64 : undefined,
  };
}

export function extractConnectionState(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const root = data as Record<string, unknown>;
  const instance = root.instance as Record<string, unknown> | undefined;
  const nested = root.data as Record<string, unknown> | undefined;
  const state = instance?.state || instance?.status || nested?.state || nested?.status || root.state || root.status;
  return typeof state === "string" ? state : undefined;
}

export function connectErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;
  const root = data as Record<string, unknown>;
  if (root.error && root.message) {
    return Array.isArray(root.message) ? root.message.join("; ") : String(root.message);
  }
  return fallback;
}
