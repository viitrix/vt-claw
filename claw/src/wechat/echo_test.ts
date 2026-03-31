import fs from "node:fs";
import crypto from "node:crypto";
import {
  wechat_login,
  WeChatAuthInfo,
  WECHAT_AUTH_FILE,
  WECHAT_BASE_URL,
  WECHAT_CDN_URL,
} from "./login.js";
import {
  WeixinSDK,
  TokenAuthProvider,
  UploadMediaType,
  WeixinMessage,
  MessageItemType,
} from "@xmccln/wechat-ilink-sdk";

function extractText(message: WeixinMessage): string {
  for (const item of message.item_list ?? []) {
    if (item.type === MessageItemType.TEXT && item.text_item?.text) {
      return item.text_item.text;
    }
    if (item.type === MessageItemType.VOICE && item.voice_item?.text) {
      return item.voice_item.text;
    }
  }

  return "";
}

function hasImage(message: WeixinMessage): boolean {
  return Boolean(
    message.item_list?.some(
      (item) =>
        item.type === MessageItemType.IMAGE &&
        item.image_item?.media?.encrypt_query_param,
    ),
  );
}

function hasVideo(message: WeixinMessage): boolean {
  return Boolean(
    message.item_list?.some(
      (item) =>
        item.type === MessageItemType.VIDEO &&
        item.video_item?.media?.encrypt_query_param,
    ),
  );
}

function hasFile(message: WeixinMessage): boolean {
  return Boolean(
    message.item_list?.some(
      (item) =>
        item.type === MessageItemType.FILE &&
        item.file_item?.media?.encrypt_query_param,
    ),
  );
}

function hasVoice(message: WeixinMessage): boolean {
  return Boolean(
    message.item_list?.some(
      (item) =>
        item.type === MessageItemType.VOICE &&
        item.voice_item?.media?.encrypt_query_param,
    ),
  );
}

function getFirstFileName(message: WeixinMessage): string | undefined {
  return message.item_list?.find((item) => item.type === MessageItemType.FILE)
    ?.file_item?.file_name;
}

async function test() {
  const auth = await wechat_login();

  const bot = new WeixinSDK({
    config: {
      baseUrl: WECHAT_BASE_URL,
      cdnBaseUrl: WECHAT_CDN_URL,
      timeout: 35000,
    },
    auth: new TokenAuthProvider(auth.botToken, auth.userId),
  });
  
  bot.onMessage((msg: WeixinMessage) => {
    const fromID: string = msg.from_user_id || "";
    const token = msg.context_token;
    if (extractText(msg)) {
      bot.sendText(fromID, "收到！", token);
      return;
    }

    if (hasImage(msg)) {
      void (async () => {
        const downloaded = await bot.media.downloader.downloadFirstMedia(msg);
        if (!downloaded || downloaded.type !== "image") {
          return;
        }
        try {
          await bot.messaging.sender.sendMedia({
            to: fromID,
            filePath: downloaded.path,
            mediaType: UploadMediaType.IMAGE,
            contextToken: token,
          });
        } finally {
          await downloaded.cleanup();
        }
      })().catch((error) => {
        console.error("[Echo] Failed to reply image:", error);
      });
    }
  });

  bot.on("error", (error) => {
    console.error("❌ SDK error:", error);
  });

  await bot.start();
}

test();
