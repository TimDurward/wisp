export type Direction = 'incoming' | 'outgoing';
export type Detection =
  'no_chat' | 'waiting_for_messages' | 'unsupported_messages' | 'ambiguous' | 'empty' | 'ready';
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
  boundary?: HTMLElement;
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
  voice_enabled?: boolean;
  voice_auto?: boolean;
  voice_max_minutes?: number;
  speech?: SpeechModel;
  voice_languages?: VoiceLanguage[];
}
export interface SpeechModel {
  ready: boolean;
  downloading: boolean;
  progress: number;
  error: string;
  label: string;
  download_bytes: number;
}
export interface VoiceLanguage {
  code: string;
  label: string;
  supported: boolean;
}
export interface VoiceNote {
  id: string;
  direction: Direction;
  element: HTMLElement;
  container: HTMLElement;
}
export interface VoiceTranscript {
  text: string;
  language: string;
  confidence: number | null;
  review: boolean;
}
export type VoiceEvent =
  | {
      type: 'voice_saved';
      request_id: string;
      conversation: string;
      view_id: string;
      transcript: VoiceTranscript | null;
      language: string | null;
      translation: string | null;
    }
  | { type: 'voice_ack'; request_id: string; conversation: string; view_id: string; index: number }
  | {
      type: 'voice_status';
      request_id: string;
      conversation: string;
      view_id: string;
      stage: 'transcribing';
    }
  | {
      type: 'voice_transcript';
      request_id: string;
      conversation: string;
      view_id: string;
      transcript: VoiceTranscript;
    }
  | {
      type: 'voice_error';
      request_id: string;
      conversation: string;
      view_id: string;
      message: string;
    }
  | { type: 'speech_model'; speech: SpeechModel };
export type PageRequest =
  | { type: 'appearance'; dark: boolean }
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
      purpose: 'reply' | 'reading' | 'voice';
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
      type: 'voice_begin';
      retranscribe?: boolean;
      request_id: string;
      conversation: string;
      view_id: string;
      message_id: string;
      direction: Direction;
      language: string | null;
      context: ContextLine[];
    }
  | {
      type: 'voice_audio';
      request_id: string;
      conversation: string;
      view_id: string;
      index: number;
      pcm: string;
    }
  | {
      type: 'saved_voice';
      request_id: string;
      conversation: string;
      view_id: string;
      message_id: string;
      direction: Direction;
      language: string | null;
      context: ContextLine[];
    }
  | {
      type: 'voice_finish' | 'voice_cancel';
      request_id: string;
      conversation: string;
      view_id: string;
    }
  | { type: 'speech_download'; conversation: string; view_id: string }
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
  | VoiceEvent
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
    __wispChatRepair?: (viewId: string) => { view_id: string; message_ids: string[] } | null;
    __wispLayout?: { preview: (value: boolean) => void; cancel: (value: boolean) => void };
    __wispDraftEditing?: {
      begin: (edit: NativeEdit) => boolean;
      selected: (id: string) => boolean | null;
      settle: (id: string, accepted: boolean) => void;
    };
  }
}
