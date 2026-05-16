/**
 * Media Upload Example
 *
 * This example demonstrates media file handling:
 * - Uploading different media types (images, videos, files, voice)
 * - Sending media messages to users
 * - Handling upload encryption
 *
 * Environment variables required:
 * - WEIXIN_API_URL: Base URL for the WeChat API
 * - WEIXIN_CDN_URL: Base URL for the CDN
 * - WEIXIN_TOKEN: Your authentication token
 * - TEST_RECIPIENT_ID: User ID to send media to
 */

import {
  WeixinSDK,
  TokenAuthProvider,
  UploadMediaType,
  LogLevel,
  WeixinSDKError,
  ErrorCode,
  MessageItemType,
  type WeixinMessage,
} from '../src/index.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

async function main(): Promise<void> {
  // Validate required environment variables
  const baseUrl = process.env.WEIXIN_API_URL;
  const cdnBaseUrl = process.env.WEIXIN_CDN_URL;
  const token = process.env.WEIXIN_TOKEN;
  const userId = process.env.WEIXIN_USER_ID;
  const recipientId = process.env.TEST_RECIPIENT_ID;

  if (!baseUrl || !cdnBaseUrl || !token) {
    console.error('Missing required environment variables:');
    console.error('  WEIXIN_API_URL, WEIXIN_CDN_URL, WEIXIN_TOKEN');
    process.exit(1);
  }

  if (!recipientId) {
    console.error('Missing TEST_RECIPIENT_ID - required for sending media');
    process.exit(1);
  }

  // Create and start the SDK client
  const client = new WeixinSDK({
    config: {
      baseUrl,
      cdnBaseUrl,
      timeout: 60000, // Longer timeout for uploads
      retries: 3,
      logLevel: LogLevel.DEBUG,
      enableConsoleLog: true,
    },
    auth: new TokenAuthProvider(token, userId),
  });

  // Listen for incoming messages
  client.onMessage((message: WeixinMessage) => {
    console.log('\n📩 Received message from:', message.from_user_id);

    if (message.item_list) {
      for (const item of message.item_list) {
        if (item.type === MessageItemType.IMAGE && item.image_item) {
          console.log('   [Image received]');
        } else if (item.type === MessageItemType.VIDEO && item.video_item) {
          console.log('   [Video received]');
        } else if (item.type === MessageItemType.VOICE && item.voice_item) {
          console.log('   [Voice received]');
        } else if (item.type === MessageItemType.FILE && item.file_item) {
          console.log('   [File received]:', item.file_item.file_name);
        }
      }
    }
  });

  try {
    console.log('🚀 Starting SDK...');
    await client.start();
    console.log('✅ SDK started\n');

    // Get access to the uploader directly
    const uploader = client.media.uploader;
    const sender = client.messaging.sender;

    // Example 1: Upload and send an image
    console.log('📤 Example 1: Sending an image...');
    await sendImage(sender, recipientId, './test-image.jpg');

    // Example 2: Upload and send a video
    console.log('\n📤 Example 2: Sending a video...');
    await sendVideo(sender, recipientId, './test-video.mp4');

    // Example 3: Upload and send a file
    console.log('\n📤 Example 3: Sending a file...');
    await sendFile(sender, recipientId, './test-document.pdf');

    // Example 4: Upload and send a voice message
    console.log('\n📤 Example 4: Sending a voice message...');
    await sendVoice(sender, recipientId, './test-audio.mp3');

    // Example 5: Direct upload (without sending)
    console.log('\n📤 Example 5: Direct upload (without sending)...');
    await directUpload(uploader, recipientId, './test-image.jpg');

    console.log('\n✅ All examples completed!');

    // Keep running to receive messages
    console.log('\n👂 Listening for messages (press Ctrl+C to stop)...');

    const shutdown = async (): Promise<void> => {
      console.log('\n🛑 Shutting down...');
      await client.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    await new Promise(() => {});

  } catch (error) {
    handleMediaError(error);
    await client.stop();
    process.exit(1);
  }
}

/**
 * Send an image message
 */
async function sendImage(
  sender: { sendMedia: (options: unknown) => Promise<void> },
  recipientId: string,
  filePath: string
): Promise<void> {
  try {
    // Check if file exists
    await fs.access(filePath);

    await sender.sendMedia({
      to: recipientId,
      filePath,
      mediaType: UploadMediaType.IMAGE,
      text: 'Check out this image! 🖼️',
    });

    console.log('   ✅ Image sent successfully');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log('   ⏭️  Image file not found, skipping...');
    } else {
      throw error;
    }
  }
}

