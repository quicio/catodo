export {};

declare global {
  interface Window {
    catodo?: {
      openLogin?: (url: string) => Promise<unknown>;
      mediaKey?: (key: string) => void;
      insertText?: (text: string) => void;
      setActiveChannel?: (channelId: string) => void;
      retryBackend?: () => void;
      requestQuit?: () => void;
    };
  }
}
