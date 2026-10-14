import { createRuntime } from './runtime/app';

export function bootstrap() {
  if (window.top !== window || location.origin !== 'https://web.whatsapp.com') return;
  if (!window.QWebChannel || !window.qt?.webChannelTransport) return;
  new window.QWebChannel(window.qt.webChannelTransport, (channel) => {
    createRuntime(channel.objects.translation, window.__wispDiagnostics);
  });
}
bootstrap();