/**
 * Send a video message
 */
async function sendVideo(
  sender: { sendMedia: (options: unknown) => Promise<void> },
  recipientId: string,
  filePath: string
): Promise<void> {
  try {
    await fs.access(filePath);

    await sender.sendMedia({
      to: recipientId,
      filePath,
      mediaType: UploadMediaType.VIDEO,
      text: 'Here is a video! 🎬',
    });

    console.log('   ✅ Video sent successfully');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log('   ⏭️  Video file not found, skipping...');
    } else {
      throw error;
    }
  }
}

/**
 * Send a file message
 */
async function sendFile(
  sender: { sendMedia: (options: unknown) => Promise<void> },
  recipientId: string,
  filePath: string
): Promise<void> {
  try {
    await fs.access(filePath);

    await sender.sendMedia({
      to: recipientId,
      filePath,
      mediaType: UploadMediaType.FILE,
      text: 'Here is a document! 📄',
    });

    console.log('   ✅ File sent successfully');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log('   ⏭️  File not found, skipping...');
    } else {
      throw error;
    }
  }
}

/**
 * Send a voice message
 */
async function sendVoice(
  sender: { sendMedia: (options: unknown) => Promise<void> },
  recipientId: string,
  filePath: string
): Promise<void> {
  try {
    await fs.access(filePath);

    await sender.sendMedia({
      to: recipientId,
      filePath,
      mediaType: UploadMediaType.VOICE,
    });

    console.log('   ✅ Voice message sent successfully');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log('   ⏭️  Voice file not found, skipping...');
    } else {
      throw error;
    }
  }
}

/**
 * Direct upload example - upload without sending
 * This gets you the file ID which you can use later
 */
async function directUpload(
  uploader: { upload: (options: unknown) => Promise<{ fileId: string; downloadParam: string; aesKey: string }> },
  recipientId: string,
  filePath: string
): Promise<void> {
  try {
    await fs.access(filePath);

    // Get file info for logging
    const stats = await fs.stat(filePath);
    const fileName = path.basename(filePath);
    const fileSizeKB = Math.round(stats.size / 1024);

    console.log(`   Uploading: ${fileName} (${fileSizeKB} KB)`);

    // Upload the file
    const result = await uploader.upload({
      filePath,
      mediaType: UploadMediaType.IMAGE,
      toUserId: recipientId,
    });

    console.log('   ✅ Upload complete!');
    console.log(`   File ID: ${result.fileId}`);
    console.log(`   Download Param: ${result.downloadParam}`);
    console.log(`   AES Key: ${result.aesKey}`);

    // You can now use this fileId in a custom message
    // For example, to send the same image multiple times
    // without re-uploading
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log('   ⏭️  File not found, skipping...');
    } else {
      throw error;
    }
  }
}

/**
 * Handle media-related errors
 */
function handleMediaError(error: unknown): void {
  if (error instanceof WeixinSDKError) {
    console.error('\n❌ SDK Error:', error.message);
    console.error('   Code:', ErrorCode[error.code]);

    switch (error.code) {
      case ErrorCode.MEDIA_UPLOAD_FAILED:
        console.log('\n💡 Media upload failed. Possible causes:');
        console.log('   - File too large');
        console.log('   - Invalid file format');
        console.log('   - Network issue during upload');
        console.log('   - CDN server error');
        break;
      case ErrorCode.NETWORK_ERROR:
        console.log('\n💡 Network error occurred during upload.');
        console.log('   Check your internet connection and try again.');
        break;
      case ErrorCode.AUTH_REQUIRED:
      case ErrorCode.TOKEN_EXPIRED:
        console.log('\n💡 Authentication required or token expired.');
        console.log('   Please re-authenticate and try again.');
        break;
    }

    if (error.details) {
      console.log('\n   Error details:', error.details);
    }
  } else if (error instanceof Error) {
    console.error('\n❌ Error:', error.message);

    if (error.message.includes('ENOENT')) {
      console.log('\n💡 File not found. Please check the file path.');
    }
  } else {
    console.error('\n❌ Unexpected error:', error);
  }
}

// Run the example
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
