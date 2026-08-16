import {
  Archive,
  ArchiveRestore,
  BellOff,
  Copy,
  Forward,
  ChevronDown,
  Info,
  MoreVertical,
  Pencil,
  Pin,
  PinOff,
  Star,
  Smile,
  Trash2,
  Undo2,
  UserRound,
} from "lucide-react";
import { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@evoapi/design-system/dropdown-menu";

import { cn } from "@/lib/utils";

export type ConversationMenuActions = {
  archived?: boolean;
  pinned?: boolean;
  onArchive: () => void;
  onUnread: () => void;
  onPin: () => void;
  onProfile: () => void;
  onMute?: () => void;
  onBlock?: () => void;
};

export type MessageMenuActions = {
  fromMe?: boolean;
  starred?: boolean;
  onReply: () => void;
  onCopy: () => void;
  onReact: () => void;
  onForward: () => void;
  onStar?: () => void;
  onDelete: () => void;
  onInfo?: () => void;
  onEdit?: () => void;
};

export function ConversationMenu({ archived, pinned, onArchive, onUnread, onPin, onProfile, onMute, onBlock, align = "end" }: ConversationMenuActions & { align?: "start" | "end" }) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inbox-item-chevron inline-flex h-5 w-5 items-center justify-center text-muted-foreground"
          onClick={(event) => event.stopPropagation()}
          aria-label={t("chat.menu.open", { defaultValue: "Mais opções" })}
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-52" onClick={(event) => event.stopPropagation()}>
        <DropdownMenuItem onClick={onArchive}>
          {archived ? <ArchiveRestore className="mr-2 h-4 w-4" /> : <Archive className="mr-2 h-4 w-4" />}
          {archived
            ? t("chat.menu.unarchive", { defaultValue: "Desarquivar conversa" })
            : t("chat.menu.archive", { defaultValue: "Arquivar conversa" })}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onUnread}>
          <Undo2 className="mr-2 h-4 w-4" />
          {t("chat.menu.unread", { defaultValue: "Marcar como não lida" })}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onMute}>
          <BellOff className="mr-2 h-4 w-4" />
          {t("chat.menu.mute", { defaultValue: "Silenciar notificações" })}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onPin}>
          {pinned ? <PinOff className="mr-2 h-4 w-4" /> : <Pin className="mr-2 h-4 w-4" />}
          {pinned ? t("chat.menu.unpin", { defaultValue: "Desafixar" }) : t("chat.menu.pin", { defaultValue: "Fixar conversa" })}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onProfile}>
          <UserRound className="mr-2 h-4 w-4" />
          {t("chat.menu.profile", { defaultValue: "Dados do contato" })}
        </DropdownMenuItem>
        {onBlock ? (
          <DropdownMenuItem onClick={onBlock} className="text-destructive">
            <Trash2 className="mr-2 h-4 w-4" />
            {t("chat.menu.block", { defaultValue: "Bloquear" })}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function MessageMenu({ fromMe, starred, onReply, onCopy, onReact, onForward, onStar, onDelete, onInfo, onEdit }: MessageMenuActions) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inbox-kebab mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          aria-label={t("chat.messageMenu.open", { defaultValue: "Opções da mensagem" })}
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={fromMe ? "end" : "start"} className="w-48">
        <DropdownMenuItem onClick={onReply}>
          <Undo2 className="mr-2 h-4 w-4" />
          {t("chat.messageMenu.reply", { defaultValue: "Responder" })}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onReact}>
          <Smile className="mr-2 h-4 w-4" />
          {t("chat.messageMenu.react", { defaultValue: "Reagir" })}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onForward}>
          <Forward className="mr-2 h-4 w-4" />
          {t("chat.messageMenu.forward", { defaultValue: "Encaminhar" })}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onCopy}>
          <Copy className="mr-2 h-4 w-4" />
          {t("chat.messageMenu.copy", { defaultValue: "Copiar" })}
        </DropdownMenuItem>
        {onStar ? (
          <DropdownMenuItem onClick={onStar}>
            <Star className="mr-2 h-4 w-4" />
            {starred
              ? t("chat.messageMenu.unstar", { defaultValue: "Remover estrela" })
              : t("chat.messageMenu.star", { defaultValue: "Favoritar" })}
          </DropdownMenuItem>
        ) : null}
        {fromMe && onEdit ? (
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="mr-2 h-4 w-4" />
            {t("chat.messageMenu.edit", { defaultValue: "Editar" })}
          </DropdownMenuItem>
        ) : null}
        {onInfo ? (
          <DropdownMenuItem onClick={onInfo}>
            <Info className="mr-2 h-4 w-4" />
            {t("chat.messageMenu.info", { defaultValue: "Dados da mensagem" })}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={onDelete} className="text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          {t("chat.messageMenu.delete", { defaultValue: "Apagar" })}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ContextMenuPanel({
  open,
  x,
  y,
  children,
  onClose,
}: {
  open: boolean;
  x: number;
  y: number;
  children: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" onClick={onClose} onContextMenu={(event) => event.preventDefault()}>
      <div
        className={cn("absolute min-w-52 rounded-md border bg-popover p-1 text-popover-foreground shadow-md")}
        style={{ left: Math.min(x, window.innerWidth - 220), top: Math.min(y, window.innerHeight - 240) }}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function ContextMenuItem({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon: typeof Archive;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn("flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent", destructive && "text-destructive")}
      onClick={onClick}
    >
      <Icon className="mr-2 h-4 w-4" />
      {label}
    </button>
  );
}

