import { CheckCheck, Mic, Send, User, Users } from "lucide-react";
import { ChangeEvent, RefObject, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";

import { cn } from "@/lib/utils";

import { Avatar, AvatarFallback, AvatarImage } from "@evoapi/design-system/avatar";
import { Button } from "@evoapi/design-system/button";
import { Textarea } from "@/components/ui/textarea";

import { ContactProfileDialog } from "@/components/contact-profile-dialog";
import { useInstance } from "@/contexts/InstanceContext";

import { useFetchWhatsAppProfile } from "@/lib/queries/chat/fetchProfile";
import { useFindChat } from "@/lib/queries/chat/findChat";
import { useFindMessages } from "@/lib/queries/chat/findMessages";
import { useArchiveChat, useMarkChatRead } from "@/lib/queries/chat/manageChat";
import { useSendMessage, useSendMedia, useSendAudio } from "@/lib/queries/chat/sendMessage";
import { getToken, TOKEN_ID } from "@/lib/queries/token";

import { Message } from "@/types/evolution.types";

import { connectSocket, disconnectSocket } from "@/services/websocket/socket";

import { MediaOptions } from "../EmbedChatMessage/InputMessage/media-options";
import { SelectedMedia } from "../EmbedChatMessage/InputMessage/selected-media";

import { chatLabels, displayName, formatJid, formatWhatsAppNumber, isGroupJid } from "./chat-utils";

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

// Helper function to extract text content from message
const getMessageText = (messageObj: any): string => {
  if (!messageObj) return "";

  // Try to parse if it's a string
  if (typeof messageObj === "string") {
    try {
      const parsed = JSON.parse(messageObj);
      return parsed.conversation || parsed.text || messageObj;
    } catch {
      return messageObj;
    }
  }

  // If it's already an object, extract conversation or text
  if (typeof messageObj === "object") {
    return messageObj.conversation || messageObj.text || "";
  }

  return String(messageObj);
};

// Component to render different message types based on messageType
const MessageContent = ({ message }: { message: Message }) => {
  const messageType = message.messageType as string;

  switch (messageType) {
    case "conversation":
      if (message.message.contactMessage) {
        const contactMsg = message.message.contactMessage;
        return (
          <div className="p-3 bg-muted rounded-lg max-w-xs">
            <div className="flex items-center gap-2 mb-2">
              <div className="text-xl">👤</div>
              <span className="font-medium">Contact</span>
            </div>
            {contactMsg.displayName && <p className="text-sm font-medium">{contactMsg.displayName}</p>}
            {contactMsg.vcard && <p className="text-xs text-muted-foreground">Contact card</p>}
          </div>
        );
      }

      if (message.message.locationMessage) {
        const locationMsg = message.message.locationMessage;
        return (
          <div className="p-3 bg-muted rounded-lg max-w-xs">
            <div className="flex items-center gap-2 mb-2">
              <div className="text-xl">📍</div>
              <span className="font-medium">Location</span>
            </div>
            {locationMsg.name && <p className="text-sm font-medium">{locationMsg.name}</p>}
            {locationMsg.address && <p className="text-xs text-muted-foreground">{locationMsg.address}</p>}
            {locationMsg.degreesLatitude && locationMsg.degreesLongitude && (
              <a
                href={`https://maps.google.com/?q=${locationMsg.degreesLatitude},${locationMsg.degreesLongitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline text-sm mt-1 inline-block">
                View on Maps
              </a>
            )}
          </div>
        );
      }

      return <span>{getMessageText(message.message)}</span>;

    case "extendedTextMessage":
      return <span>{message.message.conversation ?? message.message.extendedTextMessage?.text}</span>;

    case "imageMessage":
      // Use base64 data or mediaUrl for images
      const imageBase64 = message.message.base64 ? (message.message.base64.startsWith("data:") ? message.message.base64 : `data:image/jpeg;base64,${message.message.base64}`) : null;

      const imageSrc = imageBase64 || message.message.mediaUrl;

      return (
        <div className="flex flex-col gap-2">
          {imageSrc ? (
            <img
              src={imageSrc}
              alt="Image"
              className="rounded-lg max-w-full h-auto"
              style={{
                maxWidth: "400px",
                maxHeight: "400px",
                objectFit: "contain",
              }}
              loading="lazy"
            />
          ) : (
            <div className="rounded bg-muted p-4 max-w-xs">
              <p className="text-center text-muted-foreground">Image couldn't be loaded</p>
              <p className="text-center text-xs text-muted-foreground mt-1">Missing base64 data and mediaUrl</p>
            </div>
          )}
          {message.message.imageMessage?.caption && <p className="text-sm">{message.message.imageMessage.caption}</p>}
        </div>
      );

    case "videoMessage":
      // Use base64 data or mediaUrl for videos
      const videoBase64 = message.message.base64 ? (message.message.base64.startsWith("data:") ? message.message.base64 : `data:video/mp4;base64,${message.message.base64}`) : null;

      const videoSrc = videoBase64 || message.message.mediaUrl;

      return (
        <div className="flex flex-col gap-2">
          {videoSrc ? (
            <video
              src={videoSrc}
              controls
              className="rounded-lg max-w-full h-auto"
              style={{
                maxWidth: "400px",
                maxHeight: "400px",
              }}
            />
          ) : (
            <div className="rounded bg-muted p-4 max-w-xs">
              <p className="text-center text-muted-foreground">Video couldn't be loaded</p>
              <p className="text-center text-xs text-muted-foreground mt-1">Missing base64 data and mediaUrl</p>
            </div>
          )}
          {message.message.videoMessage?.caption && <p className="text-sm">{message.message.videoMessage.caption}</p>}
        </div>
      );

    case "audioMessage":
      // Use base64 data or mediaUrl for audio
      const audioBase64 = message.message.base64 ? (message.message.base64.startsWith("data:") ? message.message.base64 : `data:audio/mpeg;base64,${message.message.base64}`) : null;

      const audioSrc = audioBase64 || message.message.mediaUrl;

      return audioSrc ? (
        <audio controls className="w-full max-w-xs">
          <source src={audioSrc} type="audio/mpeg" />
          Your browser does not support the audio element.
        </audio>
      ) : (
        <div className="rounded bg-muted p-4 max-w-xs">
          <p className="text-center text-muted-foreground">Audio couldn't be loaded</p>
          <p className="text-center text-xs text-muted-foreground mt-1">Missing base64 data and mediaUrl</p>
        </div>
      );

    case "documentMessage":
      return (
        <div className="flex items-center gap-2 p-3 bg-muted rounded-lg max-w-xs">
          <div className="text-2xl">📄</div>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{message.message.documentMessage?.fileName || "Document"}</p>
            {message.message.documentMessage?.fileLength && <p className="text-xs text-muted-foreground">{(message.message.documentMessage.fileLength / 1024 / 1024).toFixed(2)} MB</p>}
          </div>
        </div>
      );

    case "stickerMessage":
      return <img src={message.message.mediaUrl} alt="Sticker" className="max-w-32 max-h-32 object-contain" />;

    default: {
      const preview = getMessageText(message.message);
      return (
        <span className="text-sm">
          {preview || "Mensagem não suportada"}
        </span>
      );
    }
  }
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
  const { sendText: sendTextMutation } = useSendMessage();
  const { sendMedia: sendMediaMutation } = useSendMedia();
  const { sendAudio: sendAudioMutation } = useSendAudio();
  const archiveChat = useArchiveChat();
  const markChatRead = useMarkChatRead();
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();
  const { instanceId, remoteJid } = useParams<{ instanceId: string; remoteJid: string }>();

  // Handle sending text messages
  const sendTextMessage = async () => {
    if (!messageText.trim() || !remoteJid || !instance?.name || !instance?.token || isSending) return;

    try {
      setIsSending(true);
      await sendTextMutation({
        instanceName: instance.name,
        token: instance.token,
        data: {
          number: remoteJid,
          text: messageText.trim(),
        },
      });

      // Clear the input after sending
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

    // Function to update message status (simplified - just log for now)
    const updateMessageStatus = (data: any) => {
      if (!instance) return;
      if (data.instance !== instance.name) return;

      console.log("Received message status update:", data);
      // TODO: Implement proper message status updates when Message type supports it
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
    const sortedMessages = [...allMessages].sort((a, b) => {
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
  }, [allMessages, t, locale]);

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

  // Clear selected media and real-time messages when switching chats
  useEffect(() => {
    setSelectedMedia(null);
    setMessageText("");
    setRealtimeMessages([]); // Clear real-time messages when switching chats
    if (textareaRef.current) {
      textareaRef.current.value = "";
      handleTextareaChange();
    }
  }, [remoteJid]);

  const renderBubbleRight = (message: Message) => (
    <div key={message.id} className="mb-3 flex justify-end">
      <div className="inbox-bubble inbox-bubble-out">
        <MessageContent message={message} />
        <span className="inbox-bubble-time">{formatMessageTime(getMessageTimestamp(message), locale)}</span>
      </div>
    </div>
  );

  const renderBubbleLeft = (message: Message) => {
    const isGroup = !!remoteJid?.endsWith("@g.us");
    const participant = message.key.participant;
    const senderKey = participant || message.pushName || "";
    const senderName = message.pushName || (participant ? participant.split("@")[0] : "");

    return (
      <div key={message.id} className="mb-3 flex justify-start">
        <div className="inbox-bubble inbox-bubble-in">
          {isGroup && senderName && (
            <div className="mb-1 text-xs font-semibold" style={{ color: getSenderColor(senderKey) }}>
              {senderName}
            </div>
          )}
          <MessageContent message={message} />
          <span className="inbox-bubble-time">{formatMessageTime(getMessageTimestamp(message), locale)}</span>
        </div>
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
  const headerSub = formatWhatsAppNumber(chat?.remoteJid || remoteJid);
  const headerVerified = Boolean(liveProfile.data?.verified || liveProfile.data?.verifiedName);
  const labels = chatLabels(chat?.labels);
  const isOpenWindow = chat?.windowActive !== false;

  useEffect(() => {
    if (!instance?.name || !instance?.token || !remoteJid) return;
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
      await archiveChat({
        instanceName: instance.name,
        token: instance.token,
        chat: remoteJid,
        archive: true,
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
    <div className="flex h-full flex-col bg-[var(--inbox-canvas)]">
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
            <p className="truncate text-xs text-muted-foreground">{headerSub}</p>
          </div>
        </button>
        <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={concludeChat}>
          <CheckCheck className="mr-1.5 h-4 w-4" />
          {t("chat.conclude.action", { defaultValue: "Concluir" })}
        </Button>
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
            {group.messages.map((message) =>
              message.key.fromMe ? renderBubbleRight(message) : renderBubbleLeft(message),
            )}
          </div>
        ))}
        <div ref={lastMessageRef as never} />
      </div>
      <div className="inbox-composer">
        <div className="inbox-composer-box">
          {selectedMedia && (
            <div className="border-b border-border bg-muted/30 px-3 py-2">
              <SelectedMedia selectedMedia={selectedMedia} setSelectedMedia={setSelectedMedia} />
            </div>
          )}
          <div className="flex items-end gap-2 px-2 py-1.5">
            <div className="flex flex-shrink-0 items-center">
              {instance && <MediaOptions instance={instance} setSelectedMedia={setSelectedMedia} />}
            </div>
            <Textarea
              placeholder={t("chat.input.placeholder", { defaultValue: "Digite sua mensagem... (digite / para respostas prontas)" })}
              name="message"
              id="message"
              rows={1}
              ref={textareaRef}
              value={messageText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
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
      />
    </div>
  );
}

export { Messages };
