/* eslint-disable react-hooks/exhaustive-deps */
import { Alert, AlertTitle } from "@evoapi/design-system/alert";
import { Avatar, AvatarImage } from "@evoapi/design-system/avatar";
import { Button } from "@evoapi/design-system/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@evoapi/design-system/card";
import { CircleUser, LogOut, MessageCircle, QrCode, Send, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { BaseHeader } from "@/components/base-header";
import { ConnectWhatsAppDialog } from "@/components/connect-whatsapp-dialog";
import { InstanceStatus } from "@/components/instance-status";
import { InstanceToken } from "@/components/instance-token";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

import { useInstance } from "@/contexts/InstanceContext";

import { useManageInstance } from "@/lib/queries/instance/manageInstance";
import { getProvider, TOKEN_ID } from "@/lib/queries/token";

import { GoQrCodeModal } from "./GoQrCodeModal";
import { GoSendMessageModal } from "./GoSendMessageModal";

function DashboardInstance() {
  const { t, i18n } = useTranslation();
  const numberFormatter = new Intl.NumberFormat(i18n.language);
  const [qrOpen, setQrOpen] = useState(false);
  const [goQrOpen, setGoQrOpen] = useState(false);
  const [goSendOpen, setGoSendOpen] = useState(false);
  const isGo = getProvider() === "go";

  const { logout } = useManageInstance();
  const { instance, reloadInstance } = useInstance();

  useEffect(() => {
    if (instance) {
      localStorage.setItem(TOKEN_ID.INSTANCE_ID, instance.id);
      localStorage.setItem(TOKEN_ID.INSTANCE_NAME, instance.name);
      localStorage.setItem(TOKEN_ID.INSTANCE_TOKEN, instance.token);
    }
  }, [instance]);

  const handleLogout = async (instanceName: string) => {
    try {
      await logout(instanceName);
      await reloadInstance();
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const stats = useMemo(
    () => ({
      contacts: instance?._count?.Contact || 0,
      chats: instance?._count?.Chat || 0,
      messages: instance?._count?.Message || 0,
    }),
    [instance],
  );

  if (!instance) return <LoadingSpinner />;

  const connected = instance.connectionStatus === "open";
  const configured = connected || Boolean(instance.ownerJid);

  return (
    <div className="flex flex-col">
      <BaseHeader
        title={instance.name}
        subtitle={
          configured
            ? instance.profileName || t("instance.dashboard.subtitle", { defaultValue: "Gerencie sua instância" })
            : t("status.unconfigured", { defaultValue: "Não configurado" })
        }
        secondaryActions={
          configured
            ? [
                ...(connected
                  ? [
                      {
                        label: t("instance.dashboard.button.disconnect", { defaultValue: "Desconectar" }),
                        icon: <LogOut className="h-4 w-4" />,
                        onClick: () => handleLogout(instance.name),
                        variant: "destructive" as const,
                      },
                    ]
                  : []),
                ...(isGo && connected
                  ? [
                      {
                        label: t("instance.dashboard.button.sendMessage", { defaultValue: "Enviar mensagem" }),
                        icon: <Send className="h-4 w-4" />,
                        onClick: () => setGoSendOpen(true),
                        variant: "default" as const,
                      },
                    ]
                  : []),
              ]
            : []
        }
      />

      <div className="flex flex-col gap-6">
        <Card className="border-border bg-card text-card-foreground">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {instance.profilePicUrl && (
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={instance.profilePicUrl} alt={instance.name} />
                  </Avatar>
                )}
                <div>
                  <CardTitle className="break-all">{instance.profileName || instance.name}</CardTitle>
                  {instance.ownerJid && (
                    <p className="mt-1 break-all text-xs text-muted-foreground">{instance.ownerJid.split("@")[0]}</p>
                  )}
                </div>
              </div>
              <InstanceStatus status={instance.connectionStatus} configured={configured} />
            </div>
          </CardHeader>
          <CardContent className="flex flex-col items-start space-y-4">
            {configured && (
              <div className="w-full">
                <InstanceToken token={instance.token} />
              </div>
            )}

            {!connected && (
              <Alert variant="warning" className="flex flex-wrap items-center justify-between gap-3">
                <AlertTitle className="text-lg font-bold tracking-wide">
                  {configured
                    ? t("instance.dashboard.alert")
                    : t("instance.dashboard.unconfigured", { defaultValue: "Nenhuma conta WhatsApp configurada" })}
                </AlertTitle>

                {isGo ? (
                  <>
                    <Button onClick={() => setGoQrOpen(true)}>
                      <QrCode className="mr-2 h-4 w-4" />
                      {t("instance.dashboard.button.qrcode.label")}
                    </Button>
                    <GoQrCodeModal open={goQrOpen} onOpenChange={setGoQrOpen} />
                  </>
                ) : (
                  <>
                    <Button onClick={() => setQrOpen(true)}>
                      <QrCode className="mr-2 h-4 w-4" />
                      {configured
                        ? t("instance.dashboard.button.qrcode.label")
                        : t("instance.dashboard.button.configure", { defaultValue: "Configurar" })}
                    </Button>
                    <ConnectWhatsAppDialog instance={instance} open={qrOpen} onOpenChange={setQrOpen} onConnected={reloadInstance} />
                  </>
                )}
              </Alert>
            )}
          </CardContent>
          <CardFooter />
        </Card>

        {isGo && <GoSendMessageModal open={goSendOpen} onOpenChange={setGoSendOpen} />}

        {configured && <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="border-border bg-card text-card-foreground">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <CircleUser size="18" />
                {t("instance.dashboard.contacts")}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-bold text-card-foreground">{numberFormatter.format(stats.contacts)}</CardContent>
          </Card>
          <Card className="border-border bg-card text-card-foreground">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <UsersRound size="18" />
                {t("instance.dashboard.chats")}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-bold text-card-foreground">{numberFormatter.format(stats.chats)}</CardContent>
          </Card>
          <Card className="border-border bg-card text-card-foreground">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <MessageCircle size="18" />
                {t("instance.dashboard.messages")}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-bold">{numberFormatter.format(stats.messages)}</CardContent>
          </Card>
        </section>}
      </div>
    </div>
  );
}

export { DashboardInstance };
