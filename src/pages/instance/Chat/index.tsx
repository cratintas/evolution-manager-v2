import "./style.css";
import { Avatar, AvatarFallback, AvatarImage } from "@evoapi/design-system/avatar";
import { Button } from "@evoapi/design-system/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Filter,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  User,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { useQueryClient } from "@tanstack/react-query";

import { ContactProfileDialog } from "@/components/contact-profile-dialog";
import { LanguageToggle } from "@/components/language-toggle";
import { ModeToggle } from "@/components/mode-toggle";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { useInstance } from "@/contexts/InstanceContext";

import { useFindChats } from "@/lib/queries/chat/findChats";
import { useLiveProfiles } from "@/lib/queries/chat/fetchProfile";
import { getToken, TOKEN_ID } from "@/lib/queries/token";
import { cn } from "@/lib/utils";

import { connectSocket, disconnectSocket } from "@/services/websocket/socket";

import { Chat as ChatType } from "@/types/evolution.types";

import { useMediaQuery } from "@/utils/useMediaQuery";

import {
  chatLabels,
  displayName,
  formatJid,
  formatListTime,
  formatWhatsAppNumber,
  isGroupJid,
  lastMessagePreview,
  toWhatsappJid,
} from "./chat-utils";
import { Messages } from "./messages";

type InboxFilter = "all" | "active" | "groups";

function conversationCountLabel(count: number, t: (key: string, opts?: Record<string, unknown>) => string) {
  if (count === 0) return t("chat.count.zero", { defaultValue: "Nenhuma conversa" });
  if (count === 1) return t("chat.count.one", { defaultValue: "1 conversa" });
  return t("chat.count.other", { count, defaultValue: "{{count}} conversas" });
}

