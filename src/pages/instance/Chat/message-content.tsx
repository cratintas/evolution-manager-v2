import { useQuery } from "@tanstack/react-query";
import { FileText, MapPin, User } from "lucide-react";

import { api } from "@/lib/queries/api";
import { Message } from "@/types/evolution.types";

type MessageContentProps = {
  message: Message;
  instanceName?: string;
  token?: string;
};

type Unwrapped = {
  type: string;
  body: Record<string, unknown>;
  caption?: string;
};

const unwrapPayload = (raw: unknown): Record<string, unknown> => {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return unwrapPayload(JSON.parse(raw));
    } catch {
      return { conversation: raw };
    }
  }
  if (typeof raw !== "object") return { conversation: String(raw) };
  return raw as Record<string, unknown>;
};

export const unwrapMessage = (message: Message): Unwrapped => {
  let body = unwrapPayload(message.message);
  const wrappers = ["ephemeralMessage", "viewOnceMessage", "viewOnceMessageV2", "documentWithCaptionMessage", "editedMessage"];
  for (const wrapper of wrappers) {
    const nested = body[wrapper] as { message?: unknown } | undefined;
    if (nested?.message) body = unwrapPayload(nested.message);
  }

  const template = (body.templateMessage as { hydratedTemplate?: Record<string, unknown>; hydratedFourRowTemplate?: Record<string, unknown> } | undefined)
    ?.hydratedTemplate ||
    (body.templateMessage as { hydratedFourRowTemplate?: Record<string, unknown> } | undefined)?.hydratedFourRowTemplate;

  if (template) {
    const mediaType = ["imageMessage", "videoMessage", "documentMessage", "locationMessage"].find((key) => template[key]);
    return {
      type: mediaType || "templateMessage",
      body: mediaType ? { ...(template[mediaType] as object), mediaUrl: (template[mediaType] as { staticUrl?: string })?.staticUrl, caption: template.hydratedContentText } : body,
      caption: typeof template.hydratedContentText === "string" ? template.hydratedContentText : undefined,
    };
  }

  if (body.interactiveMessage) {
    const interactive = body.interactiveMessage as { body?: { text?: string }; header?: { imageMessage?: unknown; videoMessage?: unknown; text?: string } };
    return {
      type: interactive.header?.imageMessage ? "imageMessage" : interactive.header?.videoMessage ? "videoMessage" : "interactiveMessage",
      body: (interactive.header?.imageMessage as Record<string, unknown>) || (interactive.header?.videoMessage as Record<string, unknown>) || body,
      caption: interactive.body?.text || interactive.header?.text,
    };
  }

  const type = message.messageType || Object.keys(body).find((key) => key.endsWith("Message") || key === "conversation") || "unknown";
  const nested = (body[type] as Record<string, unknown>) || body;
  const caption =
    (typeof nested.caption === "string" && nested.caption) ||
    (typeof body.caption === "string" && body.caption) ||
    undefined;
  return { type, body, caption };
};

const formatWhatsAppText = (text: string) => {
  const parts = text.split(/(\n|```[\s\S]*?```|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|https?:\/\/[^\s]+)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part === "\n") return <br key={index} />;
    if (part.startsWith("```") && part.endsWith("```")) {
      return (
        <code key={index} className="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.8em]">
          {part.slice(3, -3)}
        </code>
      );
    }
    if (part.startsWith("*") && part.endsWith("*")) return <strong key={index}>{part.slice(1, -1)}</strong>;
    if (part.startsWith("_") && part.endsWith("_")) return <em key={index}>{part.slice(1, -1)}</em>;
    if (part.startsWith("~") && part.endsWith("~")) return <s key={index}>{part.slice(1, -1)}</s>;
    if (/^https?:\/\//.test(part)) {
      return (
        <a key={index} href={part} target="_blank" rel="noreferrer" className="underline">
          {part}
        </a>
      );
    }
    return <span key={index}>{part}</span>;
  });
};

