import { Timer } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@evoapi/design-system/button";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const EPHEMERAL_OPTIONS = [
  { value: 0, label: "Desativadas", hint: "As mensagens não desaparecem" },
  { value: 86400, label: "24 horas", hint: "Somem um dia depois de enviadas" },
  { value: 604800, label: "7 dias", hint: "Somem uma semana depois de enviadas" },
  { value: 7776000, label: "90 dias", hint: "Somem 90 dias depois de enviadas" },
] as const;

export function ephemeralLabel(seconds?: number) {
  return EPHEMERAL_OPTIONS.find((item) => item.value === seconds)?.label || "Desativadas";
}

type EphemeralDialogProps = {
  open: boolean;
  current: number;
  onOpenChange: (open: boolean) => void;
  onSelect: (expiration: number) => void;
};

export function EphemeralDialog({ open, current, onOpenChange, onSelect }: EphemeralDialogProps) {
  const { t } = useTranslation();
  const selected = EPHEMERAL_OPTIONS.some((item) => item.value === current) ? current : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5" />
            {t("chat.ephemeral.title", { defaultValue: "Mensagens temporárias" })}
          </DialogTitle>
          <DialogDescription>
            {t("chat.ephemeral.help", {
              defaultValue: "Novas mensagens neste chat desaparecem após o tempo escolhido, como no WhatsApp.",
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {EPHEMERAL_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={cn(
                "flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors",
                selected === option.value ? "border-primary bg-primary/10" : "border-border hover:bg-muted/60",
              )}
              onClick={() => {
                onSelect(option.value);
                onOpenChange(false);
              }}
            >
              <span
                className={cn(
                  "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                  selected === option.value ? "border-primary" : "border-muted-foreground/40",
                )}
              >
                {selected === option.value ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
              </span>
              <span>
                <span className="block text-sm font-medium">{t(`chat.ephemeral.option.${option.value}`, { defaultValue: option.label })}</span>
                <span className="block text-xs text-muted-foreground">{t(`chat.ephemeral.hint.${option.value}`, { defaultValue: option.hint })}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="flex justify-end">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("button.cancel", { defaultValue: "Cancelar" })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
