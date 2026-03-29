import fs from "node:fs";
import path from "node:path";

// 关于微信 ilink 相关配置
export const WECHAT_BASE_URL = "https://ilinkai.weixin.qq.com";
export const WECHAT_CDN_URL = "https://novac2c.cdn.weixin.qq.com/c2c";
const PROJECT_ROOT = process.cwd();
export const WECHAT_AUTH_FILE = path.join(
  PROJECT_ROOT,
  "..",
  ".wechat_auth.json",
);

export interface WeChatAuthInfo {
  botToken: string;
  botId: string;
  baseUrl: string;
  userId: string;
  savedAt: string;
}

const BOT_TYPE = 3;

async function apiGet(baseUrl: string, path: string) {
  const url = `${baseUrl.replace(/\/$/, "")}/${path}`;
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  return JSON.parse(text);
}

async function getQrcode(baseUrl: string) {
  const path = `ilink/bot/get_bot_qrcode?bot_type=${BOT_TYPE}`;
  return await apiGet(baseUrl, path);
}

async function queryQrcodeStatus(baseUrl: string, currentQrcode: any) {
  const path = `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(currentQrcode)}`;
  return await apiGet(baseUrl, path);
}

async function renderQR(url: string) {
  try {
    const { default: qrterm } = await import("qrcode-terminal");
    await new Promise((resolve: any) => {
      qrterm.generate(url, { small: true }, (qr: any) => {
        console.log(qr);
        resolve();
      });
    });
  } catch {
    console.log("打开下面的地址，进行扫码！");
    console.log("  二维码 URL:", url, "\n");
  }
}

async function do_login(): Promise<WeChatAuthInfo> {
  console.log("\n🔐 开始微信扫码登录...\n");

  // 1. 获取二维码
  const qrResp = await getQrcode(WECHAT_BASE_URL);
  const qrcode = qrResp.qrcode;
  const qrcodeUrl = qrResp.qrcode_img_content;

  console.log("📱 请用微信扫描以下二维码：\n");

  // 终端渲染二维码：
  await renderQR(qrcodeUrl);

  // 2. 轮询扫码状态
  console.log("⏳ 等待扫码...");
  const deadline = Date.now() + 5 * 60_000;
  let refreshCount = 0;
  let currentQrcode = qrcode;
  let currentQrcodeUrl = qrcodeUrl;

  while (Date.now() < deadline) {
    const statusResp = await queryQrcodeStatus(WECHAT_BASE_URL, currentQrcode);

    switch (statusResp.status) {
      case "wait":
        process.stdout.write(".");
        break;

      case "scaned":
        process.stdout.write("\n👀 已扫码，请在微信端确认...\n");
        break;

      case "expired": {
        refreshCount++;
        if (refreshCount > 3) {
          throw new Error("二维码多次过期，请重新运行");
        }
        console.log(`\n⏳ 二维码过期，刷新中 (${refreshCount}/3)...`);
        const newQr = await getQrcode(WECHAT_BASE_URL);
        currentQrcode = newQr.qrcode;
        currentQrcodeUrl = newQr.qrcode_img_content;
        console.log("  新二维码 URL:", currentQrcodeUrl);
        break;
      }

      case "confirmed": {
        console.log("\n✅ 登录成功！\n");
        const wxAuthInfo: WeChatAuthInfo = {
          botToken: statusResp.bot_token,
          botId: statusResp.ilink_bot_id,
          baseUrl: WECHAT_BASE_URL,
          userId: statusResp.ilink_user_id,
          savedAt: new Date().toISOString(),
        };
        fs.writeFileSync(
          WECHAT_AUTH_FILE,
          JSON.stringify(wxAuthInfo, null, 2),
          "utf-8",
        );
        fs.chmodSync(WECHAT_AUTH_FILE, 0o600);
        console.log(`  Token 已保存到 ${WECHAT_AUTH_FILE}\n`);
        return wxAuthInfo;
      }
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("登录超时");
}

export async function wechat_login(): Promise<WeChatAuthInfo> {
  if (fs.existsSync(WECHAT_AUTH_FILE)) {
    try {
      const content = fs.readFileSync(WECHAT_AUTH_FILE, "utf-8");
      const wxAuthInfo: WeChatAuthInfo = JSON.parse(content) as WeChatAuthInfo;
      return wxAuthInfo;
    } catch {}
  }
  return await do_login();
}
