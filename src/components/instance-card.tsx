import { Badge } from "@evoapi/design-system/badge";
import { Button } from "@evoapi/design-system/button";
import { Card, CardContent } from "@evoapi/design-system/card";
import { FlaskConical, QrCode, Settings, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { ConnectWhatsAppDialog } from "@/components/connect-whatsapp-dialog";
import { TestInteractiveModal } from "@/components/test-interactive-modal";

import { Instance } from "@/types/evolution.types";

const StatusBadge = ({ status }: { status?: string }) => {
  const { t } = useTranslation();
  if (status === "open") return <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20">{t("status.open")}</Badge>;
  if (status === "connecting") return <Badge className="bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20">{t("status.connecting")}</Badge>;
  return <Badge className="bg-red-500/10 text-red-500 hover:bg-red-500/20">{t("status.closed")}</Badge>;
};

interface InstanceCardProps {
  instance: Instance;
  isDeleting?: boolean;
  onDelete: (instance: Instance) => void;
  onChanged?: () => void;
}

export function InstanceCard({ instance, isDeleting, onDelete, onChanged }: InstanceCardProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [testOpen, setTestOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const numberFormatter = new Intl.NumberFormat(i18n.language);
  const displayName = instance.profileName || instance.name;
  const goToInstance = () => navigate(`/manager/instance/${instance.id}/dashboard`);
  const goToSettings = () => navigate(`/manager/instance/${instance.id}/settings`);
  const connected = instance.connectionStatus === "open";
  const canTest = connected;

  return (
    <Card className="flex flex-col overflow-hidden rounded-2xl border-border bg-card text-card-foreground shadow-sm transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-black/10">
      <CardContent className="flex flex-1 flex-col p-0">
        <button
          type="button"
          onClick={goToInstance}
          className="flex w-full items-center gap-3 border-b border-border p-4 text-left"
        >
          {instance.profilePicUrl ? (
            <div className="flex-shrink-0">
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-muted">
                <img
                  src={instance.profilePicUrl}
                  alt={displayName}
                  className="h-12 w-12 rounded-xl object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-muted text-lg font-semibold text-muted-foreground">
              {displayName.slice(0, 2).toUpperCase()}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold text-card-foreground">{displayName}</h3>
            <p className="truncate text-xs text-muted-foreground">{instance.name}</p>
          </div>

          <div className="flex-shrink-0">
            <StatusBadge status={instance.connectionStatus} />
          </div>
        </button>

        <div className="flex-1 space-y-1 px-4 py-3 text-xs text-muted-foreground">
          {instance.ownerJid && (
            <div className="flex items-center justify-between">
              <span>{t("dashboard.card.phone", { defaultValue: "Número" })}</span>
              <span className="ml-2 truncate font-mono">{instance.ownerJid.split("@")[0]}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span>{t("instance.dashboard.contacts")}</span>
            <span className="font-mono">{numberFormatter.format(instance._count?.Contact || 0)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>{t("instance.dashboard.messages")}</span>
            <span className="font-mono">{numberFormatter.format(instance._count?.Message || 0)}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/40 p-3">
          {!connected && (
            <Button size="sm" className="rounded-full" onClick={() => setConnectOpen(true)}>
              <QrCode className="mr-1.5 h-4 w-4" />
              {t("instance.dashboard.button.qrcode.label")}
            </Button>
          )}
          <Button size="sm" variant="outline" className="rounded-full" onClick={goToSettings}>
            <Settings className="mr-1.5 h-4 w-4" />
            {t("dashboard.settings")}
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="h-9 w-9 rounded-full text-muted-foreground"
            disabled={!canTest}
            title={canTest ? t("testInteractive.title") : t("testInteractive.requiresOpen")}
            onClick={() => setTestOpen(true)}
          >
            <FlaskConical className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="ml-auto h-9 w-9 rounded-full text-red-500 hover:bg-red-500/10 hover:text-red-600"
            disabled={isDeleting}
            onClick={() => onDelete(instance)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>

      <TestInteractiveModal instance={instance} open={testOpen} onOpenChange={setTestOpen} />
      <ConnectWhatsAppDialog
        instance={instance}
        open={connectOpen}
        onOpenChange={setConnectOpen}
        onConnected={onChanged}
      />
    </Card>
  );
}
