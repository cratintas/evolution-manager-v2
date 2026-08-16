import { Avatar, AvatarFallback, AvatarImage } from "@evoapi/design-system/avatar";
import { Button } from "@evoapi/design-system/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, Search, User } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";

import { ContactProfileDialog } from "@/components/contact-profile-dialog";
import { LanguageToggle } from "@/components/language-toggle";
import { ModeToggle } from "@/components/mode-toggle";
import { useInstance } from "@/contexts/InstanceContext";
import { useFindContacts } from "@/lib/queries/chat/findContacts";
import { useLiveProfiles } from "@/lib/queries/chat/fetchProfile";
import { formatJid, formatWhatsAppNumber } from "@/pages/instance/Chat/chat-utils";

function Contacts() {
  const { t } = useTranslation();
  const { instance } = useInstance();
  const { instanceId } = useParams<{ instanceId: string }>();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [profileJid, setProfileJid] = useState<string | null>(null);
  const { data: contacts = [], isLoading } = useFindContacts({ instanceName: instance?.name });
  const liveProfiles = useLiveProfiles(instance?.name, contacts, instance?.connectionStatus === "open");

  const visible = useMemo(() => {
    const list = [...contacts].sort((a, b) => (a.pushName || a.remoteJid).localeCompare(b.pushName || b.remoteJid));
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (contact) =>
        contact.pushName?.toLowerCase().includes(q) || contact.remoteJid.toLowerCase().includes(q),
    );
  }, [contacts, search]);

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="border-b border-border bg-card px-6 py-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">{t("contacts.title", { defaultValue: "Contatos" })}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("contacts.subtitle", { defaultValue: "Todos os clientes salvos nesta instância" })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <ModeToggle />
          </div>
        </div>
        <div className="relative mt-4 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("contacts.search", { defaultValue: "Buscar contatos..." })}
            className="pl-9"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">{t("contacts.loading", { defaultValue: "Carregando contatos..." })}</p>
        ) : visible.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center">
            <User className="mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              {t("contacts.empty", { defaultValue: "Nenhum contato encontrado" })}
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {visible.map((contact) => {
              const live = liveProfiles.get(contact.remoteJid);
              const name = live?.name || contact.pushName || formatJid(contact.remoteJid);
              const picture = live?.picture || contact.profilePicUrl;
              return (
              <li key={contact.id || contact.remoteJid} className="flex items-center justify-between gap-3 px-6 py-3">
                <button type="button" className="flex min-w-0 items-center gap-3 text-left" onClick={() => setProfileJid(contact.remoteJid)}>
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={picture} alt={name} />
                    <AvatarFallback>
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{name}</p>
                    <p className="truncate text-sm text-muted-foreground">{formatWhatsAppNumber(contact.remoteJid)}</p>
                  </div>
                </button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate(`/manager/instance/${instanceId}/chat/${encodeURIComponent(contact.remoteJid)}`)}
                >
                  <MessageCircle className="mr-1.5 h-4 w-4" />
                  {t("contacts.openChat", { defaultValue: "Conversar" })}
                </Button>
              </li>
            );
            })}
          </ul>
        )}
      </div>
      <ContactProfileDialog
        open={!!profileJid}
        onOpenChange={(open) => !open && setProfileJid(null)}
        instanceId={instanceId}
        instanceName={instance?.name}
        remoteJid={profileJid || undefined}
        fallbackName={
          profileJid
            ? liveProfiles.get(profileJid)?.name || contacts.find((item) => item.remoteJid === profileJid)?.pushName || formatJid(profileJid)
            : undefined
        }
        fallbackPicture={
          profileJid ? liveProfiles.get(profileJid)?.picture || contacts.find((item) => item.remoteJid === profileJid)?.profilePicUrl : undefined
        }
        connected={instance?.connectionStatus === "open"}
      />
    </div>
  );
}

export { Contacts };