const quotedPreview = (message: Message) => {
  const context = (message.message as { contextInfo?: { quotedMessage?: Record<string, unknown>; participant?: string } } | undefined)?.contextInfo
    || (message.message as { extendedTextMessage?: { contextInfo?: { quotedMessage?: Record<string, unknown>; participant?: string } } } | undefined)?.extendedTextMessage?.contextInfo;
  const quoted = context?.quotedMessage;
  if (!quoted) return null;
  const text =
    (typeof quoted.conversation === "string" && quoted.conversation) ||
    (typeof (quoted.extendedTextMessage as { text?: string } | undefined)?.text === "string" && (quoted.extendedTextMessage as { text?: string }).text) ||
    (typeof (quoted.imageMessage as { caption?: string } | undefined)?.caption === "string" && (quoted.imageMessage as { caption?: string }).caption) ||
    "Mensagem";
  return { text, participant: context?.participant };
};

const mediaSrcFrom = (message: Message, body: Record<string, unknown>) => {
  const candidates = [message.message?.mediaUrl, message.message?.base64, body.mediaUrl, body.url, body.staticUrl, (body as { jpegThumbnail?: string }).jpegThumbnail];
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate) continue;
    if (candidate.startsWith("http") || candidate.startsWith("blob:") || candidate.startsWith("data:")) return candidate;
    if (candidate.length > 80) return `data:image/jpeg;base64,${candidate}`;
  }
  return "";
};

const useMessageMedia = (message: Message, instanceName?: string, token?: string, enabled = false) =>
  useQuery({
    queryKey: ["chat", "media", instanceName, message.key?.id],
    enabled: enabled && !!instanceName && !!token && !!message.key?.id,
    staleTime: Infinity,
    retry: 0,
    queryFn: async () => {
      const { data } = await api.post(
        `/chat/getBase64FromMediaMessage/${instanceName}`,
        { message: { key: message.key, message: message.message } },
        { headers: { apikey: token } },
      );
      const base64 = data?.base64 as string | undefined;
      const mime = (data?.mimetype as string | undefined) || "application/octet-stream";
      if (!base64) return "";
      return base64.startsWith("data:") ? base64 : `data:${mime};base64,${base64}`;
    },
  });

const MediaFrame = ({
  message,
  body,
  instanceName,
  token,
  kind,
}: {
  message: Message;
  body: Record<string, unknown>;
  instanceName?: string;
  token?: string;
  kind: "image" | "video" | "audio" | "sticker";
}) => {
  const local = mediaSrcFrom(message, body);
  const remote = useMessageMedia(message, instanceName, token, !local);
  const src = local || remote.data || "";
  const gif = Boolean(body.gifPlayback);

  if (!src) {
    return <p className="text-sm opacity-80">{kind === "sticker" ? "Figurinha" : kind === "image" ? "Imagem" : kind === "video" ? (gif ? "GIF" : "Vídeo") : "Áudio"}</p>;
  }

  if (kind === "video") {
    return <video src={src} controls autoPlay={gif} loop={gif} muted={gif} className="max-h-80 max-w-full rounded-lg" />;
  }
  if (kind === "audio") {
    return (
      <audio controls className="w-full max-w-xs">
        <source src={src} />
      </audio>
    );
  }
  return <img src={src} alt={kind === "sticker" ? "Figurinha" : "Imagem"} className={kind === "sticker" ? "max-h-36 max-w-36 object-contain" : "max-h-80 max-w-full rounded-lg object-contain"} />;
};

