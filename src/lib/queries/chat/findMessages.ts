import { useInfiniteQuery } from "@tanstack/react-query";

import { Message } from "@/types/evolution.types";

import { api } from "../api";
import { UseQueryParams } from "../types";

interface IParams {
  instanceName: string;
  remoteJid: string;
  page?: number;
  offset?: number;
}

export type FindMessagesPage = {
  records: Message[];
  pages: number;
  currentPage: number;
  total: number;
};

const PAGE_SIZE = 80;

const queryKey = (params: Partial<IParams>) => ["chats", "findMessages", params.instanceName, params.remoteJid];

export const findMessages = async ({ instanceName, remoteJid, page = 1, offset = PAGE_SIZE }: IParams): Promise<FindMessagesPage> => {
  const response = await api.post(`/chat/findMessages/${instanceName}`, {
    where: { key: { remoteJid } },
    page,
    offset,
  });
  const payload = response.data?.messages;
  if (payload?.records) {
    return {
      records: payload.records as Message[],
      pages: Number(payload.pages || 1),
      currentPage: Number(payload.currentPage || page),
      total: Number(payload.total || payload.records.length),
    };
  }
  const records = Array.isArray(response.data) ? (response.data as Message[]) : [];
  return { records, pages: 1, currentPage: 1, total: records.length };
};

export const useFindMessages = (props: UseQueryParams<FindMessagesPage> & Partial<IParams>) => {
  const { instanceName, remoteJid, ...rest } = props;
  return useInfiniteQuery({
    queryKey: queryKey({ instanceName, remoteJid }),
    queryFn: ({ pageParam }) =>
      findMessages({ instanceName: instanceName!, remoteJid: remoteJid!, page: pageParam, offset: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.currentPage < lastPage.pages ? lastPage.currentPage + 1 : undefined),
    enabled: !!instanceName && !!remoteJid,
    refetchOnWindowFocus: false,
    ...rest,
  });
};
