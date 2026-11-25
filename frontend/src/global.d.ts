export {};

declare global {
  interface Window {
    catodo?: {
      openLogin?: (url: string) => Promise<unknown>;
      pickDirectory?: (options?: {
        title?: string;
        defaultPath?: string;
      }) => Promise<string | null>;
      mediaKey?: (key: string) => void;
      insertText?: (text: string) => void;
      setActiveChannel?: (channelId: string) => void;
      retryBackend?: () => void;
      requestQuit?: () => void;
    };
  }
}
