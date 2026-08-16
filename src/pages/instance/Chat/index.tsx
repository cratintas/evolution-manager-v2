import "./style.css";
import { Avatar, AvatarFallback, AvatarImage } from "@evoapi/design-system/avatar";
import { Button } from "@evoapi/design-system/button";
import { Input } from "@/components/ui/input";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  BellOff,
  Filter,
  MessageCircle,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Search,
  Undo2,
  User,
  UserRound,
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
import { useArchiveChat, useBlockUser, useMarkChatUnread } from "@/lib/queries/chat/manageChat";
import { getToken, TOKEN_ID } from "@/lib/queries/token";
import { cn } from "@/lib/utils";

import { connectSocket, disconnectSocket } from "@/services/websocket/socket";

import { Chat as ChatType } from "@/types/evolution.types";

import { useMediaQuery } from "@/utils/useMediaQuery";

import {
  chatLabels,
  displayName,
  displayNumber,
  formatListTime,
  publicPhoneFrom,
  isArchivedChat,
  isGroupJid,
  isPlaceholderName,
  lastMessagePreview,
  toWhatsappJid,
} from "./chat-utils";
import { ContextMenuItem, ContextMenuPanel, ConversationMenu } from "./inbox-menu";
import { MessageTicks, resolveMessageStatus } from "./message-ticks";
import { Messages } from "./messages";

