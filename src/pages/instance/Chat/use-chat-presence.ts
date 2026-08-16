import { useEffect, useState } from "react";

import { getToken, TOKEN_ID } from "@/lib/queries/token";
import { connectSocket, disconnectSocket } from "@/services/websocket/socket";

export type PresenceState = {
  presence: string;
  lastSeen?: number;
};

const jidDigits = (value?: string) => (value || "").split("@")[0].split(":")[0].replace(/\D/g, "");

const samePresenceJid = (left?: string, right?: string) => {
  if (!left || !right) return false;
  if (left === right) return true;
  const leftDigits = jidDigits(left);
  const rightDigits = jidDigits(right);
  return !!leftDigits && leftDigits === rightDigits;
};

export function useChatPresence(instanceName?: string, jid?: string | string[]) {
  const [state, setState] = useState<PresenceState>({ presence: "unavailable" });
  const targets = (Array.isArray(jid) ? jid : [jid]).filter((item): item is string => !!item);
  const targetKey = targets.join("|");

  useEffect(() => {
    if (!instanceName) return;
    const serverUrl = getToken(TOKEN_ID.API_URL);
    if (!serverUrl) return;
    const socket = connectSocket(serverUrl);
    const currentTargets = targetKey.split("|").filter(Boolean);

    const matches = (value?: string) => !!value && (currentTargets.length === 0 || currentTargets.some((target) => samePresenceJid(value, target)));

    const onPresence = (payload: {
      instance?: string;
      data?: { id?: string; presences?: Record<string, { lastKnownPresence?: string; lastSeen?: number }> };
      id?: string;
      presences?: Record<string, { lastKnownPresence?: string; lastSeen?: number }>;
    }) => {
      if (payload.instance && payload.instance !== instanceName) return;
      const id = payload.data?.id || payload.id;
      const presences = payload.data?.presences || payload.presences;
      if (!id || !presences) return;
      const related = Object.entries(presences).find(([key]) => matches(key));
      if (currentTargets.length && !matches(id) && !related) return;
      const entry = related?.[1] || currentTargets.map((target) => presences[target]).find(Boolean) || presences[id] || Object.values(presences)[0];
      if (!entry) return;
      setState({
        presence: entry.lastKnownPresence || "unavailable",
        lastSeen: entry.lastSeen,
      });
    };

    socket.on("presence.update", onPresence);
    socket.connect();
    return () => {
      socket.off("presence.update");
      disconnectSocket(socket);
    };
  }, [instanceName, targetKey]);

  return state;
}

export function formatLastSeen(lastSeen?: number, locale = "pt-BR") {
  if (!lastSeen) return "";
  const date = new Date(lastSeen * (lastSeen > 10_000_000_000 ? 1 : 1000));
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return `visto por último hoje às ${date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}`;
  }
  return `visto por último ${date.toLocaleDateString(locale, { day: "2-digit", month: "short" })} às ${date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}`;
}

export function presenceLabel(presence: string, lastSeen?: number, locale = "pt-BR") {
  if (presence === "available") return "online";
  if (presence === "composing") return "digitando...";
  if (presence === "recording") return "gravando áudio...";
  return formatLastSeen(lastSeen, locale);
}
