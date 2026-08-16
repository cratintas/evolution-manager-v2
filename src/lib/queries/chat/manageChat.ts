import { api } from "../api";
import { useManageMutation } from "../mutateQuery";

interface ArchiveChatParams {
  instanceName: string;
  token: string;
  chat: string;
  archive: boolean;
}

interface MarkReadParams {
  instanceName: string;
  token: string;
  remoteJid: string;
  messageId?: string;
}

const archiveChat = async ({ instanceName, token, chat, archive }: ArchiveChatParams) => {
  const response = await api.post(
    `/chat/archiveChat/${instanceName}`,
    { chat, archive },
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
