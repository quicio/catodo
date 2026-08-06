/// <reference types="vite/client" />

declare module "*.glsl?raw" {
  const src: string;
  export default src;
}

declare namespace JSX {
  interface IntrinsicElements {
    webview: React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        src?: string;
        partition?: string;
        allowpopups?: string | boolean;
        useragent?: string;
      },
      HTMLElement
    >;
  }
}
