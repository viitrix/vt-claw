/**
 * Basic Usage Example
 *
 * This example demonstrates the fundamental usage of the Weixin SDK:
 * - Setting up the SDK with token-based authentication
 * - Sending text messages
 * - Receiving incoming messages
 * - Proper shutdown handling
 *
 * Environment variables required:
 * - WEIXIN_API_URL: Base URL for the WeChat API
 * - WEIXIN_CDN_URL: Base URL for the CDN (media uploads)
 * - WEIXIN_TOKEN: Your authentication token
 * - WEIXIN_USER_ID: Your user ID (optional)
 */

import {
  WeixinSDK,
  TokenAuthProvider,
  LogLevel,
  WeixinSDKError,
  ErrorCode,
  MessageType,
  MessageItemType,
  type AuthResult,
  type WeixinMessage,
} from '../src/index.js';

async function main(): Promise<void> {
  // Validate required environment variables
  const baseUrl = process.env.WEIXIN_API_URL;
  const cdnBaseUrl = process.env.WEIXIN_CDN_URL;
  const token = process.env.WEIXIN_TOKEN;
  const userId = process.env.WEIXIN_USER_ID;

  if (!baseUrl || !cdnBaseUrl || !token) {
    console.error('Missing required environment variables:');
    console.error('  WEIXIN_API_URL, WEIXIN_CDN_URL, WEIXIN_TOKEN');
    process.exit(1);
  }

  // Create the authentication provider
  // TokenAuthProvider is the simplest auth method - use it when you
  // already have a valid token from a previous authentication
  const auth = new TokenAuthProvider(token, userId);

  // Create the SDK client with configuration
  const client = new WeixinSDK({
    config: {
      baseUrl,
      cdnBaseUrl,
      timeout: 30000, // 30 second timeout
      retries: 3, // Retry failed requests up to 3 times
      pollingInterval: 5000, // Poll for new messages every 5 seconds
      logLevel: LogLevel.DEBUG, // Verbose logging for demo
      enableConsoleLog: true,
    },
    auth,
  });

  // Register event handlers for SDK-level events
  client.on('auth_success', (result: AuthResult) => {
    console.log('✅ Authentication successful');
    console.log('   User ID:', result.userId);
    console.log('   Token expires at:', new Date(result.expiresAt).toISOString());
  });

  client.on('auth_failed', ({ error }) => {
    console.error('❌ Authentication failed:', error.message);
  });

  client.on('error', (error) => {
    console.error('❌ SDK error:', error);
  });

  // Register message handler for incoming messages
  // This will be called for every message received via polling
  client.onMessage((message: WeixinMessage) => {
    console.log('\n📩 New message received:');
    console.log('   From:', message.from_user_id);
    console.log('   To:', message.to_user_id);
    console.log('   Message ID:', message.message_id);
    console.log('   Type:', MessageType[message.message_type ?? 0] ?? 'UNKNOWN');

    // Process message items (text, images, files, etc.)
    if (message.item_list) {
      for (const item of message.item_list) {
        switch (item.type) {
          case MessageItemType.TEXT:
            console.log('   Text:', item.text_item?.text);
            break;
          case MessageItemType.IMAGE:
            console.log('   [Image message]');
            break;
          case MessageItemType.VIDEO:
            console.log('   [Video message]');
            break;
          case MessageItemType.VOICE:
            console.log('   [Voice message]');
            break;
          case MessageItemType.FILE:
            console.log('   File:', item.file_item?.file_name);
            break;
        }
      }
    }
  });

  try {
    // Start the SDK
    // This will:
    // 1. Authenticate using the provided auth provider
    // 2. Start polling for incoming messages
    console.log('🚀 Starting SDK...');
    await client.start();
    console.log('✅ SDK started successfully\n');

    // Send a text message
    // Replace with an actual recipient user ID
    const recipientUserId = process.env.TEST_RECIPIENT_ID;

    if (recipientUserId) {
      console.log('📤 Sending test message...');
      await client.sendText(recipientUserId, 'Hello from Weixin SDK! 👋');
      console.log('✅ Message sent successfully\n');
    } else {
      console.log('ℹ️  Set TEST_RECIPIENT_ID to send a test message\n');
    }

    // Alternative: Use the messaging.sender directly for more control
    // await client.messaging.sender.sendText({
    //   to: recipientUserId,
    //   text: 'Hello!',
    //   contextToken: undefined, // Optional: use for reply context
    // });

    // Keep the SDK running
    // In a real application, you might have other logic here
    console.log('👂 Listening for messages (press Ctrl+C to stop)...\n');

    // Handle graceful shutdown
    const shutdown = async (): Promise<void> => {
      console.log('\n🛑 Shutting down...');
      await client.stop();
      console.log('✅ SDK stopped');
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // In this demo, we'll just wait indefinitely
    // In a real app, your server would keep running
    await new Promise(() => {}); // Never resolves

  } catch (error) {
    // Handle different error types
    if (error instanceof WeixinSDKError) {
      console.error('❌ SDK Error:', error.message);
      console.error('   Code:', ErrorCode[error.code]);
      console.error('   Details:', error.details);

      // Handle specific error codes
      switch (error.code) {
        case ErrorCode.AUTH_REQUIRED:
        case ErrorCode.AUTH_FAILED:
        case ErrorCode.TOKEN_EXPIRED:
          console.log('💡 Tip: Check your authentication credentials');
          break;
        case ErrorCode.NETWORK_ERROR:
          console.log('💡 Tip: Check your network connection');
          break;
        case ErrorCode.RATE_LIMIT:
          console.log('💡 Tip: You are being rate limited, please wait');
          break;
      }
    } else {
      console.error('❌ Unexpected error:', error);
    }

    // Ensure cleanup on error
    await client.stop();
    process.exit(1);
  }
}

// Run the example
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
