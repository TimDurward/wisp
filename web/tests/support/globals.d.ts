import type { WhatsApp } from '../../src/whatsapp';
import type { UI } from '../../src/ui';
import type { FocusLayout } from '../../src/ui/focus';
import type { Draft } from '../../src/runtime/draft';
import type { createRuntime } from '../../src/runtime/app';

declare global {
  interface Window {
    testAdapter: typeof WhatsApp;
    testUI: typeof UI;
    testLayout: typeof FocusLayout;
    testDraft: typeof Draft;
    testApp: () => void;
    testRuntime?: ReturnType<typeof createRuntime>;
    compromised?: boolean;
  }
}
