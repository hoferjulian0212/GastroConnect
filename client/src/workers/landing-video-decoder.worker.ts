/// <reference lib="webworker" />

import {
  ALL_FORMATS,
  CanvasSink,
  Input,
  UrlSource,
  type WrappedCanvas,
} from "mediabunny";

type StartMessage = {
  type: "start";
  src: string;
  width: number;
  height: number;
};

type StopMessage = {
  type: "stop";
};

type WorkerMessage = StartMessage | StopMessage;

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

let generation = 0;
let input: Input | null = null;

const nextTick = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 8);
  });

const stop = () => {
  generation += 1;
  input?.dispose();
  input = null;
};

async function run(message: StartMessage, runGeneration: number) {
  try {
    if (typeof VideoDecoder === "undefined") {
      throw new Error("WebCodecs is not supported in this browser");
    }

    const mediaInput = new Input({
      formats: ALL_FORMATS,
      source: new UrlSource(message.src, {
        maxCacheSize: 16 * 1024 * 1024,
        parallelism: 2,
      }),
    });
    input = mediaInput;
    workerScope.postMessage({ type: "state", state: "opening" });

    const videoTrack = await mediaInput.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error("No video track was found");

    const [startTimestamp, duration] = await Promise.all([
      mediaInput.getFirstTimestamp([videoTrack]),
      mediaInput.computeDuration([videoTrack]),
    ]);
    if (runGeneration !== generation) return;

    const sink = new CanvasSink(videoTrack, {
      width: message.width,
      height: message.height,
      fit: "cover",
      poolSize: 0,
      alpha: false,
    });
    workerScope.postMessage({
      type: "state",
      state: "decoding",
      duration,
    });

    const maxBufferedFrames = 36;
    const startupFrames = 12;

    type LoopBuffer = {
      frames: WrappedCanvas[];
      done: boolean;
      error: unknown;
      producer: Promise<void>;
    };

    const createLoopBuffer = () => {
      const buffer: LoopBuffer = {
        frames: [],
        done: false,
        error: null,
        producer: Promise.resolve(),
      };

      buffer.producer = (async () => {
        try {
          for await (const frame of sink.canvases(
            startTimestamp,
            duration,
          )) {
            while (
              runGeneration === generation &&
              buffer.frames.length >= maxBufferedFrames
            ) {
              await nextTick();
            }
            if (runGeneration !== generation) return;
            buffer.frames.push(frame);
          }
        } catch (error) {
          if (runGeneration === generation) buffer.error = error;
        } finally {
          buffer.done = true;
        }
      })();

      return buffer;
    };

    let currentBuffer = createLoopBuffer();

    while (runGeneration === generation) {
      while (
        runGeneration === generation &&
        currentBuffer.frames.length < startupFrames &&
        !currentBuffer.done
      ) {
        await nextTick();
      }
      if (runGeneration !== generation) return;
      if (currentBuffer.error) throw currentBuffer.error;
      if (currentBuffer.frames.length === 0) {
        throw new Error("The video decoder produced no frames");
      }

      const loopStartedAt =
        performance.now() -
        (currentBuffer.frames[0].timestamp - startTimestamp) * 1000;
      let nextBuffer: LoopBuffer | null = null;

      while (runGeneration === generation) {
        const mediaTime =
          startTimestamp + (performance.now() - loopStartedAt) / 1000;
        let frameToPresent: WrappedCanvas | null = null;

        while (
          currentBuffer.frames.length > 0 &&
          currentBuffer.frames[0].timestamp <= mediaTime + 0.001
        ) {
          frameToPresent = currentBuffer.frames.shift() ?? null;
        }

        if (frameToPresent) {
          const frameCanvas = frameToPresent.canvas;
          const bitmap =
            "transferToImageBitmap" in frameCanvas
              ? (frameCanvas as OffscreenCanvas).transferToImageBitmap()
              : await createImageBitmap(frameCanvas);

          workerScope.postMessage(
            {
              type: "frame",
              bitmap,
              timestamp: frameToPresent.timestamp,
            },
            [bitmap],
          );
        }

        if (currentBuffer.error) throw currentBuffer.error;

        // Once the current decoder reaches EOF, use the buffered tail as time
        // to prepare the next loop before the final frame is presented.
        if (currentBuffer.done && !nextBuffer) {
          nextBuffer = createLoopBuffer();
        }

        if (
          currentBuffer.done &&
          currentBuffer.frames.length === 0
        ) {
          break;
        }
        await nextTick();
      }

      await currentBuffer.producer;
      if (currentBuffer.error) throw currentBuffer.error;

      if (!nextBuffer) nextBuffer = createLoopBuffer();

      const loopEndsAt =
        loopStartedAt + (duration - startTimestamp) * 1000;
      while (
        runGeneration === generation &&
        performance.now() < loopEndsAt
      ) {
        await nextTick();
      }

      currentBuffer = nextBuffer;
    }
  } catch (error) {
    if (runGeneration !== generation) return;
    workerScope.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

workerScope.addEventListener("message", (event: MessageEvent<WorkerMessage>) => {
  if (event.data.type === "stop") {
    stop();
    return;
  }

  stop();
  const runGeneration = generation;
  void run(event.data, runGeneration);
});