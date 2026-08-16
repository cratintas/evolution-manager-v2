import { Chat, ChatLastMessage } from "@/types/evolution.types";

export const formatJid = (remoteJid?: string): string => {
  if (!remoteJid) return "";
  return remoteJid.split("@")[0].split(":")[0];
};

export const isGroupJid = (remoteJid?: string): boolean => !!remoteJid?.includes("@g.us");

export const displayName = (chat: Pick<Chat, "pushName" | "remoteJid">): string =>
  chat.pushName?.trim() || formatJid(chat.remoteJid) || "Contato";

export const chatLabels = (labels?: Chat["labels"]): string[] => {
  if (!labels) return [];
  if (Array.isArray(labels)) {
    return labels.map((item) => String(item)).filter(Boolean);
  }
  if (typeof labels === "object") {
    return Object.values(labels)
      .map((item) => (item == null ? "" : String(item)))
      .filter(Boolean);
  }
  return [];
};

const extractText = (payload: unknown): string => {
  if (!payload) return "";
  if (typeof payload === "string") {
    try {
      return extractText(JSON.parse(payload));
    } catch {
      return payload;
    }
  }
  if (typeof payload !== "object") return String(payload);

  const message = payload as Record<string, unknown>;
  if (typeof message.conversation === "string") return message.conversation;
  if (typeof message.text === "string") return message.text;

  const extended = message.extendedTextMessage as { text?: string } | undefined;
  if (extended?.text) return extended.text;

  if (message.imageMessage) return "Imagem";
  if (message.videoMessage) return "Vídeo";
  if (message.audioMessage) return "Áudio";
  if (message.documentMessage) return "Documento";
  if (message.stickerMessage) return "Figurinha";
  if (message.contactMessage) return "Contato";
  if (message.locationMessage) return "Localização";
  if (message.reactionMessage) return "Reação";

  return "";
};

export const lastMessagePreview = (lastMessage?: ChatLastMessage): string => {
  if (!lastMessage) return "";
  const type = lastMessage.messageType;
  if (type === "imageMessage") return "Imagem";
  if (type === "videoMessage") return "Vídeo";
  if (type === "audioMessage") return "Áudio";
  if (type === "documentMessage") return "Documento";
  if (type === "stickerMessage") return "Figurinha";
  const text = extractText(lastMessage.message);
  return text || "Mensagem";
};

export const parseTimestamp = (value?: string | number | Date | null): Date | null => {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  if (typeof value === "object") {
    const raw = value as Record<string, unknown>;
    const nested = raw.low ?? raw.seconds ?? raw.timestamp ?? raw.time ?? raw.value;
    return typeof nested === "number" || typeof nested === "string" ? parseTimestamp(nested) : null;
  }

  if (typeof value === "string" && value.includes("T")) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const numeric = Number(value);
  if (Number.isNaN(numeric)) return null;
  const millis = numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatListTime = (chat: Chat, locale: string): string => {
  const date =
    parseTimestamp(chat.lastMessage?.messageTimestamp) ||
    parseTimestamp(chat.updatedAt) ||
    parseTimestamp(chat.createdAt);
  if (!date) return "";

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return locale.startsWith("pt") ? "Ontem" : "Yesterday";
  }

  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
    year: sameYear ? undefined : "numeric",
  });
};

export const toWhatsappJid = (raw: string): string => {
  const value = raw.trim();
  if (value.includes("@")) return value;
  const digits = value.replace(/\D/g, "");
  return `${digits}@s.whatsapp.net`;
};
