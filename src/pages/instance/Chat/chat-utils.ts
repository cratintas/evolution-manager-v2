import { Chat, ChatLastMessage } from "@/types/evolution.types";

export const formatJid = (remoteJid?: string): string => {
  if (!remoteJid) return "";
  return remoteJid.split("@")[0].split(":")[0];
};

export const formatWhatsAppNumber = (input?: string): string => {
  if (!input) return "";
  if (input.includes("@g.us") || input.includes("@broadcast")) return formatJid(input);

  const digits = formatJid(input).replace(/\D/g, "");
  if (!digits) return input;

  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    const ddd = digits.slice(2, 4);
    const local = digits.slice(4);
    if (local.length === 9) return `55 ${ddd} ${local.slice(0, 5)}-${local.slice(5)}`;
    return `55 ${ddd} ${local.slice(0, 4)}-${local.slice(4)}`;
  }

  if (digits.startsWith("1") && digits.length === 11) {
    return `+1 ${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  if (digits.startsWith("351") && digits.length >= 12) {
    const rest = digits.slice(3);
    return `+351 ${rest.slice(0, 3)} ${rest.slice(3, 6)} ${rest.slice(6)}`.trim();
  }

  if (digits.startsWith("54") && digits.length >= 12) {
    const rest = digits.startsWith("549") ? digits.slice(3) : digits.slice(2);
    const area = rest.slice(0, 2);
    const local = rest.slice(2);
    if (local.length === 8) return `+54 9 ${area} ${local.slice(0, 4)}-${local.slice(4)}`;
    return `+54 ${digits.slice(2, 4)} ${digits.slice(4)}`;
  }

  if (digits.startsWith("52") && digits.length >= 12) {
    const rest = digits.startsWith("521") ? digits.slice(3) : digits.slice(2);
    return `+52 ${rest.slice(0, 2)} ${rest.slice(2, 6)} ${rest.slice(6)}`.trim();
  }

  if (digits.startsWith("44") && digits.length >= 11) {
    const rest = digits.slice(2);
    return `+44 ${rest.slice(0, 4)} ${rest.slice(4)}`;
  }

  if (digits.startsWith("351")) {
    return `+${digits}`;
  }

  const ccLength = digits.length > 11 ? 3 : digits.length > 10 ? 2 : 1;
  const cc = digits.slice(0, ccLength);
  const rest = digits.slice(ccLength);
  const groups: string[] = [];
  for (let index = 0; index < rest.length; index += rest.length % 3 === 0 ? 3 : 4) {
    const size = rest.length % 3 === 0 ? 3 : 4;
    groups.push(rest.slice(index, index + size));
  }
  return `+${cc} ${groups.join(" ")}`.trim();
};

export const isGroupJid = (remoteJid?: string): boolean => !!remoteJid?.includes("@g.us");

export const displayName = (chat: Pick<Chat, "pushName" | "remoteJid">): string =>
  chat.pushName?.trim() || formatWhatsAppNumber(chat.remoteJid) || "Contato";

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
