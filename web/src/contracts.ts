export type Direction = 'incoming' | 'outgoing';
export type Detection =
  'no_chat' | 'waiting_for_messages' | 'unsupported_messages' | 'ambiguous' | 'ready';
export interface ContextLine {
  direction: Direction;
  text: string;
}
export interface Message extends ContextLine {
  id: string;
  element: HTMLElement;
  container: HTMLElement;
  sourceElements: HTMLElement[];
}
export interface Chat {
  conversation: string;
  title: string;
  main: HTMLElement | null;
  header: HTMLElement | null;
  selection: HTMLElement | null;
  messageIds: string[];
  detection: Detection;
}
export interface View extends Chat {
  peer: string;
  viewId: string;
}
export interface ComposerSlot {
  input: HTMLElement;
  panel: HTMLElement;
  sendRoot?: HTMLElement;
  kind?: 'attachment';
}
export interface FocusTargets {
  common: HTMLElement;
  expanded: HTMLElement[];
  hidden: HTMLElement[];
  interior: HTMLElement[];
  paint: HTMLElement[];
}
export interface ViewPreferences {
  reading_view: 'translation_first' | 'both_languages';
  include_sent: boolean;
  live_preview: boolean;
  enter_prepares: boolean;
  focus_chat: boolean;
  original_on_hover: boolean;
}
export interface Config {
  type: 'config';
  conversation: string;
  view_id: string;
  revision: number;
  enabled: boolean;
  can_translate: boolean;
  history_revision: number;
  reading_label: string;
  reply_label: string;
  reading_language: string;
  reply_language: string;
  has_rules?: boolean;
  view_preferences: ViewPreferences;
}
export type PageRequest =
  | {
      type: 'active_conversation';
      conversation: string;
      title: string;
      detection: Detection;
      view_id: string;
      message_ids: string[];
    }
  | {
      type: 'translate';
      request_id: string;
      conversation: string;
      message_id: string;
      direction: Direction;
      purpose: 'reply' | 'reading';
      text: string;
      context: ContextLine[];
    }
  | {
      type: 'saved_messages';
      request_id: string;
      conversation: string;
      view_id: string;
      messages: { message_id: string; direction: Direction; text: string }[];
    }
  | { type: 'cancel_translation'; request_id: string; conversation: string }
  | {
      type: 'edit_draft';
      edit_id: string;
      ticket: string;
      conversation: string;
      view_id: string;
      source: string;
      restore: boolean;
    };
export interface SavedMessages {
  type: 'saved_messages';
  request_id: string;
  conversation: string;
  view_id: string;
  items: { message_id: string; text: string }[];
}
export type TranslationEvent =
  | {
      type: 'translation' | 'translation_progress';
      request_id: string;
      conversation: string;
      text: string;
    }
  | { type: 'translation_error'; request_id: string; conversation: string; message: string };
export type NativeEvent =
  | Config
  | SavedMessages
  | TranslationEvent
  | { type: 'draft_edit_error'; conversation: string; edit_id: string; message: string };
export interface NativeEdit {
  edit_id: string;
  conversation: string;
  view_id: string;
  source: string;
  text: string;
  restore: boolean;
}
export interface NativeChannel {
  submit(payload: string): void;
  translationEvent: { connect(callback: (payload: string) => void): void };
}
export type Submit = (request: PageRequest) => void;
export interface DraftState {
  source: string;
  text: string;
  phase: 'empty' | 'waiting' | 'translating' | 'ready' | 'preparing' | 'prepared' | 'error';
  mode: 'source' | 'translated';
  error: string;
  livePreview: boolean;
  enterPrepares: boolean;
  hasRules: boolean;
  originalSource: string;
  replyLabel?: string;
  replyLanguageLabel?: string;
}
export interface ComposerActions {
  preview: () => void;
  prepare: () => boolean;
  edit: () => void;
  copy: () => Promise<void>;
}
export interface ComposerUI {
  element: HTMLElement;
  preview: HTMLElement;
  update(state: DraftState): void;
  remove(): void;
}
export interface ReadingOptions {
  error?: boolean;
  loading?: boolean;
  retry?: () => void;
  readingView?: ViewPreferences['reading_view'];
  readingLabel?: string;
  hoverOriginal?: boolean;
}
export interface DraftServices {
  submit: Submit;
  context: () => ContextLine[];
  isCurrentView: () => boolean;
}
export interface ReadingSession {
  active: View;
  enabled: boolean;
  config: Config | null;
  preferences: ViewPreferences;
}

declare global {
  interface Window {
    qt?: { webChannelTransport: unknown };
    QWebChannel?: new (
      transport: unknown,
      callback: (channel: { objects: { translation: NativeChannel } }) => void,
    ) => unknown;
    __wispDiagnostics?: boolean;
    __wispReadLayout?: () => string;
    __wispReadStructure?: () => string;
    __wispLayout?: { preview: (value: boolean) => void; cancel: (value: boolean) => void };
    __wispDraftEditing?: {
      begin: (edit: NativeEdit) => boolean;
      selected: (id: string) => boolean | null;
      settle: (id: string, accepted: boolean) => void;
    };
  }
}