type InboxFilter = "all" | "active" | "groups" | "archived";

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
  const [contextMenu, setContextMenu] = useState<{ chat: ChatType; x: number; y: number } | null>(null);
  const [pins, setPins] = useState<string[]>([]);
  const archiveChat = useArchiveChat();
  const markUnread = useMarkChatUnread();
  const blockUser = useBlockUser();

  const queryClient = useQueryClient();
  const { data: chats, refetch: refetchChats, isFetching: syncing } = useFindChats({ instanceName: instance?.name });
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "inbox-chat-wide",
    storage: typeof window === "undefined" ? undefined : localStorage,
    panelIds: ["list", "thread"],
  });

  const allChats = useMemo(() => {
    if (!chats) return realtimeChats;
    const identity = (chat: ChatType) => publicPhoneFrom(chat.phone, chat.phoneJid, chat.remoteJid) || chat.remoteJid;
    const map = new Map<string, ChatType>();
    const merge = (chat: ChatType) => {
      const key = identity(chat);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, chat);
        return;
      }
      map.set(key, {
        ...existing,
        ...chat,
        remoteJid: chat.remoteJid?.includes("@lid") && !existing.remoteJid?.includes("@lid") ? existing.remoteJid : chat.remoteJid || existing.remoteJid,
        phone: chat.phone || existing.phone,
        phoneJid: chat.phoneJid || existing.phoneJid,
        pushName: chat.pushName || existing.pushName,
        profilePicUrl: chat.profilePicUrl || existing.profilePicUrl,
        unreadCount:
          new Date(chat.updatedAt || 0).getTime() >= new Date(existing.updatedAt || 0).getTime()
            ? chat.unreadCount ?? existing.unreadCount ?? 0
            : existing.unreadCount ?? chat.unreadCount ?? 0,
        lastMessage: chat.lastMessage || existing.lastMessage,
      });
    };
    chats.forEach(merge);
    realtimeChats.forEach(merge);
    return Array.from(map.values()).sort((a, b) => {
      const aPin = pins.includes(a.remoteJid) ? 1 : 0;
      const bPin = pins.includes(b.remoteJid) ? 1 : 0;
      if (aPin !== bPin) return bPin - aPin;
      const aTime = new Date(a.updatedAt || 0).getTime();
      const bTime = new Date(b.updatedAt || 0).getTime();
      return bTime - aTime;
    });
  }, [chats, realtimeChats, pins]);

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
        key?: { remoteJid?: string; remoteJidAlt?: string; fromMe?: boolean; id?: string; profilePictureUrl?: string };
        pushName?: string;
        messageType?: string;
        message?: unknown;
        messageTimestamp?: string | number;
      };
    }) => {
      if (!instance || data.instance !== instance.name) return;
      const incoming = data.data;
      const jid = incoming?.key?.remoteJid;
      if (!jid) return;
      const fromMe = !!incoming?.key?.fromMe;
      const incomingName = incoming?.pushName;

      setRealtimeChats((prev) => {
        const idx = prev.findIndex(
          (c) =>
            c.remoteJid === jid ||
            c.phoneJid === jid ||
            c.remoteJid === incoming?.key?.remoteJidAlt ||
            c.phoneJid === incoming?.key?.remoteJidAlt ||
            publicPhoneFrom(c.phone, c.phoneJid) === publicPhoneFrom(jid, incoming?.key?.remoteJidAlt),
        );
        const current = idx !== -1 ? prev[idx] : undefined;
        const keepName = fromMe || isPlaceholderName(incomingName);
        const obj: ChatType = {
          id: current?.id || jid,
          remoteJid: current?.remoteJid || jid,
          phone: current?.phone,
          phoneJid: current?.phoneJid || incoming?.key?.remoteJidAlt || undefined,
          pushName: keepName ? current?.pushName || "" : incomingName || "",
          profilePicUrl: incoming?.key?.profilePictureUrl || current?.profilePicUrl || "",
          labels: current?.labels ?? ((incoming as Partial<ChatType> | undefined)?.labels) ?? null,
          createdAt: current?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          instanceId: instance.id,
          unreadCount: fromMe || jid === remoteJid || incoming?.key?.remoteJidAlt === remoteJid ? 0 : 1,
          lastMessage: {
            id: incoming?.key?.id,
            key: incoming?.key
              ? {
                  id: incoming.key.id || "",
                  fromMe,
                  remoteJid: jid,
                  remoteJidAlt: incoming.key.remoteJidAlt,
                }
              : undefined,
            pushName: incoming?.pushName,
            messageType: incoming?.messageType,
            message: incoming?.message,
            messageTimestamp: incoming?.messageTimestamp,
            status: fromMe ? "SERVER_ACK" : incoming && "status" in incoming ? String((incoming as { status?: string }).status || "") : undefined,
          },
        };
        if (idx !== -1 && current) {
          const next = [...prev];
          next[idx] = {
            ...current,
            ...obj,
            pushName: keepName ? current.pushName || obj.pushName : obj.pushName || current.pushName,
            profilePicUrl: obj.profilePicUrl || current.profilePicUrl,
            unreadCount: fromMe || jid === remoteJid || incoming?.key?.remoteJidAlt === remoteJid ? 0 : (current.unreadCount || 0) + 1,
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

    const sameChat = (chat: ChatType, jid?: string, alt?: string) =>
      !!jid &&
      (chat.remoteJid === jid ||
        chat.phoneJid === jid ||
        chat.remoteJid === alt ||
        chat.phoneJid === alt ||
        publicPhoneFrom(chat.phone, chat.phoneJid) === publicPhoneFrom(jid, alt));

    const handleChatsUpdate = (data: { instance?: string; data?: Array<{ remoteJid?: string; unreadCount?: number }> | { remoteJid?: string; unreadCount?: number } }) => {
      if (!instance || data.instance !== instance.name) return;
      const items = Array.isArray(data.data) ? data.data : data.data ? [data.data] : [];
      if (!items.length) return;
      setRealtimeChats((prev) => {
        const next = [...prev];
        let changed = false;
        items.forEach((item) => {
          if (!item.remoteJid || typeof item.unreadCount !== "number") return;
          const unread = item.unreadCount < 0 ? 1 : item.unreadCount;
          const idx = next.findIndex((chat) => sameChat(chat, item.remoteJid));
          if (idx === -1) {
            next.push({
              id: item.remoteJid,
              remoteJid: item.remoteJid,
              pushName: "",
              profilePicUrl: "",
              labels: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              instanceId: instance.id,
              unreadCount: unread,
            });
            changed = true;
            return;
          }
          next[idx] = { ...next[idx], unreadCount: unread, updatedAt: new Date().toISOString() };
          changed = true;
        });
        return changed ? next : prev;
      });
    };

    const handleMessageStatus = (data: { instance?: string; data?: { keyId?: string; remoteJid?: string; status?: string } }) => {
      if (!instance || (data.instance && data.instance !== instance.name)) return;
      const payload = data.data;
      const keyId = payload?.keyId;
      const status = payload?.status;
      if (!keyId || !status) return;
      setRealtimeChats((prev) => {
        const idx = prev.findIndex((chat) => chat.lastMessage?.id === keyId || chat.lastMessage?.key?.id === keyId);
        if (idx === -1) return prev;
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          lastMessage: { ...next[idx].lastMessage, status, id: next[idx].lastMessage?.id || keyId },
          updatedAt: new Date().toISOString(),
        };
        return next;
      });
    };

    socket.on("messages.upsert", handle);
    socket.on("send.message", handle);
    socket.on("chats.set", refreshInbox);
    socket.on("chats.update", handleChatsUpdate);
    socket.on("messages.update", handleMessageStatus);
    socket.on("messaging-history.set", refreshInbox);
    socket.connect();

    return () => {
      socket.off("messages.upsert");
      socket.off("send.message");
      socket.off("chats.set");
      socket.off("chats.update");
      socket.off("messages.update");
      socket.off("messaging-history.set");
      disconnectSocket(socket);
    };
  }, [instance, instance?.name, queryClient, remoteJid]);

  useEffect(() => {
    if (!remoteJid) return;
    setRealtimeChats((prev) => {
      const next = prev.map((chat) =>
        chat.remoteJid === remoteJid || chat.phoneJid === remoteJid ? { ...chat, unreadCount: 0, updatedAt: new Date().toISOString() } : chat,
      );
      return next.some((chat, index) => chat !== prev[index]) ? next : prev;
    });
  }, [remoteJid]);

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

  useEffect(() => {
    if (!instance?.name) return;
    try {
      const stored = localStorage.getItem(`inbox-pins:${instance.name}`);
      setPins(stored ? (JSON.parse(stored) as string[]) : []);
    } catch {
      setPins([]);
    }
  }, [instance?.name]);

  const togglePin = (jid: string) => {
    if (!instance?.name) return;
    setPins((current) => {
      const next = current.includes(jid) ? current.filter((item) => item !== jid) : [jid, ...current];
      localStorage.setItem(`inbox-pins:${instance.name}`, JSON.stringify(next));
      return next;
    });
  };

  const applyArchiveLocally = (chat: ChatType, archive: boolean) => {
    const nextLabels = chatLabels(chat.labels).filter((label) => label.toLowerCase() !== "archived");
    if (archive) nextLabels.push("archived");
    const patched: ChatType = {
      ...chat,
      archived: archive,
      labels: nextLabels,
      updatedAt: new Date().toISOString(),
    };
    setRealtimeChats((prev) => {
      const idx = prev.findIndex((item) => item.remoteJid === chat.remoteJid || item.phoneJid === chat.remoteJid);
      if (idx === -1) return [patched, ...prev];
      const next = [...prev];
      next[idx] = { ...next[idx], ...patched };
      return next;
    });
  };

  const runArchive = async (chat: ChatType, archive: boolean) => {
    if (!instance?.name || !instance.token) return;
    try {
      await archiveChat({
        instanceName: instance.name,
        token: instance.token,
        chat: chat.remoteJid,
        archive,
        lastMessage: chat.lastMessage
          ? {
              key: chat.lastMessage.key,
              messageTimestamp: chat.lastMessage.messageTimestamp,
            }
          : undefined,
      });
      applyArchiveLocally(chat, archive);
      toast.success(archive ? t("chat.menu.archived", { defaultValue: "Conversa arquivada" }) : t("chat.menu.unarchived", { defaultValue: "Conversa desarquivada" }));
      await refetchChats();
    } catch {
      toast.error(t("chat.menu.archiveError", { defaultValue: "Não foi possível arquivar a conversa" }));
    }
  };

  const runUnread = async (chat: ChatType) => {
    if (!instance?.name || !instance.token) return;
    try {
      await markUnread({ instanceName: instance.name, token: instance.token, chat: chat.remoteJid });
    } catch {
      toast.error(t("chat.menu.unreadError", { defaultValue: "Não foi possível marcar como não lida" }));
    }
  };

  const visibleChats = useMemo(() => {
    const filtered = allChats.filter((c) => {
      const archived = isArchivedChat(c);
      if (inboxFilter === "archived") return archived;
      if (archived) return false;
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
        (c.phone || "").toLowerCase().includes(q) ||
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
    { id: "archived", label: t("chat.filters.archived", { defaultValue: "Arquivadas" }) },
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
          {inboxFilter !== "archived" && allChats.some((chat) => isArchivedChat(chat)) && (
            <button type="button" className="inbox-item text-sm font-medium text-muted-foreground" onClick={() => setInboxFilter("archived")}>
              <Archive className="h-4 w-4" />
              {t("chat.filters.archived", { defaultValue: "Arquivadas" })} ({allChats.filter((chat) => isArchivedChat(chat)).length})
            </button>
          )}
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
                pushName: !isPlaceholderName(live?.name) ? live!.name! : chat.pushName,
                profilePicUrl: live?.picture || chat.profilePicUrl,
                phone: chat.phone || live?.number,
              };
              const selected = remoteJid === chat.remoteJid;
              const name = displayName(hydrated);
              const preview = lastMessagePreview(chat.lastMessage);
              const verified = Boolean(live?.verified);
              const unread = chat.unreadCount || 0;
              const labels = chatLabels(chat.labels).filter((label) => label.toLowerCase() !== "archived");
              const group = isGroupJid(chat.remoteJid);

              const archived = isArchivedChat(chat);
              const pinned = pins.includes(chat.remoteJid);
              return (
                <button
                  key={chat.remoteJid}
                  type="button"
                  onClick={() => handleChat(chat.remoteJid)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setContextMenu({ chat, x: event.clientX, y: event.clientY });
                  }}
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
                      <span className="shrink-0 text-[11px] text-muted-foreground">{formatListTime(chat, i18n.language)}</span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <p className="flex min-w-0 items-center gap-1 truncate text-sm text-muted-foreground">
                        {chat.lastMessage?.key?.fromMe ? <MessageTicks status={resolveMessageStatus(chat.lastMessage)} /> : null}
                        <span className="truncate">{preview || displayNumber(chat)}</span>
                      </p>
                      <span className="inbox-item-trail">
                        {unread > 0 && <span className="inbox-unread">{unread > 99 ? "99+" : unread}</span>}
                        <ConversationMenu
                          archived={archived}
                          pinned={pinned}
                          onArchive={() => void runArchive(chat, !archived)}
                          onUnread={() => void runUnread(chat)}
                          onPin={() => togglePin(chat.remoteJid)}
                          onProfile={() => setProfileJid(chat.remoteJid)}
                          onMute={() => toast.info(t("chat.menu.muteSoon", { defaultValue: "Silenciar usa as notificações do WhatsApp no celular." }))}
                          onBlock={() => {
                            if (!instance?.name || !instance.token) return;
                            void blockUser({
                              instanceName: instance.name,
                              token: instance.token,
                              number: chat.phone || chat.remoteJid,
                              status: "block",
                            }).then(() => toast.success(t("chat.menu.blocked", { defaultValue: "Contato bloqueado" })));
                          }}
                        />
                      </span>
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

      <ContextMenuPanel open={!!contextMenu} x={contextMenu?.x || 0} y={contextMenu?.y || 0} onClose={() => setContextMenu(null)}>
        {contextMenu ? (
          <>
            <ContextMenuItem
              icon={isArchivedChat(contextMenu.chat) ? ArchiveRestore : Archive}
              label={isArchivedChat(contextMenu.chat) ? t("chat.menu.unarchive", { defaultValue: "Desarquivar conversa" }) : t("chat.menu.archive", { defaultValue: "Arquivar conversa" })}
              onClick={() => {
                void runArchive(contextMenu.chat, !isArchivedChat(contextMenu.chat));
                setContextMenu(null);
              }}
            />
            <ContextMenuItem
              icon={Undo2}
              label={t("chat.menu.unread", { defaultValue: "Marcar como não lida" })}
              onClick={() => {
                void runUnread(contextMenu.chat);
                setContextMenu(null);
              }}
            />
            <ContextMenuItem
              icon={BellOff}
              label={t("chat.menu.mute", { defaultValue: "Silenciar notificações" })}
              onClick={() => {
                toast.info(t("chat.menu.muteSoon", { defaultValue: "Silenciar usa as notificações do WhatsApp no celular." }));
                setContextMenu(null);
              }}
            />
            <ContextMenuItem
              icon={pins.includes(contextMenu.chat.remoteJid) ? PinOff : Pin}
              label={pins.includes(contextMenu.chat.remoteJid) ? t("chat.menu.unpin", { defaultValue: "Desafixar" }) : t("chat.menu.pin", { defaultValue: "Fixar conversa" })}
              onClick={() => {
                togglePin(contextMenu.chat.remoteJid);
                setContextMenu(null);
              }}
            />
            <ContextMenuItem
              icon={UserRound}
              label={t("chat.menu.profile", { defaultValue: "Dados do contato" })}
              onClick={() => {
                setProfileJid(contextMenu.chat.remoteJid);
                setContextMenu(null);
              }}
            />
          </>
        ) : null}
      </ContextMenuPanel>

      <ContactProfileDialog
        open={!!profileJid}
        onOpenChange={(open) => !open && setProfileJid(null)}
        instanceId={instanceId}
        instanceName={instance?.name}
        remoteJid={profileJid || undefined}
        fallbackName={profileJid ? displayName({
          pushName: liveProfiles.get(profileJid)?.name || allChats.find((item) => item.remoteJid === profileJid)?.pushName || "",
          remoteJid: profileJid,
          phone: allChats.find((item) => item.remoteJid === profileJid)?.phone || liveProfiles.get(profileJid)?.number,
          phoneJid: allChats.find((item) => item.remoteJid === profileJid)?.phoneJid,
        }) : undefined}
        fallbackPicture={profileJid ? liveProfiles.get(profileJid)?.picture || allChats.find((item) => item.remoteJid === profileJid)?.profilePicUrl : undefined}
        connected={instance?.connectionStatus === "open"}
        showChatButton={profileJid !== remoteJid}
      />
    </>
  );
}

export { Chat };
