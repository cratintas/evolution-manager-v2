import React from "react";
import { useLocation, useParams } from "react-router-dom";

import { Header } from "@/components/header";
import { InstanceSidebar } from "@/components/sidebar";

import { InstanceProvider } from "@/contexts/InstanceContext";
import { cn } from "@/lib/utils";

interface LayoutProps {
  children: React.ReactNode;
}

function InstanceLayout({ children }: LayoutProps) {
  const { instanceId } = useParams<{ instanceId: string }>();
  const { pathname } = useLocation();
  const isInbox = /\/(chat|contacts)(\/|$)/.test(pathname);

  return (
    <InstanceProvider>
      <div className="flex h-screen bg-background">
        <InstanceSidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {!isInbox && <Header instanceId={instanceId} />}
          <main className={cn("min-h-0 flex-1", isInbox ? "overflow-hidden p-0" : "overflow-y-auto p-6")}>
            {children}
          </main>
        </div>
      </div>
    </InstanceProvider>
  );
}

export { InstanceLayout };
