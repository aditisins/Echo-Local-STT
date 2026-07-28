import type { EchoApi } from "./types";

declare global {
  interface Window {
    echo: EchoApi;
  }
}

export {};