function Chat() {
  const { t, i18n } = useTranslation();
  const isMD = useMediaQuery("(min-width: 768px)");
  const lastMessageRef = useRef<HTMLDivElement | null>(null);
  const [textareaHeight] = useState("auto");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { instance } = useInstance();

  const [realtimeChats, setRealtimeChats] = useState<ChatType[]>([]);
  const [search, setSearch] = useState("");
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [onlyOpenWindow, setOnlyOpenWindow] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatNumber, setNewChatNumber] = useState("");
  const [profileJid, setProfileJid] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { data: chats, refetch: refetchChats, isFetching: syncing } = useFindChats({ instanceName: instance?.name });
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "inbox-chat-wide",
    storage: typeof window === "undefined" ? undefined : localStorage,
    panelIds: ["list", "thread"],
  });

  const allChats = useMemo(() => {
    if (!chats) return realtimeChats;
    const map = new Map<string, ChatType>();
    chats.forEach((c) => map.set(c.remoteJid, c));
    realtimeChats.forEach((c) => {
      const existing = map.get(c.remoteJid);
      map.set(c.remoteJid, existing ? { ...existing, ...c } : c);
    });
    return Array.from(map.values()).sort((a, b) => {
      const aTime = new Date(a.updatedAt || 0).getTime();
      const bTime = new Date(b.updatedAt || 0).getTime();
      return bTime - aTime;
    });
  }, [chats, realtimeChats]);

  const liveProfiles = useLiveProfiles(instance?.name, allChats, instance?.connectionStatus === "open");

  const { instanceId, remoteJid } = useParams<{ instanceId: string; remoteJid: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (!instance?.name) return;
    const serverUrl = getToken(TOKEN_ID.API_URL);
    if (!serverUrl) return;

    const socket = connectSocket(serverUrl);

    const handle = (data: {
      instance?: string;
      data?: {
        key?: { remoteJid?: string; fromMe?: boolean; id?: string; profilePictureUrl?: string };
        pushName?: string;
        messageType?: string;
        message?: unknown;
        messageTimestamp?: string | number;
      };
    }) => {
      if (!instance || data.instance !== instance.name) return;
      const jid = data?.data?.key?.remoteJid;
      if (!jid) return;

      setRealtimeChats((prev) => {
        const idx = prev.findIndex((c) => c.remoteJid === jid);
        const incoming = data.data;
        const obj: ChatType = {
          id: jid,
          remoteJid: jid,
          pushName: incoming?.pushName || formatJid(jid),
          profilePicUrl: incoming?.key?.profilePictureUrl || "",
          labels: ((incoming as Partial<ChatType> | undefined)?.labels) ?? null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          instanceId: instance.id,
          unreadCount: incoming?.key?.fromMe ? 0 : 1,
          lastMessage: {
            id: incoming?.key?.id,
            key: incoming?.key
              ? {
                  id: incoming.key.id || "",
                  fromMe: !!incoming.key.fromMe,
                  remoteJid: jid,
                }
              : undefined,
            pushName: incoming?.pushName,
            messageType: incoming?.messageType,
            message: incoming?.message,
            messageTimestamp: incoming?.messageTimestamp,
          },
        };
        if (idx !== -1) {
          const next = [...prev];
          const current = next[idx];
          next[idx] = {
            ...current,
            ...obj,
            pushName: obj.pushName || current.pushName,
            profilePicUrl: obj.profilePicUrl || current.profilePicUrl,
            unreadCount: incoming?.key?.fromMe ? 0 : (current.unreadCount || 0) + 1,
            windowActive: true,
          };
          return next;
        }
        return [obj, ...prev];
      });
    };

    const refreshInbox = () => {
      queryClient.invalidateQueries({ queryKey: ["chats"] });
    };

    socket.on("messages.upsert", handle);
    socket.on("send.message", handle);
    socket.on("chats.set", refreshInbox);
    socket.on("chats.upsert", refreshInbox);
    socket.on("chats.update", refreshInbox);
    socket.on("messages.set", refreshInbox);
    socket.on("messaging-history.set", refreshInbox);
    socket.on("contacts.upsert", refreshInbox);
    socket.on("connection.update", refreshInbox);
    socket.connect();

    return () => {
      socket.off("messages.upsert");
      socket.off("send.message");
      socket.off("chats.set");
      socket.off("chats.upsert");
      socket.off("chats.update");
      socket.off("messages.set");
      socket.off("messaging-history.set");
      socket.off("contacts.upsert");
      socket.off("connection.update");
      disconnectSocket(socket);
    };
  }, [instance, instance?.name, queryClient]);

  const scrollToBottom = useCallback(() => {
    lastMessageRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const handleTextareaChange = () => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    const scrollHeight = textareaRef.current.scrollHeight;
    const lineHeight = parseInt(getComputedStyle(textareaRef.current).lineHeight) || 20;
    const maxHeight = lineHeight * 10;
    textareaRef.current.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
  };

  const handleChat = (jid: string) => navigate(`/manager/instance/${instanceId}/chat/${encodeURIComponent(jid)}`);

  const handleBack = () => navigate(`/manager/instance/${instanceId}/chat`);

  const visibleChats = useMemo(() => {
    const filtered = allChats.filter((c) => {
      if (inboxFilter === "groups" && !isGroupJid(c.remoteJid)) return false;
      if (inboxFilter === "active" && isGroupJid(c.remoteJid)) return false;
      if (onlyUnread && !(c.unreadCount && c.unreadCount > 0)) return false;
      if (onlyOpenWindow && !c.windowActive) return false;
      return true;
    });
    if (!search.trim()) return filtered;
    const q = search.toLowerCase();
    return filtered.filter(
      (c) =>
        displayName(c).toLowerCase().includes(q) ||
        c.remoteJid.toLowerCase().includes(q) ||
        lastMessagePreview(c.lastMessage).toLowerCase().includes(q),
    );
  }, [allChats, inboxFilter, search, onlyUnread, onlyOpenWindow]);

  const openNewChat = () => {
    const jid = toWhatsappJid(newChatNumber);
    if (!jid.replace("@s.whatsapp.net", "")) {
      toast.error(t("chat.newChat.invalid", { defaultValue: "Informe um número válido com DDI" }));
      return;
    }
    setNewChatOpen(false);
    setNewChatNumber("");
    handleChat(jid);
  };

  const showSidebar = !remoteJid || isMD;
  const showChat = !!remoteJid;

  const filters: { id: InboxFilter; label: string }[] = [
    { id: "all", label: t("chat.filters.all", { defaultValue: "Todas" }) },
    { id: "active", label: t("chat.filters.active", { defaultValue: "Ativas" }) },
    { id: "groups", label: t("chat.filters.groups", { defaultValue: "Grupos" }) },
  ];

  const listPane = (
      <aside className={cn("inbox-list", !isMD && (showSidebar ? "flex" : "hidden"), isMD && "flex")}>
        <div className="inbox-list-toolbar">
          <div className="flex items-center justify-end gap-2">
            <LanguageToggle />
            <ModeToggle />
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder={t("chat.search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 rounded-xl border-border/70 bg-background pl-9"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
              {filters.map((filter) => (
                <Button
                  key={filter.id}
                  type="button"
                  size="sm"
                  variant={inboxFilter === filter.id ? "secondary" : "ghost"}
                  className={cn(
                    "h-8 shrink-0 rounded-full px-3",
                    inboxFilter === filter.id && "bg-primary/10 text-primary hover:bg-primary/15",
                  )}
                  onClick={() => setInboxFilter(filter.id)}
                >
                  {filter.label}
                </Button>
              ))}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className={cn("h-8 gap-1", (showFilters || onlyUnread || onlyOpenWindow) && "text-primary")}
                onClick={() => setShowFilters((value) => !value)}
              >
                <Filter className="h-3.5 w-3.5" />
                {t("chat.filters.toggle", { defaultValue: "Filtros" })}
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 rounded-full"
                disabled={syncing}
                title={t("chat.sync", { defaultValue: "Sincronizar conversas" })}
                onClick={() => void refetchChats()}
              >
                <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
                <span className="sr-only">{t("chat.sync", { defaultValue: "Sincronizar conversas" })}</span>
              </Button>
              <Button type="button" size="icon" className="h-8 w-8 rounded-full" onClick={() => setNewChatOpen(true)}>
                <Plus className="h-4 w-4" />
                <span className="sr-only">{t("chat.newChat.title", { defaultValue: "Nova conversa" })}</span>
              </Button>
            </div>
          </div>

          {showFilters && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={onlyUnread ? "secondary" : "outline"}
                className={cn("h-7 rounded-full px-3 text-xs", onlyUnread && "bg-primary/10 text-primary")}
                onClick={() => setOnlyUnread((value) => !value)}
              >
                {t("chat.filters.unread", { defaultValue: "Não lidas" })}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={onlyOpenWindow ? "secondary" : "outline"}
                className={cn("h-7 rounded-full px-3 text-xs", onlyOpenWindow && "bg-primary/10 text-primary")}
                onClick={() => setOnlyOpenWindow((value) => !value)}
              >
                {t("chat.filters.openWindow", { defaultValue: "Janela 24h" })}
              </Button>
              {(onlyUnread || onlyOpenWindow) && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 rounded-full px-2 text-xs text-muted-foreground"
                  onClick={() => {
                    setOnlyUnread(false);
                    setOnlyOpenWindow(false);
                  }}
                >
                  {t("chat.filters.clear", { defaultValue: "Limpar" })}
                </Button>
              )}
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{conversationCountLabel(visibleChats.length, t)}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {visibleChats.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center p-6 text-center">
              <MessageCircle className="mb-3 h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm font-medium text-muted-foreground">
                {search ? t("chat.empty.search") : t("chat.empty.default")}
              </p>
              {search && <p className="mt-1 text-xs text-muted-foreground">{t("chat.empty.tryAnother")}</p>}
            </div>
          ) : (
            visibleChats.map((chat) => {
              const live = liveProfiles.get(chat.remoteJid);
              const hydrated = {
                ...chat,
                pushName: live?.name || chat.pushName,
                profilePicUrl: live?.picture || chat.profilePicUrl,
              };
              const selected = remoteJid === chat.remoteJid;
              const name = displayName(hydrated);
              const preview = lastMessagePreview(chat.lastMessage);
              const verified = Boolean(live?.verified);
              const unread = chat.unreadCount || 0;
              const labels = chatLabels(chat.labels);
              const group = isGroupJid(chat.remoteJid);

              return (
                <button
                  key={chat.remoteJid}
                  type="button"
                  onClick={() => handleChat(chat.remoteJid)}
                  className={cn("inbox-item", selected && "inbox-item-active")}
                >
                  <span
                    role="button"
                    tabIndex={0}
                    className="flex-shrink-0"
                    onClick={(event) => {
                      event.stopPropagation();
                      setProfileJid(chat.remoteJid);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.stopPropagation();
                        event.preventDefault();
                        setProfileJid(chat.remoteJid);
                      }
                    }}
                  >
                    <Avatar className="h-11 w-11">
                      <AvatarImage src={hydrated.profilePicUrl} alt={name} />
                      <AvatarFallback className="bg-muted text-muted-foreground">
                        {group ? <Users className="h-5 w-5" /> : <User className="h-5 w-5" />}
                      </AvatarFallback>
                    </Avatar>
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="flex min-w-0 items-center gap-1 truncate font-medium text-foreground">
                        <span className="truncate">{name}</span>
                        {verified && (
                          <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-sky-500 text-[9px] font-bold text-white">✓</span>
                        )}
                      </p>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatListTime(chat, i18n.language)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <p className="truncate text-sm text-muted-foreground">{preview || formatWhatsAppNumber(chat.remoteJid)}</p>
                      {unread > 0 && (
                        <span className="inbox-unread">{unread > 99 ? "99+" : unread}</span>
                      )}
                    </div>
                    {labels.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {labels.slice(0, 2).map((label) => (
                          <span key={label} className="inbox-chip">
                            {label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>
  );

  const threadPane = (
      <main className={cn("inbox-thread", !isMD && (showChat ? "flex" : "hidden"), isMD && "flex")}>
        {remoteJid ? (
          <>
            {!isMD && (
              <div className="flex items-center border-b bg-background/95 p-2">
                <Button variant="ghost" size="sm" onClick={handleBack}>
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  {t("chat.back")}
                </Button>
              </div>
            )}
            <Messages
              textareaRef={textareaRef}
              handleTextareaChange={handleTextareaChange}
              textareaHeight={textareaHeight}
              lastMessageRef={lastMessageRef}
              scrollToBottom={scrollToBottom}
            />
          </>
        ) : (
          <div className="flex h-full flex-1 items-center justify-center p-8">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <MessageCircle className="h-8 w-8 text-primary" />
              </div>
              <h3 className="mb-1 text-lg font-semibold">{t("chat.empty.selectTitle")}</h3>
              <p className="text-sm text-muted-foreground">{t("chat.empty.selectDescription")}</p>
            </div>
          </div>
        )}
      </main>
  );

  return (
    <>
      {isMD ? (
        <Group
          id="inbox-chat-wide"
          orientation="horizontal"
          className="inbox-shell"
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
        >
          <Panel id="list" defaultSize="36rem" minSize="18rem" maxSize="60%" className="flex min-h-0 min-w-0">
            {listPane}
          </Panel>
          <Separator className="inbox-resizer" />
          <Panel id="thread" minSize="20rem" className="flex min-h-0 min-w-0">
            {threadPane}
          </Panel>
        </Group>
      ) : (
        <div className="inbox-shell">
          {listPane}
          {threadPane}
        </div>
      )}

      <Dialog open={newChatOpen} onOpenChange={setNewChatOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("chat.newChat.title", { defaultValue: "Nova conversa" })}</DialogTitle>
            <DialogDescription>
              {t("chat.newChat.description", { defaultValue: "Informe o número com DDI para abrir a conversa." })}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={newChatNumber}
            onChange={(e) => setNewChatNumber(e.target.value)}
            placeholder={t("chat.newChat.placeholder", { defaultValue: "5511999999999" })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                openNewChat();
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewChatOpen(false)}>
              {t("button.cancel")}
            </Button>
            <Button onClick={openNewChat}>{t("chat.newChat.submit", { defaultValue: "Abrir conversa" })}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ContactProfileDialog
        open={!!profileJid}
        onOpenChange={(open) => !open && setProfileJid(null)}
        instanceId={instanceId}
        instanceName={instance?.name}
        remoteJid={profileJid || undefined}
        fallbackName={profileJid ? displayName({
          pushName: liveProfiles.get(profileJid)?.name || allChats.find((item) => item.remoteJid === profileJid)?.pushName || "",
          remoteJid: profileJid,
        }) : undefined}
        fallbackPicture={profileJid ? liveProfiles.get(profileJid)?.picture || allChats.find((item) => item.remoteJid === profileJid)?.profilePicUrl : undefined}
        connected={instance?.connectionStatus === "open"}
        showChatButton={profileJid !== remoteJid}
      />
    </>
  );
}

export { Chat };
