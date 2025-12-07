import { useSyncExternalStore } from 'react';
import { SET_GLOBALS_EVENT_TYPE, type OpenAiGlobals, type SetGlobalsEvent } from '../types/openai'; // 路径按你的声明文件调整

export function useOpenAiGlobal<K extends keyof OpenAiGlobals>(key: K): OpenAiGlobals[K] | undefined {
    return useSyncExternalStore(
        (onChange) => {
            const handleSetGlobal = (event: SetGlobalsEvent) => {
                if (event.detail.globals[key] !== undefined) onChange();
            };
            window.addEventListener(SET_GLOBALS_EVENT_TYPE, handleSetGlobal, { passive: true });
            return () => window.removeEventListener(SET_GLOBALS_EVENT_TYPE, handleSetGlobal);
        },
        () => window.openai?.[key],
        () => undefined // SSR fallback
    );
}

export const useToolResponseMetadata = () => useOpenAiGlobal('toolResponseMetadata');
export const useDisplayMode = () => useOpenAiGlobal('displayMode');
