import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { api } from "../api";

export type WhatsAppProfile = {
  wuid?: string;
  name?: string;
  picture?: string | null;
  status?: string | null;
  numberExists?: boolean;
  isBusiness?: boolean;
  description?: string;
  website?: string;
  email?: string;
};

export const fetchWhatsAppProfile = async ({ instanceName, number }: { instanceName: string; number: string }) => {
  const response = await api.post(`/chat/fetchProfile/${instanceName}`, { number });
  return response.data as WhatsAppProfile;
};

const profileKey = (instanceName: string, number: string) => ["whatsapp", "profile", instanceName, number];

export const useFetchWhatsAppProfile = ({
  instanceName,
  number,
  enabled = true,
}: {
  instanceName?: string;
  number?: string;
  enabled?: boolean;
}) =>
  useQuery({
    queryKey: profileKey(instanceName || "", number || ""),
    queryFn: () => fetchWhatsAppProfile({ instanceName: instanceName!, number: number! }),
    enabled: enabled && !!instanceName && !!number,
    staleTime: 30 * 60 * 1000,
    retry: 0,
  });

export const useLiveProfiles = (
  instanceName: string | undefined,
  contacts: { remoteJid: string; pushName?: string; profilePicUrl?: string }[],
  enabled: boolean,
) => {
  const targets = useMemo(() => {
    if (!enabled || !instanceName) return [];
    return contacts.filter((contact) => !contact.profilePicUrl || !contact.pushName?.trim()).slice(0, 16);
  }, [contacts, enabled, instanceName]);

  const results = useQueries({
    queries: targets.map((contact) => ({
      queryKey: profileKey(instanceName || "", contact.remoteJid),
      queryFn: () => fetchWhatsAppProfile({ instanceName: instanceName!, number: contact.remoteJid }),
      enabled: enabled && !!instanceName,
      staleTime: 30 * 60 * 1000,
      retry: 0,
    })),
  });

  return useMemo(() => {
    const map = new Map<string, { name?: string; picture?: string }>();
    targets.forEach((contact, index) => {
      const data = results[index]?.data;
      if (!data) return;
      map.set(contact.remoteJid, {
        name: data.name || undefined,
        picture: data.picture || undefined,
      });
    });
    return map;
  }, [results, targets]);
};
