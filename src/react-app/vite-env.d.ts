/// <reference types="vite/client" />
import type { API, OpenAiGlobals, SET_GLOBALS_EVENT_TYPE } from './types/openai';

export { };
declare global {
  interface Window {
    openai: API & OpenAiGlobals;
  }

  interface WindowEventMap {
    [SET_GLOBALS_EVENT_TYPE]: SetGlobalsEvent;
  }
}