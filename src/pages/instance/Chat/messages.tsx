import { CheckCheck, ChevronDown, Mic, Search, Send, Smile, Timer, User, Users, X } from "lucide-react";
import { ChangeEvent, RefObject, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";

import { cn } from "@/lib/utils";

import { Avatar, AvatarFallback, AvatarImage } from "@evoapi/design-system/avatar";
import { Button } from "@evoapi/design-system/button";
import { Textarea } from "@/components/ui/textarea";

import { ContactProfileDialog } from "@/components/contact-profile-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useInstance } from "@/contexts/InstanceContext";

import { useFetchWhatsAppProfile } from "@/lib/queries/chat/fetchProfile";
import { useFindChat } from "@/lib/queries/chat/findChat";
import { useFindMessages } from "@/lib/queries/chat/findMessages";
import { sendPresence, setDisappearingMessages, updateMessageText, useArchiveChat, useDeleteMessage, useMarkChatRead, useSendReaction } from "@/lib/queries/chat/manageChat";
import { useSendMessage, useSendMedia, useSendAudio } from "@/lib/queries/chat/sendMessage";
import { getToken, TOKEN_ID } from "@/lib/queries/token";

import { Message } from "@/types/evolution.types";

import { connectSocket, disconnectSocket } from "@/services/websocket/socket";

import { MediaOptions } from "../EmbedChatMessage/InputMessage/media-options";
import { SelectedMedia } from "../EmbedChatMessage/InputMessage/selected-media";

import { chatLabels, displayName, displayNumber, formatWhatsAppNumber, isGroupJid } from "./chat-utils";
import { MessageContent } from "./message-content";
import { MessageMenu } from "./inbox-menu";
import { EphemeralDialog } from "./ephemeral-dialog";
import { MessageTicks, resolveMessageStatus } from "./message-ticks";
import { presenceLabel, useChatPresence } from "./use-chat-presence";

const QUICK_EMOJIS = ["😀", "😂", "😍", "🥰", "😎", "😊", "😉", "😭", "😅", "🤔", "👍", "👎", "🙏", "👏", "🔥", "❤️", "💯", "🎉", "😮", "😢", "😡", "🤝", "✅", "❌"];
const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

type MessagesProps = {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  handleTextareaChange: () => void;
  textareaHeight: string;
  lastMessageRef: RefObject<HTMLDivElement | null>;
  scrollToBottom: () => void;
};

// Utility function to format dates like WhatsApp
type TFn = (key: string, opts?: Record<string, unknown>) => string;

const formatDateSeparator = (date: Date, t: TFn, locale: string): string => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const messageDate = new Date(date);

  if (messageDate.toDateString() === today.toDateString()) {
    return t("chat.date.today", { defaultValue: "Hoje" });
  }

  if (messageDate.toDateString() === yesterday.toDateString()) {
    return t("chat.date.yesterday", { defaultValue: "Ontem" });
  }

  const daysDiff = Math.floor((today.getTime() - messageDate.getTime()) / (1000 * 60 * 60 * 24));
  if (daysDiff < 7) {
    return messageDate.toLocaleDateString(locale, { weekday: "long" });
  }

  return messageDate.toLocaleDateString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

// Utility function to get timestamp from message
const getMessageTimestamp = (message: Message): Date => {
  try {
    if (!message.messageTimestamp) {
      return new Date();
    }

    // Handle case where timestamp is an object
    if (typeof message.messageTimestamp === "object") {
      const possibleTimestamps = [
        (message.messageTimestamp as any).low,
        (message.messageTimestamp as any).seconds,
        (message.messageTimestamp as any).timestamp,
        (message.messageTimestamp as any).time,
        (message.messageTimestamp as any).value,
      ];

      const timestamp = possibleTimestamps.find((val) => typeof val === "number" && !isNaN(val)) || Date.now() / 1000;

      return new Date(timestamp * 1000);
    }
    // Handle number or numeric string
    else if (!isNaN(Number(message.messageTimestamp))) {
      const timestamp = Number(message.messageTimestamp);

      // Check if it's milliseconds format (13 digits) or seconds format (10 digits)
      if (timestamp > 1000000000000) {
        return new Date(timestamp);
      } else {
        return new Date(timestamp * 1000);
      }
    }
    // If it's an ISO date string format
    else if (typeof message.messageTimestamp === "string" && message.messageTimestamp.includes("T")) {
      return new Date(message.messageTimestamp);
    }

    return new Date();
  } catch (error) {
    return new Date();
  }
};

// Component for date separator
const DateSeparator = ({ date }: { date: string }) => (
  <div className="flex items-center justify-center py-3">
    <div className="rounded-full bg-muted/50 px-3 py-1">
      <span className="text-xs font-medium text-muted-foreground">{date}</span>
    </div>
  </div>
);

const formatMessageTime = (date: Date, locale: string): string =>
  date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

const extractExpiration = (message?: Message): number => {
  const payload = message?.message as Record<string, any> | undefined;
  if (!payload) return 0;
  const inner = payload.ephemeralMessage?.message || payload;
  const expiration = Number(
    inner?.contextInfo?.expiration ||
      inner?.extendedTextMessage?.contextInfo?.expiration ||
      inner?.imageMessage?.contextInfo?.expiration ||
      inner?.videoMessage?.contextInfo?.expiration ||
      payload.contextInfo?.expiration ||
      0,
  );
  return Number.isFinite(expiration) ? expiration : 0;
};

// WhatsApp-like deterministic color palette per sender
const SENDER_COLORS = [
  "#e91e63", "#9c27b0", "#3f51b5", "#2196f3", "#00bcd4",
  "#009688", "#4caf50", "#ff9800", "#f44336", "#795548",
];

const getSenderColor = (key: string): string => {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return SENDER_COLORS[Math.abs(hash) % SENDER_COLORS.length];
};

function Messages({ textareaRef, handleTextareaChange, textareaHeight, lastMessageRef, scrollToBottom }: MessagesProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const { instance } = useInstance();
  const [messageText, setMessageText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<File | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [realtimeMessages, setRealtimeMessages] = useState<Message[]>([]);
  const [quoted, setQuoted] = useState<Message | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [messageSearch, setMessageSearch] = useState("");
  const [starred, setStarred] = useState<string[]>([]);
  const [statusById, setStatusById] = useState<Record<string, string>>({});
  const [ephemeralOverride, setEphemeralOverride] = useState<number | null>(null);
  const [presenceJid, setPresenceJid] = useState<string | undefined>(undefined);
  const [timerOpen, setTimerOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [reactingTo, setReactingTo] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<Message | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [unreadFrom, setUnreadFrom] = useState<string | null>(null);
  const [showJump, setShowJump] = useState(false);
  const { sendText: sendTextMutation } = useSendMessage();
  const { sendMedia: sendMediaMutation } = useSendMedia();
  const { sendAudio: sendAudioMutation } = useSendAudio();
  const archiveChat = useArchiveChat();
  const markChatRead = useMarkChatRead();
  const deleteMessage = useDeleteMessage();
  const sendReaction = useSendReaction();
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();
  const { instanceId, remoteJid } = useParams<{ instanceId: string; remoteJid: string }>();

  // Handle sending text messages
  const sendTextMessage = async () => {
    if (!messageText.trim() || !remoteJid || !instance?.name || !instance?.token || isSending) return;

    try {
      setIsSending(true);
      if (editingId) {
        await updateMessageText({
          instanceName: instance.name,
          token: instance.token,
          number: remoteJid,
          key: { id: editingId, fromMe: true, remoteJid },
          text: messageText.trim(),
        });
        setEditingId(null);
      } else {
        await sendTextMutation({
          instanceName: instance.name,
          token: instance.token,
          data: {
            number: remoteJid,
            text: messageText.trim(),
            quoted: quoted
              ? {
                  key: quoted.key,
                  message: quoted.message,
                }
              : undefined,
          },
        });
      }

      setQuoted(null);
      setMessageText("");
      if (textareaRef.current) {
        textareaRef.current.value = "";
        handleTextareaChange(); // Reset height
      }
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setIsSending(false);
    }
  };

  // Handle sending media messages
  const sendMediaMessage = async () => {
    if (!selectedMedia || !remoteJid || !instance?.name || !instance?.token || isSending) return;

    try {
      setIsSending(true);

      // Convert media to base64
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(selectedMedia);
        reader.onload = () => {
          const base64 = reader.result as string;
          // Strip the data URI prefix (data:image/xyz;base64,)
          const base64Data = base64.split(",")[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
      });

      await sendMediaMutation({
        instanceName: instance.name,
        token: instance.token,
        data: {
          number: remoteJid,
          mediaMessage: {
            mediatype: selectedMedia.type.split("/")[0] === "application" ? "document" : (selectedMedia.type.split("/")[0] as "audio" | "video" | "image" | "document"),
            mimetype: selectedMedia.type,
            caption: messageText.trim(),
            media: base64Data,
            fileName: selectedMedia.name,
          },
        },
      });

      // Clear the input and media after sending
      setSelectedMedia(null);
      setMessageText("");
      if (textareaRef.current) {
        textareaRef.current.value = "";
        handleTextareaChange(); // Reset height
      }
    } catch (error) {
      console.error("Error sending media:", error);
    } finally {
      setIsSending(false);
    }
  };

  // Handle message sending (decides between text or media)
  const sendMessage = async () => {
    if (selectedMedia) {
      await sendMediaMessage();
    } else {
      await sendTextMessage();
    }
  };

  // Handle Enter key press
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessageText(e.target.value);
    handleTextareaChange();
  };
  const { data: chat } = useFindChat({
    remoteJid,
    instanceName: instance?.name,
  });

  const {
    data: messagePages,
    isSuccess,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useFindMessages({
    remoteJid,
    instanceName: instance?.name,
  });
  const messages = useMemo(() => messagePages?.pages.flatMap((page) => page.records) ?? [], [messagePages]);
  const scrollBoxRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Combine React Query messages with real-time updates
  const allMessages = useMemo(() => {
    if (!messages.length) return realtimeMessages;

    // Merge messages from React Query with real-time updates
    const messageMap = new Map();

    // First add all messages from React Query
    messages.forEach((message) => messageMap.set(message.key?.id || message.id, message));

    // Then add/update with real-time messages
    realtimeMessages.forEach((message) => {
      messageMap.set(message.key?.id || message.id, message);
    });

    return Array.from(messageMap.values());
  }, [messages, realtimeMessages]);

  // Add websocket functionality for real-time message updates
  useEffect(() => {
    if (!instance?.name || !remoteJid) return;

    const serverUrl = getToken(TOKEN_ID.API_URL);
    if (!serverUrl) {
      console.error("API URL not found in localStorage");
      return;
    }

    const socket = connectSocket(serverUrl);

    // Function to update messages from websocket events
    const updateMessagesFromWebsocket = (_eventType: string, data: any) => {
      if (!instance) return;

      if (data.instance !== instance.name) {
        return;
      }

      if (data?.data?.key?.remoteJid !== remoteJid) {
        return;
      }

      const message = data.data;

      setRealtimeMessages((prevMessages) => {
        // Check if message already exists
        const existingIndex = prevMessages.findIndex((msg) => msg.key.id === message.key.id);

        if (existingIndex !== -1) {
          // Update existing message
          const updatedMessages = [...prevMessages];
          updatedMessages[existingIndex] = message;
          return updatedMessages;
        } else {
          // Add new message
          return [...prevMessages, message];
        }
      });
    };

    const applyStatus = (payload: { keyId?: string; key?: { id?: string }; status?: string | number }) => {
      const keyId = payload?.keyId || payload?.key?.id;
      const status = payload?.status;
      if (!keyId || status == null || status === "") return;
      setStatusById((prev) => ({ ...prev, [keyId]: String(status) }));
      setRealtimeMessages((prev) => {
        const index = prev.findIndex((item) => item.key.id === keyId);
        if (index === -1) return prev;
        const next = [...prev];
        next[index] = { ...next[index], status: String(status) };
        return next;
      });
    };

    const updateMessageStatus = (data: any) => {
      if (!instance) return;
      if (data.instance && data.instance !== instance.name) return;
      const payload = data.data ?? data;
      if (Array.isArray(payload)) {
        payload.forEach((item) => applyStatus(item?.update ? { keyId: item.key?.id, status: item.update?.status } : item));
        return;
      }
      applyStatus(payload);
    };

    // Set up event listeners
    socket.on("messages.upsert", (data: any) => {
      updateMessagesFromWebsocket("messages.upsert", data);
    });

    socket.on("send.message", (data: any) => {
      updateMessagesFromWebsocket("send.message", data);
    });

    socket.on("messages.update", (data: any) => {
      updateMessageStatus(data);
    });

    socket.connect();

    // Cleanup function
    return () => {
      socket.off("messages.upsert");
      socket.off("send.message");
      socket.off("messages.update");
      disconnectSocket(socket);
    };
  }, [instance?.name, remoteJid]);

  // Group messages by date
  const groupedMessages = useMemo(() => {
    if (!allMessages) return [];

    // Sort messages by timestamp first
    const query = messageSearch.trim().toLowerCase();
    const sortedMessages = [...allMessages].filter((message) => {
      if (!query) return true;
      const text = JSON.stringify(message.message || {}).toLowerCase();
      return text.includes(query);
    }).sort((a, b) => {
      const aTime = getMessageTimestamp(a).getTime();
      const bTime = getMessageTimestamp(b).getTime();
      return aTime - bTime;
    });

    const grouped: { date: string; messages: Message[] }[] = [];
    let currentDate = "";
    let currentGroup: Message[] = [];

    sortedMessages.forEach((message) => {
      const messageDate = getMessageTimestamp(message);
      const dateString = messageDate.toDateString();

      if (dateString !== currentDate) {
        if (currentGroup.length > 0) {
          grouped.push({
            date: formatDateSeparator(new Date(currentDate), t, locale),
            messages: currentGroup,
          });
        }
        currentDate = dateString;
        currentGroup = [message];
      } else {
        currentGroup.push(message);
      }
    });

    if (currentGroup.length > 0) {
      grouped.push({
        date: formatDateSeparator(new Date(currentDate), t, locale),
        messages: currentGroup,
      });
    }

    return grouped;
  }, [allMessages, t, locale, messageSearch]);

  useEffect(() => {
    const root = scrollBoxRef.current;
    const target = loadMoreRef.current;
    if (!root || !target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || !hasNextPage || isFetchingNextPage) return;
        const previousHeight = root.scrollHeight;
        void fetchNextPage().then(() => {
          requestAnimationFrame(() => {
            root.scrollTop = root.scrollHeight - previousHeight;
          });
        });
      },
      { root, threshold: 0.15 },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, remoteJid]);

  useEffect(() => {
    if (isSuccess && allMessages) {
      scrollToBottom();
    }
  }, [isSuccess, allMessages, scrollToBottom]);

  useEffect(() => {
    if (!isSuccess || !chat?.unreadCount || unreadFrom) return;
    const incoming = [...(allMessages || [])].filter((message) => !message.key.fromMe);
    const start = incoming[Math.max(0, incoming.length - chat.unreadCount)];
    if (start?.key.id) setUnreadFrom(start.key.id);
  }, [isSuccess, allMessages, chat?.unreadCount, unreadFrom]);

  useEffect(() => {
    const root = scrollBoxRef.current;
    if (!root) return;
    const onScroll = () => {
      const distance = root.scrollHeight - root.scrollTop - root.clientHeight;
      setShowJump(distance > 140);
    };
    root.addEventListener("scroll", onScroll);
    return () => root.removeEventListener("scroll", onScroll);
  }, [remoteJid]);

  // Clear selected media and real-time messages when switching chats
  useEffect(() => {
    setSelectedMedia(null);
    setMessageText("");
    setQuoted(null);
    setRealtimeMessages([]);
    setStatusById({});
    setEphemeralOverride(null);
    setPresenceJid(undefined);
    setEmojiOpen(false);
    setReactingTo(null);
    setTimerOpen(false);
    setUnreadFrom(null);
    setEditingId(null);
    if (textareaRef.current) {
      textareaRef.current.value = "";
      handleTextareaChange();
    }
  }, [remoteJid]);

  const messageActions = (message: Message) => ({
    fromMe: message.key.fromMe,
    onReply: () => setQuoted(message),
    onCopy: async () => {
      const text = typeof message.message?.conversation === "string" ? message.message.conversation : message.message?.extendedTextMessage?.text || "";
      if (text) await navigator.clipboard.writeText(text);
    },
    onReact: () => setReactingTo((current) => (current === message.key.id ? null : message.key.id)),
    onInfo: () => setInfoMessage(message),
    onEdit: () => {
      const text = typeof message.message?.conversation === "string" ? message.message.conversation : message.message?.extendedTextMessage?.text || "";
      if (!text) return;
      setEditingId(message.key.id);
      setMessageText(String(text));
    },
    onForward: async () => {
      if (!instance?.name || !instance?.token) return;
      const target = window.prompt(t("chat.messageMenu.forwardTo", { defaultValue: "Número para encaminhar (DDI + número)" }));
      if (!target) return;
      const text = message.message?.conversation || message.message?.extendedTextMessage?.text || t("chat.messageMenu.forwarded", { defaultValue: "Mensagem encaminhada" });
      await sendTextMutation({
        instanceName: instance.name,
        token: instance.token,
        data: { number: target.replace(/\D/g, ""), text: String(text) },
      });
    },
    onStar: () => {
      setStarred((current) =>
        current.includes(message.key.id) ? current.filter((id) => id !== message.key.id) : [...current, message.key.id],
      );
    },
    starred: starred.includes(message.key.id),
    onDelete: async () => {
      if (!instance?.name || !instance?.token) return;
      await deleteMessage({
        instanceName: instance.name,
        token: instance.token,
        id: message.key.id,
        fromMe: message.key.fromMe,
        remoteJid: message.key.remoteJid,
      });
    },
  });

  const renderBubbleRight = (message: Message) => (
    <div className="inbox-bubble-wrap mb-3 flex items-start justify-end gap-1">
      <MessageMenu {...messageActions(message)} />
      <div className="inbox-bubble inbox-bubble-out">
        <div className="inbox-bubble-inner">
          <MessageContent message={message} instanceName={instance?.name} token={instance?.token} />
          <span className="inbox-bubble-meta">
            {extractExpiration(message) || ephemeral ? <Timer className="h-3 w-3 opacity-70" /> : null}
            <span>{formatMessageTime(getMessageTimestamp(message), locale)}</span>
            <MessageTicks status={resolveMessageStatus(message, statusById[message.key.id])} />
          </span>
        </div>
      </div>
    </div>
  );

  const renderBubbleLeft = (message: Message) => {
    const isGroup = !!remoteJid?.endsWith("@g.us");
    const participant = message.key.participant;
    const senderKey = participant || message.pushName || "";
    const senderName = message.pushName || (participant ? participant.split("@")[0] : "");

    return (
      <div className="mb-3 flex items-start justify-start gap-1">
        <div className="inbox-bubble inbox-bubble-in">
          {isGroup && senderName && (
            <div className="mb-1 text-xs font-semibold" style={{ color: getSenderColor(senderKey) }}>
              {senderName}
            </div>
          )}
          <div className="inbox-bubble-inner">
            <MessageContent message={message} instanceName={instance?.name} token={instance?.token} />
            <span className="inbox-bubble-meta">
              {extractExpiration(message) ? <Timer className="h-3 w-3 opacity-70" /> : null}
              <span>{formatMessageTime(getMessageTimestamp(message), locale)}</span>
            </span>
          </div>
        </div>
        <MessageMenu {...messageActions(message)} />
      </div>
    );
  };

  const liveProfile = useFetchWhatsAppProfile({
    instanceName: instance?.name,
    number: remoteJid,
    enabled: instance?.connectionStatus === "open" && !!remoteJid && !isGroupJid(remoteJid || ""),
  });
  const headerName = liveProfile.data?.name?.trim() || liveProfile.data?.verifiedName || (chat ? displayName(chat) : formatWhatsAppNumber(remoteJid));
  const headerPicture = liveProfile.data?.picture || chat?.profilePicUrl;
  const headerSub = displayNumber(chat, liveProfile.data?.number || liveProfile.data?.wuid || remoteJid);
  const headerVerified = Boolean(liveProfile.data?.verified);
  const presence = useChatPresence(instance?.name, [remoteJid, presenceJid].filter(Boolean) as string[]);
  const ephemeralFromMessages = allMessages.reduce((current, message) => extractExpiration(message) || current, 0);
  const ephemeral = ephemeralOverride ?? ephemeralFromMessages;
  const presenceText = presenceLabel(presence.presence, presence.lastSeen, locale);
  const labels = chatLabels(chat?.labels);
  const isOpenWindow = chat?.windowActive !== false;

  useEffect(() => {
    if (!instance?.name || !instance?.token || !remoteJid) return;
    const subscribe = async () => {
      try {
        const result = await sendPresence({ instanceName: instance.name, token: instance.token, number: remoteJid, presence: "available" });
        const resolved = (result as { jid?: string } | undefined)?.jid;
        if (resolved) setPresenceJid(resolved);
      } catch {
        return undefined;
      }
    };
    void subscribe();
    const timer = window.setInterval(() => void subscribe(), 25000);
    return () => window.clearInterval(timer);
  }, [instance?.name, instance?.token, remoteJid]);

  useEffect(() => {
    if (!instance?.name || !instance?.token || !remoteJid || !isSuccess) return;
    const lastIncoming = [...(allMessages || [])].reverse().find((message) => !message.key.fromMe);
    if (!lastIncoming?.key.id) return;
    markChatRead({
      instanceName: instance.name,
      token: instance.token,
      remoteJid,
      messageId: lastIncoming.key.id,
    }).catch(() => undefined);
    // Mark once after the conversation history is available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance?.name, instance?.token, remoteJid, isSuccess]);

  const concludeChat = async () => {
    if (!instance?.name || !instance?.token || !remoteJid) return;
    try {
      const last = [...(allMessages || [])].reverse()[0];
      await archiveChat({
        instanceName: instance.name,
        token: instance.token,
        chat: remoteJid,
        archive: true,
        lastMessage: last
          ? { key: last.key, messageTimestamp: last.messageTimestamp }
          : undefined,
      });
      toast.success(t("chat.conclude.success", { defaultValue: "Atendimento concluído" }));
      navigate(`/manager/instance/${instanceId}/chat`);
    } catch (error) {
      console.error(error);
      toast.error(t("chat.conclude.error", { defaultValue: "Não foi possível concluir o atendimento" }));
    }
  };

  const handleAudioPick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !remoteJid || !instance?.name || !instance?.token) return;
    try {
      setIsSending(true);
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
      });
      await sendAudioMutation({
        instanceName: instance.name,
        token: instance.token,
        data: { number: remoteJid, audioMessage: { audio: base64Data } },
      });
    } catch (error) {
      console.error(error);
      toast.error(t("chat.media.errors.audioSize", { defaultValue: "Não foi possível enviar o áudio" }));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="relative flex h-full flex-col bg-[var(--inbox-canvas)]">
      <div className="inbox-thread-header">
        <button type="button" className="flex min-w-0 items-center gap-3 text-left" onClick={() => setProfileOpen(true)}>
          <Avatar className="h-10 w-10">
            <AvatarImage src={headerPicture} alt={headerName} />
            <AvatarFallback className="bg-muted text-muted-foreground">
              {isGroupJid(remoteJid) ? <Users className="h-5 w-5" /> : <User className="h-5 w-5" />}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate font-semibold">{headerName}</h3>
              {headerVerified && (
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-sky-500 text-[10px] font-bold text-white" title={t("contacts.profile.verified", { defaultValue: "Conta verificada" })}>
                  ✓
                </span>
              )}
              {labels.map((label) => (
                <span key={label} className="inbox-chip">
                  {label}
                </span>
              ))}
              <span className={cn("inbox-status", isOpenWindow ? "inbox-status-open" : "inbox-status-closed")}>
                {isOpenWindow
                  ? t("chat.status.open", { defaultValue: "Atendimento em Aberto" })
                  : t("chat.status.closed", { defaultValue: "Janela encerrada" })}
              </span>
            </div>
            <p className="truncate text-xs text-muted-foreground">{presenceText || headerSub}</p>
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {searchOpen ? (
            <div className="flex items-center gap-1">
              <input
                value={messageSearch}
                onChange={(event) => setMessageSearch(event.target.value)}
                placeholder={t("chat.search.messages", { defaultValue: "Buscar na conversa" })}
                className="h-8 w-40 rounded-full border border-border bg-background px-3 text-xs"
              />
              <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setSearchOpen(false); setMessageSearch(""); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className={cn("h-8 w-8", ephemeral ? "text-primary" : "")}
                title={ephemeral ? t("chat.ephemeral.on", { defaultValue: "Mensagens temporárias ativas" }) : t("chat.ephemeral.off", { defaultValue: "Mensagens temporárias desativadas" })}
                onClick={() => setTimerOpen(true)}
              >
                <Timer className="h-4 w-4" />
              </Button>
              <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => setSearchOpen(true)}>
                <Search className="h-4 w-4" />
              </Button>
            </>
          )}
          <Button type="button" variant="outline" className="rounded-full" onClick={concludeChat}>
            <CheckCheck className="mr-1.5 h-4 w-4" />
            {t("chat.conclude.action", { defaultValue: "Concluir" })}
          </Button>
        </div>
      </div>
      <div ref={scrollBoxRef} className="flex w-full flex-1 flex-col overflow-y-auto px-4 py-4">
        <div ref={loadMoreRef} className="flex justify-center py-2 text-xs text-muted-foreground">
          {isFetchingNextPage
            ? t("chat.loadingOlder", { defaultValue: "Carregando mensagens antigas..." })
            : hasNextPage
              ? t("chat.loadOlder", { defaultValue: "Role para carregar mensagens antigas" })
              : null}
        </div>
        {groupedMessages.map((group, groupIndex) => (
          <div key={groupIndex}>
            <DateSeparator date={group.date} />
            {group.messages.map((message) => (
              <div key={message.id} className="relative">
                {unreadFrom && message.key.id === unreadFrom ? (
                  <div className="inbox-unread-sep">
                    <span>{t("chat.unread.separator", { defaultValue: "Mensagens não lidas" })}</span>
                  </div>
                ) : null}
                {message.key.fromMe ? renderBubbleRight(message) : renderBubbleLeft(message)}
                {reactingTo === message.key.id ? (
                  <div className={cn("mb-2 flex gap-1", message.key.fromMe ? "justify-end" : "justify-start")}>
                    {REACTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className="rounded-full bg-card px-2 py-1 text-lg shadow"
                        onClick={async () => {
                          if (!instance?.name || !instance?.token) return;
                          await sendReaction({
                            instanceName: instance.name,
                            token: instance.token,
                            key: { id: message.key.id, fromMe: message.key.fromMe, remoteJid: message.key.remoteJid },
                            reaction: emoji,
                          });
                          setReactingTo(null);
                        }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ))}
        <div ref={lastMessageRef as never} />
      </div>
      {showJump ? (
        <Button type="button" size="icon" className="inbox-scroll-bottom h-9 w-9 rounded-full shadow" onClick={scrollToBottom}>
          <ChevronDown className="h-4 w-4" />
        </Button>
      ) : null}
      <div
        className="inbox-composer"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files?.[0];
          if (file) setSelectedMedia(file);
        }}
      >
        <div className="inbox-composer-box">
          {quoted && (
            <div className="flex items-center justify-between px-4 pt-3 text-xs">
              <span className="truncate">{t("chat.replying", { defaultValue: "Respondendo mensagem" })}</span>
              <button type="button" className="text-muted-foreground" onClick={() => setQuoted(null)}>
                ×
              </button>
            </div>
          )}
          {editingId && (
            <div className="flex items-center justify-between px-4 pt-3 text-xs text-primary">
              <span>{t("chat.editing", { defaultValue: "Editando mensagem" })}</span>
              <button type="button" onClick={() => { setEditingId(null); setMessageText(""); }}>×</button>
            </div>
          )}
          {selectedMedia && (
            <div className="px-3 pt-3">
              <SelectedMedia selectedMedia={selectedMedia} setSelectedMedia={setSelectedMedia} />
            </div>
          )}
          {emojiOpen && (
            <div className="inbox-emoji-grid px-3 pt-2">
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="rounded-md p-1 text-lg hover:bg-muted"
                  onClick={() => {
                    setMessageText((current) => current + emoji);
                    setEmojiOpen(false);
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-1 px-1.5 py-1">
            <div className="flex flex-shrink-0 items-center">
              {instance && <MediaOptions instance={instance} setSelectedMedia={setSelectedMedia} />}
            </div>
            <Button type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={() => setEmojiOpen((value) => !value)}>
              <Smile className="h-4 w-4" />
            </Button>
            <Textarea
              placeholder={t("chat.input.placeholder", { defaultValue: "Digite uma mensagem" })}
              name="message"
              id="message"
              rows={1}
              ref={textareaRef}
              value={messageText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onPaste={(event) => {
                const file = event.clipboardData.files?.[0];
                if (file) {
                  event.preventDefault();
                  setSelectedMedia(file);
                }
              }}
              disabled={isSending}
              style={{ height: textareaHeight }}
              className="min-h-10 flex-1 resize-none border-none bg-transparent px-2 py-2 text-sm shadow-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            <input
              ref={audioInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={handleAudioPick}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-9 w-9 shrink-0"
              onClick={() => audioInputRef.current?.click()}
              disabled={isSending}
            >
              <Mic className="h-4 w-4" />
              <span className="sr-only">{t("chat.input.audio", { defaultValue: "Enviar áudio" })}</span>
            </Button>
            <Button
              type="button"
              size="icon"
              onClick={sendMessage}
              disabled={(!messageText.trim() && !selectedMedia) || isSending}
              className="h-9 w-9 flex-shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/85 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              <span className="sr-only">{t("chat.input.send")}</span>
            </Button>
          </div>
        </div>
      </div>
      <ContactProfileDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        instanceId={instanceId}
        instanceName={instance?.name}
        remoteJid={remoteJid}
        fallbackName={headerName}
        fallbackPicture={headerPicture || undefined}
        connected={instance?.connectionStatus === "open"}
        showChatButton={false}
        ephemeral={ephemeral}
      />
      <EphemeralDialog
        open={timerOpen}
        current={ephemeral}
        onOpenChange={setTimerOpen}
        onSelect={async (expiration) => {
          if (!instance?.name || !instance.token || !remoteJid) return;
          try {
            await setDisappearingMessages({ instanceName: instance.name, token: instance.token, number: remoteJid, expiration });
            setEphemeralOverride(expiration);
            toast.success(expiration ? t("chat.ephemeral.enabled", { defaultValue: "Temporizador ativado" }) : t("chat.ephemeral.disabled", { defaultValue: "Temporizador desativado" }));
          } catch {
            toast.error(t("chat.ephemeral.error", { defaultValue: "Não foi possível alterar o temporizador" }));
          }
        }}
      />
      <Dialog open={!!infoMessage} onOpenChange={(open) => !open && setInfoMessage(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("chat.messageMenu.info", { defaultValue: "Dados da mensagem" })}</DialogTitle>
          </DialogHeader>
          {infoMessage ? (
            <div className="space-y-2 text-sm">
              <p>{t("chat.info.status", { defaultValue: "Status" })}: {resolveMessageStatus(infoMessage, statusById[infoMessage.key.id]) || "—"}</p>
              <p>{t("chat.info.time", { defaultValue: "Horário" })}: {formatMessageTime(getMessageTimestamp(infoMessage), locale)}</p>
              <p className="break-all text-xs text-muted-foreground">{infoMessage.key.id}</p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { Messages };
