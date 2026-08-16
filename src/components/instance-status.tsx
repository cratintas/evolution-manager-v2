import { useTranslation } from "react-i18next";

import { Badge } from "@evoapi/design-system/badge";

export function InstanceStatus({ status, configured }: { status?: string; configured?: boolean }) {
  const { t } = useTranslation();

  if (status === "open") return <Badge>{t("status.open")}</Badge>;

  if (status === "connecting") return <Badge variant="warning">{t("status.connecting")}</Badge>;

  if (!configured) {
    return <Badge variant="secondary">{t("status.unconfigured", { defaultValue: "Não configurado" })}</Badge>;
  }

  if (status === "close" || status === "closed") return <Badge variant="destructive">{t("status.closed")}</Badge>;

  if (!status) return null;

  return <Badge variant="secondary">{status}</Badge>;
}
