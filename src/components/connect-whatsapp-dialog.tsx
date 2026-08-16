/* eslint-disable react-hooks/exhaustive-deps */
import { Button } from "@evoapi/design-system/button";
import { Label } from "@evoapi/design-system/label";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import QRCode from "react-qr-code";
import { toast } from "react-toastify";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useTheme } from "@/components/theme-provider";

import { api } from "@/lib/queries/api";
import { useManageInstance } from "@/lib/queries/instance/manageInstance";
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
  const { connect } = useManageInstance();
  const token = getToken(TOKEN_ID.INSTANCE_TOKEN) || instance.token || getToken(TOKEN_ID.TOKEN);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState("");
  const [pairingNumber, setPairingNumber] = useState(instance.number || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const qrColor = useMemo(() => (resolvedTheme === "dark" ? "#e8f0ec" : "#17241d"), [resolvedTheme]);

  const applyPayload = (data: unknown) => {
    const qr = extractQrPayload(data);
    if (qr.code) setQrCode(qr.code);
    if (qr.pairingCode) setPairingCode(qr.pairingCode);
    const state = extractConnectionState(data);
    return { qr, state };
  };

  const requestConnect = async (wantPairing: boolean) => {
    if (!token) {
      setError(t("instance.dashboard.connect.missingToken", { defaultValue: "Token da instância não encontrado." }));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await connect({
        instanceName: instance.name,
        token,
        number: wantPairing ? pairingNumber.replace(/\D/g, "") || undefined : undefined,
      });
      if ((data as { error?: boolean })?.error) {
        setError(connectErrorMessage(data, t("instance.dashboard.connect.failed", { defaultValue: "Não foi possível iniciar a conexão." })));
        return;
      }
      applyPayload(data);
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
      return;
    }
    setPairingNumber(instance.number || "");
    void requestConnect(false);
  }, [open, instance.name]);

  useEffect(() => {
    if (!open || !token) return;

    let cancelled = false;
    const tick = async () => {
      try {
        const [connectRes, stateRes] = await Promise.all([
          api.get(`/instance/connect/${instance.name}`, { headers: { apikey: token } }),
          api.get(`/instance/connectionState/${instance.name}`, { headers: { apikey: token } }),
        ]);
        if (cancelled) return;
        applyPayload(connectRes.data);
        const state = extractConnectionState(stateRes.data);
        if (state === "open") {
          toast.success(t("instance.dashboard.connect.success", { defaultValue: "WhatsApp conectado." }));
          await onConnected?.();
          onOpenChange(false);
        }
      } catch {
        // keep polling; next tick retries
      }
    };

    const interval = window.setInterval(tick, 2500);
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
      const qr = extractQrPayload(payload);
      if (qr.code) setQrCode(qr.code);
      if (qr.pairingCode) setPairingCode(qr.pairingCode);
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
            <div className="rounded-lg border border-border bg-card p-4">
              <QRCode value={qrCode} size={240} bgColor="transparent" fgColor={qrColor} className="rounded-sm" />
            </div>
          ) : (
            <div className="flex h-60 items-center justify-center">
              <LoadingSpinner />
            </div>
          )}

          {pairingCode ? (
            <div className="w-full rounded-md bg-muted px-4 py-3 text-center">
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
              <Button type="button" variant="outline" disabled={busy || !pairingNumber.replace(/\D/g, "")} onClick={() => void requestConnect(true)}>
                {t("instance.dashboard.button.pairingCode.label")}
              </Button>
            </div>
          </div>

          <Button type="button" variant="secondary" disabled={busy} onClick={() => void requestConnect(false)}>
            {t("instance.dashboard.connect.refreshQr", { defaultValue: "Atualizar QR" })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
