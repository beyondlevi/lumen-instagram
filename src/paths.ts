const part = encodeURIComponent;

export const homePath = () => '/';
export const commentsPath = (reelId: string) => `/reel/${part(reelId)}/comments`;
export const sendPath = (reelId: string) => `/reel/${part(reelId)}/send`;
export const threadPath = (threadId: string) => `/direct/${part(threadId)}`;
export const recordPath = (threadId: string) => `/direct/${part(threadId)}/record`;
export const transcriptPath = (threadId: string, messageId: string) => `/direct/${part(threadId)}/transcript/${part(messageId)}`;
export const playPath = (threadId: string, messageId: string) => `/direct/${part(threadId)}/play/${part(messageId)}`;
export const photoPath = (threadId: string, messageId: string) => `/direct/${part(threadId)}/photo/${part(messageId)}`;
