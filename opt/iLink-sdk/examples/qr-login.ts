/**
 * QR Code Login Example
 *
 * This example demonstrates the QR code authentication flow:
 * - Generating a QR code for the user to scan
 * - Polling for authentication status
 * - Handling successful authentication
 * - Using the authenticated session
 *
 * Environment variables required:
 * - WEIXIN_API_URL: Base URL for the WeChat API
 * - WEIXIN_CDN_URL: Base URL for the CDN
 *
 * The QR code URL will be printed to console. Scan it with your
 * WeChat app to complete authentication.
 */

import {
  WeixinSDK,
  QrAuthProvider,
  ApiClient,
  LogLevel,
  WeixinSDKError,
  ErrorCode,
  type AuthResult,
} from '../src/index.js';

async function main(): Promise<void> {
  // Validate required environment variables
  const baseUrl = process.env.WEIXIN_API_URL;
  const cdnBaseUrl = process.env.WEIXIN_CDN_URL;

  if (!baseUrl || !cdnBaseUrl) {
    console.error('Missing required environment variables:');
    console.error('  WEIXIN_API_URL, WEIXIN_CDN_URL');
    process.exit(1);
  }

  const config = {
    baseUrl,
    cdnBaseUrl,
    timeout: 30000,
    retries: 3,
    logLevel: LogLevel.INFO,
    enableConsoleLog: true,
  };

  // Create an API client for the QR auth provider
  // The QrAuthProvider needs its own API client to make auth requests
  const apiClient = new ApiClient(config);

  // Create the QR authentication provider
  // Optionally specify a default bot type if your application uses multiple bot types
  const auth = new QrAuthProvider(apiClient, process.env.DEFAULT_BOT_TYPE);

  // Register event handlers for the QR auth flow
  // These events track the authentication progress

  // 1. QR code has been generated
  auth.on('qr_generated', ({ url, sessionKey }) => {
    console.log('\n📱 QR Code Generated!');
    console.log('   Session Key:', sessionKey);
    console.log('\n   Scan this URL with your WeChat app:');
    console.log(`   ${url}\n`);
    console.log('⏳ Waiting for scan...');
  });

  // 2. User has scanned the QR code
  auth.on('qr_scanned', ({ status }) => {
    console.log('✅ QR Code scanned! Status:', status);
    console.log('⏳ Waiting for confirmation on your phone...');
  });

  // 3. Authentication successful
  auth.on('auth_success', (result: AuthResult) => {
    console.log('\n🎉 Authentication Successful!');
    console.log('   User ID:', result.userId);
    console.log('   Account ID:', result.accountId);
    console.log('   Base URL:', result.baseUrl);
    console.log('   Token expires at:', new Date(result.expiresAt).toISOString());

    // In a real application, you would save this token securely
    // for future use to avoid re-authentication
    console.log('\n💾 Save this token for future use:');
    console.log(`   WEIXIN_TOKEN=${result.token}`);
    console.log(`   WEIXIN_USER_ID=${result.userId}`);
  });

  // 4. Authentication failed
  auth.on('auth_failed', ({ error }) => {
    console.error('\n❌ Authentication Failed:', error.message);
  });

  try {
    console.log('🔐 Starting QR Code Authentication...\n');

    // Initiate the authentication flow
    // This will:
    // 1. Request a QR code from the server
    // 2. Emit 'qr_generated' event with the QR code URL
    // 3. Poll the server for authentication status
    // 4. Emit 'qr_scanned' when user scans the code
    // 5. Emit 'auth_success' or 'auth_failed' based on result
    const authResult = await auth.authenticate();

    console.log('\n✅ Authentication complete!');

    // Now you can create a full SDK client with the authenticated session
    const client = new WeixinSDK({
      config,
      auth, // Reuse the authenticated provider
    });

    // Start the SDK for messaging
    console.log('\n🚀 Starting SDK with authenticated session...');
    await client.start();

    // Listen for messages
    client.onMessage((message) => {
      console.log('\n📩 Message from:', message.from_user_id);
    });

    console.log('✅ SDK is now running and listening for messages.');
    console.log('   Press Ctrl+C to stop.\n');

    // Handle graceful shutdown
    const shutdown = async (): Promise<void> => {
      console.log('\n🛑 Shutting down...');
      await client.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Keep running
    await new Promise(() => {});

  } catch (error) {
    if (error instanceof WeixinSDKError) {
      console.error('\n❌ SDK Error:', error.message);
      console.error('   Code:', ErrorCode[error.code]);

      if (error.code === ErrorCode.TIMEOUT) {
        console.log('\n💡 The QR code may have expired. Please try again.');
      }
    } else if (error instanceof Error) {
      if (error.message.includes('timeout')) {
        console.error('\n❌ Authentication timed out after 8 minutes.');
        console.log('💡 Please run the script again and scan the QR code more quickly.');
      } else if (error.message.includes('cancelled')) {
        console.error('\n❌ Authentication was cancelled.');
      } else if (error.message.includes('expired')) {
        console.error('\n❌ The QR code has expired.');
        console.log('💡 Please run the script again to get a new QR code.');
      } else {
        console.error('\n❌ Error:', error.message);
      }
    } else {
      console.error('\n❌ Unexpected error:', error);
    }

    process.exit(1);
  }
}

// Run the example
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
