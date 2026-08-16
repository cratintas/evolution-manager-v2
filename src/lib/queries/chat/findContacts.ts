import { useQuery } from "@tanstack/react-query";

import { Contact } from "@/types/evolution.types";

import { api } from "../api";
import { UseQueryParams } from "../types";

interface IParams {
  instanceName: string;
}

const queryKey = (params: Partial<IParams>) => ["chats", "findContacts", JSON.stringify(params)];

export const findContacts = async ({ instanceName }: IParams) => {
  const response = await api.post(`/chat/findContacts/${instanceName}`, {
    where: {},
  });
  if (Array.isArray(response.data)) return response.data as Contact[];
  if (Array.isArray(response.data?.contacts)) return response.data.contacts as Contact[];
  return [];
};

export const useFindContacts = (props: UseQueryParams<Contact[]> & Partial<IParams>) => {
  const { instanceName, ...rest } = props;
  return useQuery<Contact[]>({
    ...rest,
    queryKey: queryKey({ instanceName }),
    queryFn: () => findContacts({ instanceName: instanceName! }),
    enabled: !!instanceName,
  });
};
