// src/react-app/types/openai.ts
export type DisplayMode = 'pip' | 'inline' | 'fullscreen';
export type Theme = 'light' | 'dark';
export type SafeAreaInsets = { top: number; bottom: number; left: number; right: number };
export type SafeArea = { insets: SafeAreaInsets };
export type DeviceType = 'mobile' | 'tablet' | 'desktop' | 'unknown';
export type UserAgent = { device: { type: DeviceType }; capabilities: { hover: boolean; touch: boolean } };
export type CallToolResponse = unknown;
export type UnknownObject = Record<string, unknown>;
export const SET_GLOBALS_EVENT_TYPE = 'openai:set_globals';
export class SetGlobalsEvent extends CustomEvent<{ globals: Partial<OpenAiGlobals> }> {
    readonly type = SET_GLOBALS_EVENT_TYPE;
}
export type OpenAiGlobals<
    ToolInput extends UnknownObject = UnknownObject,
    ToolOutput extends UnknownObject = UnknownObject,
    ToolResponseMetadata extends UnknownObject = UnknownObject,
    WidgetState extends UnknownObject = UnknownObject
> = {
    theme: Theme;
    userAgent: UserAgent;
    locale: string;
    maxHeight: number;
    displayMode: DisplayMode;
    safeArea: SafeArea;
    toolInput: ToolInput;
    toolOutput: ToolOutput | null;
    toolResponseMetadata: ToolResponseMetadata | null;
    widgetState: WidgetState | null;
};
export type API<WidgetState extends UnknownObject = UnknownObject> = {
    callTool: (name: string, args: Record<string, unknown>) => Promise<CallToolResponse>;
    requestClose: () => void;
    sendFollowUpMessage: (args: { prompt: string }) => Promise<void>;
    openExternal: (payload: { href: string }) => void;
    requestDisplayMode: (args: { mode: DisplayMode }) => Promise<{ mode: DisplayMode }>;
    setWidgetState: (state: WidgetState) => Promise<void>;
};