export function MessageContent({ message, instanceName, token }: MessageContentProps) {
  const unwrapped = unwrapMessage(message);
  const { type, body, caption } = unwrapped;
  const quoted = quotedPreview(message);
  const quotedBlock = quoted ? (
    <div className="inbox-quote">
      <p className="truncate text-[11px] font-semibold opacity-80">{quoted.participant?.split("@")[0] || "Mensagem"}</p>
      <p className="truncate opacity-80">{quoted.text}</p>
    </div>
  ) : null;
  const text =
    (typeof body.conversation === "string" && body.conversation) ||
    (typeof body.text === "string" && body.text) ||
    (typeof (body.extendedTextMessage as { text?: string } | undefined)?.text === "string" &&
      (body.extendedTextMessage as { text?: string }).text) ||
    caption ||
    "";

  if (type === "imageMessage" || type === "stickerMessage" || type === "videoMessage" || type === "ptvMessage" || type === "audioMessage") {
    const kind = type === "stickerMessage" ? "sticker" : type === "audioMessage" ? "audio" : type === "imageMessage" ? "image" : "video";
    return (
      <div className="flex flex-col gap-1">
        <MediaFrame message={message} body={type === "imageMessage" || type === "videoMessage" || type === "stickerMessage" || type === "audioMessage" ? (message.message?.[type] as Record<string, unknown>) || body : body} instanceName={instanceName} token={token} kind={kind} />
        {caption || (type !== "stickerMessage" && text) ? <p className="whitespace-pre-wrap text-sm">{formatWhatsAppText(caption || text)}</p> : null}
      </div>
    );
  }

  if (type === "documentMessage" || type === "documentWithCaptionMessage") {
    const doc = (message.message?.documentMessage || (message.message?.documentWithCaptionMessage as { message?: { documentMessage?: { fileName?: string; fileLength?: number } } })?.message?.documentMessage || body) as { fileName?: string; name?: string; fileLength?: number };
    return (
      <div className="flex items-center gap-2">
        <FileText className="h-5 w-5 shrink-0" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{doc.fileName || doc.name || "Documento"}</p>
          {caption || text ? <p className="text-xs opacity-80">{caption || text}</p> : null}
        </div>
      </div>
    );
  }

  if (type === "contactMessage" || type === "contactsArrayMessage") {
    const contact = (message.message?.contactMessage || body) as { displayName?: string };
    return (
      <div className="flex items-center gap-2">
        <User className="h-4 w-4" />
        <span className="text-sm">{contact.displayName || "Contato"}</span>
      </div>
    );
  }

  if (type === "locationMessage" || type === "liveLocationMessage") {
    const location = (message.message?.locationMessage || message.message?.liveLocationMessage || body) as { name?: string; address?: string; degreesLatitude?: number; degreesLongitude?: number };
    return (
      <div className="space-y-1">
        <p className="inline-flex items-center gap-1 text-sm font-medium">
          <MapPin className="h-4 w-4" />
          {location.name || "Localização"}
        </p>
        {location.address ? <p className="text-xs opacity-80">{location.address}</p> : null}
      </div>
    );
  }

  if (type === "buttonsMessage" || type === "listMessage" || type === "interactiveMessage" || type === "templateMessage") {
    const buttons = message.message?.buttonsMessage as { contentText?: string; headerText?: string; buttons?: { buttonText?: { displayText?: string } }[] } | undefined;
    const list = message.message?.listMessage as { title?: string; description?: string; buttonText?: string } | undefined;
    const interactive = message.message?.interactiveMessage as { body?: { text?: string }; header?: { title?: string } } | undefined;
    const title = buttons?.headerText || list?.title || interactive?.header?.title || "Mensagem";
    const bodyText = buttons?.contentText || list?.description || interactive?.body?.text || text;
    return (
      <div className="space-y-1">
        {title ? <p className="text-sm font-semibold">{title}</p> : null}
        {bodyText ? <p className="whitespace-pre-wrap text-sm">{formatWhatsAppText(bodyText)}</p> : null}
        {buttons?.buttons?.length ? (
          <div className="mt-1 flex flex-col gap-1">
            {buttons.buttons.map((button, index) => (
              <span key={index} className="rounded-md border border-current/20 px-2 py-1 text-center text-xs">
                {button.buttonText?.displayText}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  if (type === "reactionMessage") {
    const reaction = message.message?.reactionMessage as { text?: string } | undefined;
    return <span className="text-2xl">{reaction?.text || "👍"}</span>;
  }

  if (type === "protocolMessage") {
    return <span className="text-sm italic opacity-80">Mensagem apagada</span>;
  }

  if (text) {
    return (
      <div>
        {quotedBlock}
        <span className="whitespace-pre-wrap break-words">{formatWhatsAppText(text)}</span>
      </div>
    );
  }

  return <span className="text-sm opacity-80">Mensagem</span>;
}
