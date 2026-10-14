const MAX_AUDIO_BYTES = 32 * 1024 * 1024;
export async function decodeVoice(
  source: string,
  signal: AbortSignal,
  maxMinutes = 10,
): Promise<AudioBuffer> {
  const response = await fetch(source, { signal });
  if (!response.ok) throw new Error('WhatsApp could not download this recording. Try again.');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('The recording is not available.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_AUDIO_BYTES) throw new Error('This voice note is too large to transcribe.');
      chunks.push(part.value);
    }
  } catch (error) {
    await reader.cancel();
    throw error;
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  signal.throwIfAborted();
  const decoder = new AudioContext({ sampleRate: 16000 });
  try {
    const audio = await decoder.decodeAudioData(bytes.buffer);
    signal.throwIfAborted();
    if (!audio.length || audio.duration > Math.min(30, maxMinutes) * 60)
      throw new Error(
        `This voice note exceeds your ${maxMinutes}-minute limit. Change it in Languages settings.`,
      );
    if (audio.sampleRate !== 16000)
      throw new Error('This browser could not prepare the recording for transcription.');
    return audio;
  } finally {
    await decoder.close();
  }
}
export function pcmChunk(audio: AudioBuffer, start: number, count: number): string {
  const bytes = new Uint8Array(count * 2),
    view = new DataView(bytes.buffer);
  const channels = Array.from({ length: audio.numberOfChannels }, (_, i) =>
    audio.getChannelData(i),
  );
  for (let index = 0; index < count; index++) {
    let sample = 0;
    for (const channel of channels) sample += channel[start + index] || 0;
    sample = Math.max(-1, Math.min(1, sample / channels.length));
    view.setInt16(index * 2, Math.round(sample < 0 ? sample * 32768 : sample * 32767), true);
  }
  return btoa(String.fromCharCode(...bytes));
}
