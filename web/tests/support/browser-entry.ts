// Test-only entry point; Qt packages only dist/wisp.js.
import { WhatsApp } from '../../src/whatsapp';
import { UI } from '../../src/ui';
import { FocusLayout } from '../../src/ui/focus';
import { Draft } from '../../src/runtime/draft';
import { createRuntime } from '../../src/runtime/app';
Object.assign(window, {
  testAdapter: WhatsApp,
  testUI: UI,
  testLayout: FocusLayout,
  testDraft: Draft,
  testApp: () => {
    const Channel = window.QWebChannel;
    if (Channel && window.qt)
      new Channel(window.qt.webChannelTransport, (channel) =>
        Object.assign(window, { testRuntime: createRuntime(channel.objects.translation) }),
      );
  },
});
