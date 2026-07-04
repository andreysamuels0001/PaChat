/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Overrides the gateway URL when the renderer runs in a plain browser. */
  readonly VITE_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
