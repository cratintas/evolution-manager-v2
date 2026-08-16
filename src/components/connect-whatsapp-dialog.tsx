/* eslint-disable react-hooks/exhaustive-deps */
import { Button } from "@evoapi/design-system/button";
import { Label } from "@evoapi/design-system/label";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import QRCode from "react-qr-code";
import { toast } from "react-toastify";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useTheme } from "@/components/theme-provider";

import { api } from "@/lib/queries/api";
import { getToken, TOKEN_ID } from "@/lib/queries/token";
import { connectErrorMessage, extractConnectionState, extractQrPayload } from "@/lib/whatsapp-connect";
import { connectSocket, disconnectSocket } from "@/services/websocket/socket";
import { Instance } from "@/types/evolution.types";

type ConnectWhatsAppDialogProps = {
  instance: Instance;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected?: () => Promise<void> | void;
};

export function ConnectWhatsAppDialog({ instance, open, onOpenChange, onConnected }: ConnectWhatsAppDialogProps) {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const token = instance.token || getToken(TOKEN_ID.TOKEN) || "";
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState("");
  const [pairingNumber, setPairingNumber] = useState(instance.number || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const startedRef = useRef(false);
  const startedAtRef = useRef(0);
  const CONNECT_TIMEOUT_MS = 60_000;

  const qrColor = useMemo(() => (resolvedTheme === "dark" ? "#e8f0ec" : "#17241d"), [resolvedTheme]);

  const applyPayload = (data: unknown) => {
    const qr = extractQrPayload(data);
    if (qr.code) setQrCode(qr.code);
    if (qr.pairingCode) setPairingCode(qr.pairingCode);
    return extractConnectionState(data);
  };

  const requestConnect = async (wantPairing: boolean) => {
    if (!token) {
      setError(t("instance.dashboard.connect.missingToken", { defaultValue: "Token da instância não encontrado." }));
      return;
    }
    setBusy(true);
    setError("");
    startedAtRef.current = Date.now();
    startedRef.current = true;
    try {
      const params = wantPairing ? { number: pairingNumber.replace(/\D/g, "") || undefined } : undefined;
      const { data } = await api.get(`/instance/connect/${instance.name}`, {
        headers: { apikey: token },
        params,
        timeout: 45000,
      });
      if ((data as { error?: boolean })?.error) {
        setError(connectErrorMessage(data, t("instance.dashboard.connect.failed", { defaultValue: "Não foi possível iniciar a conexão." })));
        return;
      }
      applyPayload(data);
      startedRef.current = true;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { response?: { message?: string }; message?: string } }; message?: string };
      const message =
        axiosErr?.response?.data?.response?.message ||
        axiosErr?.response?.data?.message ||
        axiosErr?.message ||
        t("instance.dashboard.connect.failed", { defaultValue: "Não foi possível iniciar a conexão." });
      setError(Array.isArray(message) ? message.join("; ") : String(message));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!open) {
      setQrCode(null);
      setPairingCode("");
      setError("");
      setBusy(false);
      startedRef.current = false;
      startedAtRef.current = 0;
      return;
    }
    setPairingNumber(instance.number || "");
    startedAtRef.current = Date.now();
    void requestConnect(false);
  }, [open, instance.name]);

  useEffect(() => {
    if (!open || !token) return;

    let cancelled = false;
    const tick = async () => {
      if (!startedRef.current || busy) return;
      if (startedAtRef.current && Date.now() - startedAtRef.current >= CONNECT_TIMEOUT_MS) {
        startedRef.current = false;
        setQrCode(null);
        setError(
          t("instance.dashboard.connect.timeout", {
            defaultValue: "Tempo de conexão esgotado (1 minuto). Tente novamente mais tarde para evitar bloqueio do WhatsApp.",
          }),
        );
        return;
      }
      try {
        const { data } = await api.get(`/instance/connectionState/${instance.name}`, {
          headers: { apikey: token },
        });
        if (cancelled) return;
        const state = extractConnectionState(data);
        if (state === "open") {
          toast.success(t("instance.dashboard.connect.success", { defaultValue: "WhatsApp conectado." }));
          await onConnected?.();
          onOpenChange(false);
          return;
        }
        if (state === "refused" || (state === "close" && startedAtRef.current && Date.now() - startedAtRef.current >= CONNECT_TIMEOUT_MS)) {
          startedRef.current = false;
          setQrCode(null);
          setError(
            t("instance.dashboard.connect.timeout", {
              defaultValue: "Tempo de conexão esgotado (1 minuto). Tente novamente mais tarde para evitar bloqueio do WhatsApp.",
            }),
          );
          return;
        }
        if (state === "connecting") {
          const qrRes = await api.get(`/instance/connect/${instance.name}`, {
            headers: { apikey: token },
            timeout: 15000,
          });
          if (!cancelled) applyPayload(qrRes.data);
        }
      } catch {
        // next tick retries state only
      }
    };

    const interval = window.setInterval(tick, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [open, instance.name, token]);

  useEffect(() => {
    if (!open) return;
    const serverUrl = getToken(TOKEN_ID.API_URL);
    if (!serverUrl) return;
    const socket = connectSocket(serverUrl);

    const onQr = (payload: unknown) => {
      applyPayload(payload);
    };
    const onConnection = async (payload: unknown) => {
      const state = extractConnectionState(payload);
      if (state === "open") {
        toast.success(t("instance.dashboard.connect.success", { defaultValue: "WhatsApp conectado." }));
        await onConnected?.();
        onOpenChange(false);
      }
    };

    socket.on("qrcode.updated", onQr);
    socket.on("connection.update", onConnection);
    socket.connect();
    return () => {
      socket.off("qrcode.updated");
      socket.off("connection.update");
      disconnectSocket(socket);
    };
  }, [open, instance.name]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,calc(100dvh-2rem))] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("instance.dashboard.button.qrcode.title")}</DialogTitle>
          <DialogDescription>
            {t("instance.dashboard.connect.hint", {
              defaultValue: "Escaneie o QR no WhatsApp ou use o código de pareamento.",
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          {error ? (
            <p className="w-full rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          {qrCode ? (
            <div className="rounded-2xl border border-border bg-card p-4">
              <QRCode value={qrCode} size={240} bgColor="transparent" fgColor={qrColor} className="rounded-sm" />
            </div>
          ) : (
            <div className="flex h-60 items-center justify-center">
              <LoadingSpinner />
            </div>
          )}

          {pairingCode ? (
            <div className="w-full rounded-xl bg-muted px-4 py-3 text-center">
              <p className="text-sm font-medium">{t("instance.dashboard.button.pairingCode.title")}</p>
              <p className="mt-1 font-mono text-2xl tracking-widest">
                {pairingCode.length >= 8 ? `${pairingCode.slice(0, 4)}-${pairingCode.slice(4, 8)}` : pairingCode}
              </p>
            </div>
          ) : null}

          <div className="w-full space-y-2">
            <Label htmlFor="pairing-number">
              {t("instance.dashboard.connect.number", { defaultValue: "Número para pareamento (DDI + número)" })}
            </Label>
            <div className="flex gap-2">
              <Input
                id="pairing-number"
                placeholder="5511999999999"
                value={pairingNumber}
                onChange={(event) => setPairingNumber(event.target.value)}
              />
              <Button type="button" variant="outline" className="rounded-full" disabled={busy || !pairingNumber.replace(/\D/g, "")} onClick={() => void requestConnect(true)}>
                {t("instance.dashboard.button.pairingCode.label")}
              </Button>
            </div>
          </div>

          <Button type="button" variant="secondary" className="rounded-full" disabled={busy} onClick={() => void requestConnect(false)}>
            {t("instance.dashboard.connect.refreshQr", { defaultValue: "Atualizar QR" })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
