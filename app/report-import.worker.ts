import { importReport } from '../lib/explorer.mjs';
self.onmessage = (
  event: MessageEvent<{ buffer: ArrayBuffer; name: string }>,
) => {
  try {
    const bytes = new Uint8Array(event.data.buffer);
    const encoding =
      bytes[0] === 255 && bytes[1] === 254
        ? 'utf-16le'
        : bytes[0] === 254 && bytes[1] === 255
          ? 'utf-16be'
          : 'utf-8';
    const report = importReport(
      new TextDecoder(encoding).decode(bytes),
      event.data.name,
    );
    self.postMessage({ ok: true, report });
  } catch (error) {
    self.postMessage({ ok: false, message: (error as Error).message });
  }
};
