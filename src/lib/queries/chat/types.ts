import { Chat, Message } from "@/types/evolution.types";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type FindChatResponse = Chat;

export type FindChatsResponse = Chat[];

export type FindMessagesResponse = Message[];

export type FindMessagesPage = {
  records: Message[];
  pages: number;
  currentPage: number;
  total: number;
};
