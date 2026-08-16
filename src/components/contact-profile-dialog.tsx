import { Avatar, AvatarFallback, AvatarImage } from "@evoapi/design-system/avatar";
import { Button } from "@evoapi/design-system/button";
import { BadgeCheck, Briefcase, MessageCircle, Phone, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useFetchWhatsAppProfile } from "@/lib/queries/chat/fetchProfile";
import { formatWhatsAppNumber, isGroupJid } from "@/pages/instance/Chat/chat-utils";

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
}: ContactProfileDialogProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const group = remoteJid ? isGroupJid(remoteJid) : false;
  const { data, isFetching } = useFetchWhatsAppProfile({
    instanceName,
    number: remoteJid,
    enabled: open && connected && !!remoteJid && !group,
  });

  const name = data?.name?.trim() || data?.verifiedName || fallbackName || formatWhatsAppNumber(remoteJid);
  const picture = data?.picture || fallbackPicture;
  const about = typeof data?.status === "string" ? data.status : "";
  const phone = formatWhatsAppNumber(data?.wuid || remoteJid);
  const verified = Boolean(data?.verified || data?.verifiedName);

  const openChat = () => {
    if (!instanceId || !remoteJid) return;
    onOpenChange(false);
    navigate(`/manager/instance/${instanceId}/chat/${encodeURIComponent(remoteJid)}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm overflow-hidden p-0 sm:max-w-sm" showCloseButton>
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
          {isFetching && (
            <div className="mt-2">
              <LoadingSpinner />
            </div>
          )}
        </div>

        <div className="space-y-4 bg-card px-6 py-5 text-card-foreground">
          <div className="flex items-start gap-3">
            <Phone className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{phone}</p>
              <p className="text-xs text-muted-foreground">
                {t("contacts.profile.phone", { defaultValue: "WhatsApp" })}
              </p>
            </div>
          </div>

          {about ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("contacts.profile.about", { defaultValue: "Recado" })}
              </p>
              <p className="mt-1 text-sm">{about}</p>
            </div>
          ) : null}

          {data?.isBusiness || verified ? (
            <div className="flex items-start gap-3">
              <Briefcase className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">
                  {verified
                    ? t("contacts.profile.verifiedBusiness", { defaultValue: "Conta comercial verificada" })
                    : t("contacts.profile.business", { defaultValue: "Conta comercial" })}
                </p>
                {data.description ? <p className="mt-1 text-sm text-muted-foreground">{data.description}</p> : null}
                {data.website ? <p className="mt-1 text-xs text-primary">{data.website}</p> : null}
              </div>
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
