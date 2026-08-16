import { Avatar, AvatarFallback, AvatarImage } from "@evoapi/design-system/avatar";
import { Button } from "@evoapi/design-system/button";
import { AtSign, BadgeCheck, Briefcase, Clock, Globe, Mail, MapPin, MessageCircle, Phone, Timer, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { useEffect, useState } from "react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useInstance } from "@/contexts/InstanceContext";
import { useFetchWhatsAppProfile } from "@/lib/queries/chat/fetchProfile";
import { sendPresence } from "@/lib/queries/chat/manageChat";
import { formatWhatsAppNumber, isGroupJid } from "@/pages/instance/Chat/chat-utils";
import { presenceLabel, useChatPresence } from "@/pages/instance/Chat/use-chat-presence";

type ContactProfileDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceId?: string;
  instanceName?: string;
  remoteJid?: string;
  fallbackName?: string;
  fallbackPicture?: string;
  connected?: boolean;
  showChatButton?: boolean;
  ephemeral?: number;
};

export function ContactProfileDialog({
  open,
  onOpenChange,
  instanceId,
  instanceName,
  remoteJid,
  fallbackName,
  fallbackPicture,
  connected = false,
  showChatButton = true,
  ephemeral,
}: ContactProfileDialogProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { instance } = useInstance();
  const [presenceJid, setPresenceJid] = useState<string | undefined>(undefined);
  const group = remoteJid ? isGroupJid(remoteJid) : false;
  const { data, isFetching } = useFetchWhatsAppProfile({
    instanceName,
    number: remoteJid,
    enabled: open && connected && !!remoteJid && !group,
  });
  const presence = useChatPresence(instanceName, [remoteJid, presenceJid].filter(Boolean) as string[]);

  useEffect(() => {
    if (!open || !instanceName || !instance?.token || !remoteJid || group) return;
    let cancelled = false;
    sendPresence({ instanceName, token: instance.token, number: remoteJid, presence: "available" })
      .then((result) => {
        const resolved = (result as { jid?: string } | undefined)?.jid;
        if (!cancelled && resolved) setPresenceJid(resolved);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, instanceName, instance?.token, remoteJid, group]);

  const name = data?.name?.trim() || fallbackName || formatWhatsAppNumber(data?.number || data?.wuid || remoteJid);
  const picture = data?.picture || fallbackPicture;
  const about = (typeof data?.status === "string" && data.status) || "";
  const phone = formatWhatsAppNumber(data?.number || data?.wuid || remoteJid);
  const verified = Boolean(data?.verified);
  const presenceText = presenceLabel(presence.presence, presence.lastSeen, i18n.language);

  const openChat = () => {
    if (!instanceId || !remoteJid) return;
    onOpenChange(false);
    navigate(`/manager/instance/${instanceId}/chat/${encodeURIComponent(remoteJid)}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-sm overflow-y-auto p-0 sm:max-w-sm" showCloseButton>
        <div className="flex flex-col items-center bg-primary px-6 pb-8 pt-12 text-primary-foreground">
          <Avatar className="h-36 w-36 border-4 border-primary-foreground/20 shadow-lg">
            <AvatarImage src={picture || undefined} alt={name} className="object-cover" />
            <AvatarFallback className="bg-primary-foreground/15 text-4xl font-semibold">
              {group ? <User className="h-12 w-12" /> : name.slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <h2 className="mt-4 inline-flex items-center justify-center gap-1.5 text-center text-2xl font-semibold leading-tight">
            {name}
            {verified && (
              <BadgeCheck className="h-5 w-5 shrink-0 fill-sky-400 text-white" aria-label={t("contacts.profile.verified", { defaultValue: "Conta verificada" })} />
            )}
          </h2>
          {presenceText ? <p className="mt-1 text-sm text-primary-foreground/80">{presenceText}</p> : null}
          {isFetching && (
            <div className="mt-2">
              <LoadingSpinner />
            </div>
          )}
        </div>

        <div className="space-y-4 bg-card px-6 py-5 text-card-foreground">
          {phone ? (
            <div className="flex items-start gap-3">
              <Phone className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{phone}</p>
                <p className="text-xs text-muted-foreground">{t("contacts.profile.phone", { defaultValue: "WhatsApp" })}</p>
              </div>
            </div>
          ) : null}

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("contacts.profile.about", { defaultValue: "Recado" })}
            </p>
            <p className="mt-1 text-sm">{about || t("contacts.profile.noAbout", { defaultValue: "Sem recado" })}</p>
          </div>

          {ephemeral ? (
            <div className="flex items-start gap-3">
              <Timer className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{t("chat.ephemeral.on", { defaultValue: "Mensagens temporárias ativas" })}</p>
                <p className="text-xs text-muted-foreground">
                  {ephemeral === 86400 ? "24 horas" : ephemeral === 604800 ? "7 dias" : ephemeral === 7776000 ? "90 dias" : `${ephemeral}s`}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <Clock className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <p className="text-sm">{t("chat.ephemeral.off", { defaultValue: "Mensagens temporárias desativadas" })}</p>
            </div>
          )}

          {data?.isBusiness ? (
            <div className="space-y-3 rounded-xl bg-muted/40 p-3">
              <div className="flex items-start gap-3">
                <Briefcase className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">
                    {verified
                      ? t("contacts.profile.verifiedBusiness", { defaultValue: "Conta comercial verificada" })
                      : t("contacts.profile.business", { defaultValue: "Conta comercial" })}
                  </p>
                  {data.category ? <p className="text-xs text-muted-foreground">{data.category}</p> : null}
                </div>
              </div>
              {data.description ? <p className="text-sm text-muted-foreground">{data.description}</p> : null}
              {data.email ? (
                <p className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4" />
                  {data.email}
                </p>
              ) : null}
              {data.website ? (
                <p className="flex items-center gap-2 text-sm text-primary">
                  <Globe className="h-4 w-4" />
                  {data.website}
                </p>
              ) : null}
              {data.address ? (
                <p className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4" />
                  {data.address}
                </p>
              ) : null}
              {data.handle ? (
                <p className="flex items-center gap-2 text-sm">
                  <AtSign className="h-4 w-4" />
                  {data.handle}
                </p>
              ) : null}
              {data.hours ? (
                <div className="flex items-start gap-2 text-sm">
                  <Clock className="mt-0.5 h-4 w-4" />
                  <div>
                    <p className="font-medium">{t("contacts.profile.hours", { defaultValue: "Horário de funcionamento" })}</p>
                    {data.hours.timezone ? <p className="text-xs text-muted-foreground">{data.hours.timezone}</p> : null}
                    {Array.isArray(data.hours.config)
                      ? data.hours.config.map((slot, index) => (
                          <p key={`${slot.day_of_week || index}`} className="text-xs text-muted-foreground">
                            {slot.day_of_week || slot.mode}: {slot.open_time ?? ""}–{slot.close_time ?? ""}
                          </p>
                        ))
                      : data.hours.config
                        ? Object.entries(data.hours.config).map(([day, slots]) => (
                            <p key={day} className="text-xs text-muted-foreground">
                              {day}: {slots.map((slot) => slot.mode || `${slot.openTimeInMinutes ?? ""}–${slot.closeTimeInMinutes ?? ""}`).join(", ")}
                            </p>
                          ))
                        : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {showChatButton && instanceId && remoteJid ? (
            <Button className="w-full rounded-full" onClick={openChat}>
              <MessageCircle className="mr-2 h-4 w-4" />
              {t("contacts.openChat", { defaultValue: "Conversar" })}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
