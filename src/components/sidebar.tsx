import { Avatar, AvatarFallback, AvatarImage } from "@evoapi/design-system/avatar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@evoapi/design-system/collapsible";
import {
  ChevronDown,
  CircleHelp,
  Cog,
  ContactRound,
  FileQuestion,
  IterationCcw,
  LayoutDashboard,
  MessageCircle,
  Zap,
} from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, useLocation } from "react-router-dom";

import { useInstance } from "@/contexts/InstanceContext";

import { BrandLogo } from "@/components/brand-logo";
import { FEATURES, FeatureKey, isFeatureEnabled } from "@/lib/provider/features";
import { cn } from "@/lib/utils";

const GATED_IDS = new Set<string>(Object.keys(FEATURES));
const isGated = (id: string): id is FeatureKey => GATED_IDS.has(id);
const shouldShow = (id?: string) => !id || !isGated(id) || isFeatureEnabled(id);

type MenuLeaf = {
  id: string;
  title: string;
  icon?: typeof LayoutDashboard;
  path?: string;
  link?: string;
};

type MenuGroup = {
  title: string;
  icon: typeof LayoutDashboard;
  children: MenuLeaf[];
};

type Menu = MenuLeaf | MenuGroup;

function SidebarShell({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <aside className="hidden w-62 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex" style={{ width: 248 }}>
      <div className="px-4 pb-5 pt-6">
        <BrandLogo compact />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {children}
      </nav>

      {footer && (
        <div className="space-y-1 border-t border-sidebar-border px-3 py-3">
          {footer}
        </div>
      )}
    </aside>
  );
}

function NavItem({ to, icon: Icon, label, isExternal }: { to: string; icon?: typeof LayoutDashboard; label: string; isExternal?: boolean }) {
  if (isExternal) {
    return (
      <a
        href={to}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        {Icon && <Icon className="h-5 w-5 flex-shrink-0" />}
        <span>{label}</span>
      </a>
    );
  }
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] font-medium transition-colors",
          isActive
            ? "bg-sidebar-accent font-semibold text-foreground before:absolute before:-left-3 before:top-1/2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-r before:bg-primary"
            : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
        )
      }
    >
      {({ isActive }) => (
        <>
          {Icon && <Icon className={cn("h-5 w-5 flex-shrink-0", isActive && "text-sidebar-primary")} />}
          <span>{label}</span>
        </>
      )}
    </NavLink>
  );
}

function ExternalLinks() {
  const { t } = useTranslation();
  return (
    <>
      <NavItem to="https://docs.evolutionfoundation.com.br/" icon={FileQuestion} label={t("sidebar.documentation")} isExternal />
      <NavItem to="https://evolution-api.com/postman" icon={CircleHelp} label={t("sidebar.postman")} isExternal />
    </>
  );
}

function MainSidebar() {
  const { t } = useTranslation();
  return (
    <SidebarShell footer={<ExternalLinks />}>
      <NavItem to="/manager" icon={LayoutDashboard} label={t("sidebar.dashboard")} />
    </SidebarShell>
  );
}

