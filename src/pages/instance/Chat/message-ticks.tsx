import { Clock } from "lucide-react";

import { cn } from "@/lib/utils";

const rankOf = (status?: string | number | null) => {
  if (status == null || status === "") return 1;
  if (typeof status === "number") return status;
  const value = String(status).toUpperCase();
  if (value === "ERROR" || value === "0") return 0;
  if (value === "PENDING" || value === "1") return 1;
  if (value === "SERVER_ACK" || value === "2") return 2;
  if (value === "DELIVERY_ACK" || value === "3" || value === "DELIVERED") return 3;
  if (value === "READ" || value === "4" || value === "PLAYED" || value === "5") return 4;
  return 1;
};

const Check = ({ double, read }: { double?: boolean; read?: boolean }) => (
  <svg
    viewBox={double ? "0 0 16 11" : "0 0 12 11"}
    className={cn("inbox-ticks h-3 w-4 shrink-0", read ? "text-sky-400" : "text-current opacity-80")}
    aria-hidden
  >
    <path fill="currentColor" d="M11.1 1.2 4.7 8.1 1.9 5.2 1 6.1l3.7 3.8 7.3-7.8z" />
    {double ? <path fill="currentColor" d="M15.1 1.2 8.7 8.1 7.6 7l-.9.9 2 2 7.3-7.8z" /> : null}
  </svg>
);

export function resolveMessageStatus(
  message?: { status?: string | number | null; MessageUpdate?: { status?: string }[]; key?: { fromMe?: boolean } },
  live?: string | number | null,
) {
  const candidates = [live, message?.status, ...(message?.MessageUpdate || []).map((item) => item.status)];
  const ranks = candidates.map((item) => (item == null || item === "" ? -1 : rankOf(item))).filter((item) => item >= 0);
  if (!ranks.length) return message?.key?.fromMe ? "SERVER_ACK" : undefined;
  const best = Math.max(...ranks);
  if (best >= 4) return "READ";
  if (best === 3) return "DELIVERY_ACK";
  if (best === 2) return "SERVER_ACK";
  return "PENDING";
}

export function MessageTicks({ status, className }: { status?: string | number | null; className?: string }) {
  const rank = rankOf(status);
  if (rank <= 1) {
    return <Clock className={cn("inbox-ticks h-3 w-3 shrink-0 opacity-70", className)} aria-label="Enviando" />;
  }
  if (rank === 2) return <Check />;
  return <Check double read={rank >= 4} />;
}
