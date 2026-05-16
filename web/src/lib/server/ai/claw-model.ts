import type {
  LanguageModelV1,
  LanguageModelV1CallOptions,
  LanguageModelV1StreamPart,
} from "ai";
import { collectWebChat, streamWebChat } from "$lib/server/claw-client";

export class ClawChatModel implements LanguageModelV1 {
  readonly specificationVersion = "v1" as const;
  readonly provider = "claw";
  readonly modelId = "claw-chat";
  readonly defaultObjectGenerationMode = undefined;

  constructor(
    private uid: string,
    private role: string,
  ) {}

  async doGenerate(options: LanguageModelV1CallOptions) {
    const text = extractLastUserText(options);
    console.log("[claw-model] doGenerate uid=%s text=%s", this.uid, text);
    const fullText = await collectWebChat(this.uid, text, this.role);

    return {
      text: fullText,
      finishReason: "stop" as const,
      usage: { promptTokens: 0, completionTokens: 0 },
      rawCall: { rawPrompt: options.prompt, rawSettings: {} },
    };
  }

  async doStream(options: LanguageModelV1CallOptions) {
    const text = extractLastUserText(options);
    const uid = this.uid;
    const role = this.role;
    console.log(
      "[claw-model] doStream uid=%s text=%s role=%s",
      uid,
      text,
      role,
    );

    const stream = new ReadableStream<LanguageModelV1StreamPart>({
      async start(controller) {
        try {
          await streamWebChat(
            uid,
            text,
            (event) => {
              if (event.type === "text_delta") {
                controller.enqueue({
                  type: "text-delta",
                  textDelta: event.delta,
                });
              } else if (event.type === "file") {
                const encodedPath = event.relativePath
                  .split("/")
                  .map((s) => encodeURIComponent(s))
                  .join("/");
                const downloadUrl = `/api/files/download/${uid}/${encodedPath}`;
                const fileName =
                  event.relativePath.split("/").pop() || event.relativePath;
                const ext = fileName.split(".").pop()?.toLowerCase() || "";
                const isImage = [
                  "jpg",
                  "jpeg",
                  "png",
                  "gif",
                  "webp",
                  "svg",
                ].includes(ext);
                if (isImage) {
                  controller.enqueue({
                    type: "text-delta",
                    textDelta: `\n\n![${fileName}](${downloadUrl})\n\n`,
                  });
                } else {
                  controller.enqueue({
                    type: "text-delta",
                    textDelta: `\n\n[${fileName}](${downloadUrl})\n\n`,
                  });
                }
              }
            },
            role,
          );

          controller.enqueue({
            type: "finish",
            finishReason: "stop",
            usage: { promptTokens: 0, completionTokens: 0 },
          });
          controller.close();
        } catch (err) {
          controller.enqueue({
            type: "text-delta",
            textDelta: `[Error: ${String(err)}]`,
          });
          controller.enqueue({
            type: "finish",
            finishReason: "stop",
            usage: { promptTokens: 0, completionTokens: 0 },
          });
          controller.close();
        }
      },
    });

    return {
      stream,
      rawCall: { rawPrompt: options.prompt, rawSettings: {} },
    };
  }
}

function extractLastUserText(options: LanguageModelV1CallOptions): string {
  for (let i = options.prompt.length - 1; i >= 0; i--) {
    const part = options.prompt[i];
    if (part.role === "user" && part.content) {
      let text = "";
      const filenames: string[] = [];
      for (const c of part.content) {
        if (c.type === "text") text = c.text;
        if (c.type === "image") {
          const url =
            c.image instanceof URL
              ? c.image
              : new URL(c.image as unknown as string);
          const segments = url.pathname.split("/");
          filenames.push(decodeURIComponent(segments[segments.length - 1]));
        }
      }
      if (filenames.length > 0) {
        return `${text}\n\n[attachments at received folder: ${filenames.join(", ")}]`;
      }
      return text;
    }
  }
  return "";
}
