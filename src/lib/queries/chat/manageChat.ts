import { api } from "../api";
import { useManageMutation } from "../mutateQuery";

interface ArchiveChatParams {
  instanceName: string;
  token: string;
  chat: string;
  archive: boolean;
  lastMessage?: {
    key?: { id?: string; fromMe?: boolean; remoteJid?: string };
    messageTimestamp?: string | number;
  };
}

interface MarkReadParams {
  instanceName: string;
  token: string;
  remoteJid: string;
  messageId?: string;
}

const archiveChat = async ({ instanceName, token, chat, archive, lastMessage }: ArchiveChatParams) => {
  const response = await api.post(
    `/chat/archiveChat/${instanceName}`,
    {
      chat,
      archive,
      lastMessage: lastMessage?.key?.id
        ? {
            key: {
              id: lastMessage.key.id,
              fromMe: Boolean(lastMessage.key.fromMe),
              remoteJid: lastMessage.key.remoteJid || chat,
            },
            messageTimestamp: Number(lastMessage.messageTimestamp) || undefined,
          }
        : undefined,
    },
    { headers: { apikey: token } },
  );
  return response.data;
};

const markChatRead = async ({ instanceName, token, remoteJid, messageId }: MarkReadParams) => {
  const response = await api.post(
    `/chat/markMessageAsRead/${instanceName}`,
    {
      readMessages: [
        {
          id: messageId,
          fromMe: false,
          remoteJid,
        },
      ],
    },
    { headers: { apikey: token } },
  );
  return response.data;
};

export function useArchiveChat() {
  return useManageMutation(archiveChat, {
    invalidateKeys: [["chats", "findChats"]],
  });
}

export function useMarkChatRead() {
  return useManageMutation(markChatRead, {
    invalidateKeys: [["chats", "findChats"]],
  });
}

interface MarkUnreadParams {
  instanceName: string;
  token: string;
  chat: string;
}

const markChatUnread = async ({ instanceName, token, chat }: MarkUnreadParams) => {
  const response = await api.post(`/chat/markChatUnread/${instanceName}`, { chat }, { headers: { apikey: token } });
  return response.data;
};

export function useMarkChatUnread() {
  return useManageMutation(markChatUnread, {
    invalidateKeys: [["chats", "findChats"]],
  });
}

interface DeleteMessageParams {
  instanceName: string;
  token: string;
  id: string;
  fromMe: boolean;
  remoteJid: string;
}

const deleteMessage = async ({ instanceName, token, id, fromMe, remoteJid }: DeleteMessageParams) => {
  const response = await api.delete(`/chat/deleteMessageForEveryone/${instanceName}`, {
    headers: { apikey: token },
    data: { id, fromMe, remoteJid },
  });
  return response.data;
};

export function useDeleteMessage() {
  return useManageMutation(deleteMessage, {
    invalidateKeys: [
      ["chats", "findMessages"],
      ["chats", "findChats"],
    ],
  });
}

interface SendReactionParams {
  instanceName: string;
  token: string;
  key: { id: string; fromMe: boolean; remoteJid: string };
  reaction: string;
}

const sendReaction = async ({ instanceName, token, key, reaction }: SendReactionParams) => {
  const response = await api.post(
    `/message/sendReaction/${instanceName}`,
    { key, reaction },
    { headers: { apikey: token } },
  );
  return response.data;
};

export function useSendReaction() {
  return useManageMutation(sendReaction, {
    invalidateKeys: [["chats", "findMessages"]],
  });
}

const blockUser = async ({ instanceName, token, number, status }: { instanceName: string; token: string; number: string; status: "block" | "unblock" }) => {
  const response = await api.post(`/chat/updateBlockStatus/${instanceName}`, { number, status }, { headers: { apikey: token } });
  return response.data;
};

export function useBlockUser() {
  return useManageMutation(blockUser);
}

export const sendPresence = async ({
  instanceName,
  token,
  number,
  presence = "available",
}: {
  instanceName: string;
  token: string;
  number: string;
  presence?: string;
}) => {
  const response = await api.post(
    `/chat/sendPresence/${instanceName}`,
    { number, presence, delay: 1 },
    { headers: { apikey: token } },
  );
  return response.data;
};

export const updateMessageText = async ({
  instanceName,
  token,
  number,
  key,
  text,
}: {
  instanceName: string;
  token: string;
  number: string;
  key: { id: string; fromMe: boolean; remoteJid: string };
  text: string;
}) => {
  const response = await api.post(
    `/chat/updateMessage/${instanceName}`,
    { number, key, text },
    { headers: { apikey: token } },
  );
  return response.data;
};

export const setDisappearingMessages = async ({
  instanceName,
  token,
  number,
  expiration,
}: {
  instanceName: string;
  token: string;
  number: string;
  expiration: number;
}) => {
  const response = await api.post(
    `/chat/updateDisappearingMessages/${instanceName}`,
    { number, expiration },
    { headers: { apikey: token } },
  );
  return response.data;
};