function InstanceSidebar() {
  const { t } = useTranslation();
  const { instance } = useInstance();
  const { pathname } = useLocation();

  const base = instance ? `/manager/instance/${instance.id}` : "";
  const connected = instance?.connectionStatus === "open";

  const menus: Menu[] = useMemo(
    () => [
      { id: "dashboard", title: t("sidebar.dashboard"), icon: LayoutDashboard, path: "dashboard" },
      { id: "chat", title: t("sidebar.chat"), icon: MessageCircle, path: "chat" },
      { id: "contacts", title: t("sidebar.contacts"), icon: ContactRound, path: "contacts" },
      ...(connected
        ? [
            {
              title: t("sidebar.configurations"),
              icon: Cog,
              children: [
                { id: "settings", title: t("sidebar.settings"), path: "settings" },
                { id: "proxy", title: t("sidebar.proxy"), path: "proxy" },
              ],
            } satisfies Menu,
          ]
        : []),
      {
        title: t("sidebar.events"),
        icon: IterationCcw,
        children: [
          { id: "webhook", title: t("sidebar.webhook"), path: "webhook" },
          { id: "websocket", title: t("sidebar.websocket"), path: "websocket" },
          { id: "rabbitmq", title: t("sidebar.rabbitmq"), path: "rabbitmq" },
          { id: "sqs", title: t("sidebar.sqs"), path: "sqs" },
        ],
      },
      {
        title: t("sidebar.integrations"),
        icon: Zap,
        children: [
          { id: "evoai", title: t("sidebar.evoai"), path: "evoai" },
          { id: "n8n", title: t("sidebar.n8n"), path: "n8n" },
          { id: "evolutionBot", title: t("sidebar.evolutionBot"), path: "evolutionBot" },
          { id: "chatwoot", title: t("sidebar.chatwoot"), path: "chatwoot" },
          { id: "typebot", title: t("sidebar.typebot"), path: "typebot" },
          { id: "openai", title: t("sidebar.openai"), path: "openai" },
          { id: "dify", title: t("sidebar.dify"), path: "dify" },
          { id: "flowise", title: t("sidebar.flowise"), path: "flowise" },
        ],
      },
    ],
    [t, connected],
  );

  const visibleMenus = useMemo(
    () =>
      menus
        .map((menu) => {
          if ("children" in menu) {
            return { ...menu, children: menu.children.filter((c) => shouldShow(c.id)) };
          }
          return menu;
        })
        .filter((menu) => {
          if ("children" in menu) return menu.children.length > 0;
          return shouldShow(menu.id);
        }),
    [menus],
  );

  const account = (
    <div className="mb-3 flex items-center gap-2 rounded-lg bg-sidebar-accent/70 px-3 py-2">
      <Avatar className="h-8 w-8">
        <AvatarImage src={instance?.profilePicUrl} alt={instance?.profileName || instance?.name} />
        <AvatarFallback className="text-xs">{(instance?.profileName || instance?.name || "EV").slice(0, 2)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-sidebar-foreground">
          {instance?.profileName || instance?.name || t("sidebar.account", { defaultValue: "Conta ativa" })}
        </p>
        <p className="truncate text-[11px] text-sidebar-foreground/70">
          {instance?.connectionStatus === "open"
            ? t("status.open")
            : instance?.ownerJid
              ? t("status.closed")
              : t("status.unconfigured", { defaultValue: "Não configurado" })}
        </p>
      </div>
    </div>
  );

  return (
    <SidebarShell
      footer={
        <>
          {account}
          <ExternalLinks />
        </>
      }
    >
      <NavItem to="/manager" label={`← ${t("dashboard.title")}`} />
      <div className="my-2 border-t border-sidebar-border" />
      {visibleMenus.map((menu) => {
        if ("children" in menu) {
          const groupActive = menu.children.some((c) => c.path && pathname.includes(c.path));
          return (
            <Collapsible key={menu.title} defaultOpen={groupActive}>
              <CollapsibleTrigger
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all",
                  groupActive ? "bg-sidebar-accent text-sidebar-primary" : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <span>{menu.title}</span>
                <ChevronDown className="ml-auto h-4 w-4 transition-transform data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="ml-7 mt-1 flex flex-col gap-1 border-l border-sidebar-border pl-3">
                {menu.children.map((child) => (
                  <NavLink
                    key={child.id}
                    to={`${base}/${child.path}`}
                    className={({ isActive }) =>
                      cn(
                        "rounded-md px-3 py-1.5 text-sm transition-all",
                        isActive ? "text-sidebar-primary font-medium" : "text-sidebar-foreground/75 hover:text-sidebar-accent-foreground",
                      )
                    }
                  >
                    {child.title}
                  </NavLink>
                ))}
              </CollapsibleContent>
            </Collapsible>
          );
        }
        return <NavItem key={menu.id} to={`${base}/${menu.path}`} label={menu.title} />;
      })}
    </SidebarShell>
  );
}

export { MainSidebar, InstanceSidebar };
