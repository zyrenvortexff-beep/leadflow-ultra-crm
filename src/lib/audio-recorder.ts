// Codificador de Audio a MP3 real (audio/mpeg) compatible con Meta WhatsApp Cloud API
import { Mp3Encoder } from "@breezystack/lamejs";

export class AudioMp3Recorder {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private leftChannel: Float32Array[] = [];
  private recordingLength = 0;
  private sampleRate = 44100;
  public isRecording = false;

  async start(): Promise<void> {
    this.leftChannel = [];
    this.recordingLength = 0;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 44100,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    this.mediaStream = stream;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.audioContext = new AudioContextClass({ sampleRate: 44100 });
    this.sampleRate = this.audioContext.sampleRate;

    this.source = this.audioContext.createMediaStreamSource(stream);
    // Buffer size 4096 para procesamiento de audio en tiempo real
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
      if (!this.isRecording) return;
      const inputData = e.inputBuffer.getChannelData(0);
      this.leftChannel.push(new Float32Array(inputData));
      this.recordingLength += inputData.length;
    };

    this.source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);
    this.isRecording = true;
  }

  async stop(): Promise<{ blob: Blob; url: string }> {
    this.isRecording = false;

    // Desconectar y liberar hardware de micrófono
    if (this.processor) {
      this.processor.disconnect();
      this.processor.onaudioprocess = null;
    }
    if (this.source) {
      this.source.disconnect();
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
    }
    if (this.audioContext && this.audioContext.state !== "closed") {
      await this.audioContext.close().catch(() => {});
    }

    // Unir todas las muestras de audio capturadas
    const mergedSamples = new Float32Array(this.recordingLength);
    let offset = 0;
    for (const chunk of this.leftChannel) {
      mergedSamples.set(chunk, offset);
      offset += chunk.length;
    }

    // Convertir muestras Float32 (-1.0 a 1.0) a Int16 PCM (-32768 a 32767)
    const samplesInt16 = new Int16Array(mergedSamples.length);
    for (let i = 0; i < mergedSamples.length; i++) {
      const s = Math.max(-1, Math.min(1, mergedSamples[i]));
      samplesInt16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    // Codificar a MP3 estándar mono a 128 kbps (Aceptado por Meta WhatsApp)
    const mp3Encoder = new Mp3Encoder(1, this.sampleRate, 128);
    const mp3Data: Uint8Array[] = [];

    const sampleBlockSize = 1152;
    for (let i = 0; i < samplesInt16.length; i += sampleBlockSize) {
      const sampleChunk = samplesInt16.subarray(i, i + sampleBlockSize);
      const mp3buf = mp3Encoder.encodeBuffer(sampleChunk);
      if (mp3buf && mp3buf.length > 0) {
        mp3Data.push(mp3buf instanceof Uint8Array ? mp3buf : new Uint8Array(mp3buf));
      }
    }

    const mp3End = mp3Encoder.flush();
    if (mp3End && mp3End.length > 0) {
      mp3Data.push(mp3End instanceof Uint8Array ? mp3End : new Uint8Array(mp3End));
    }

    const blob = new Blob(mp3Data, { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);

    return { blob, url };
  }

  cancel(): void {
    this.isRecording = false;
    if (this.processor) {
      this.processor.disconnect();
      this.processor.onaudioprocess = null;
    }
    if (this.source) {
      this.source.disconnect();
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
    }
    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close().catch(() => {});
    }
    this.leftChannel = [];
    this.recordingLength = 0;
  }
}
