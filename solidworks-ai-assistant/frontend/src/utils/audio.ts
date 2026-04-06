/**
 * Audio recording utilities using MediaDevices API.
 * Returns a Blob in webm/opus format for Whisper transcription.
 */

export interface AudioRecorder {
  start: () => void;
  stop: () => Promise<Blob>;
  getAnalyser: () => AnalyserNode | null;
  isRecording: () => boolean;
}

export function createAudioRecorder(): Promise<AudioRecorder> {
  return new Promise((resolve, reject) => {
    navigator.mediaDevices
      .getUserMedia({ audio: true, video: false })
      .then((stream) => {
        const audioCtx = new AudioContext();
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);

        let mediaRecorder: MediaRecorder | null = null;
        let chunks: Blob[] = [];
        let recording = false;

        resolve({
          start() {
            chunks = [];
            const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
              ? "audio/webm;codecs=opus"
              : "audio/webm";
            mediaRecorder = new MediaRecorder(stream, { mimeType });
            mediaRecorder.ondataavailable = (e) => {
              if (e.data.size > 0) chunks.push(e.data);
            };
            mediaRecorder.start(100); // collect every 100ms
            recording = true;
          },

          stop() {
            return new Promise<Blob>((res) => {
              if (!mediaRecorder) {
                res(new Blob([], { type: "audio/webm" }));
                return;
              }
              mediaRecorder.onstop = () => {
                recording = false;
                const blob = new Blob(chunks, { type: mediaRecorder!.mimeType });
                res(blob);
              };
              mediaRecorder.stop();
            });
          },

          getAnalyser() {
            return analyser;
          },

          isRecording() {
            return recording;
          },
        });
      })
      .catch(reject);
  });
}

export function getWaveformData(analyser: AnalyserNode): Uint8Array {
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteTimeDomainData(data);
  return data;
}
