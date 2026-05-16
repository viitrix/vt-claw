import { describe, it, expect } from 'vitest';
import {
  BaseInfo,
  UploadMediaType,
  GetUploadUrlReq,
  GetUploadUrlResp,
  MessageType,
  MessageItemType,
  MessageState,
  TextItem,
  ImageItem,
  VoiceItem,
  FileItem,
  VideoItem,
  CDNMedia,
  RefMessage,
  MessageItem,
  WeixinMessage,
  GetUpdatesReq,
  GetUpdatesResp,
  SendMessageReq,
  SendMessageResp,
  TypingStatus,
  SendTypingReq,
  SendTypingResp,
  GetConfigResp
} from '../../src/api/types.js';

describe('API Types', () => {
  describe('BaseInfo', () => {
    it('should define BaseInfo with optional channel_version', () => {
      const info: BaseInfo = { channel_version: '1.0.0' };
      expect(info.channel_version).toBe('1.0.0');
    });

    it('should allow empty BaseInfo', () => {
      const info: BaseInfo = {};
      expect(info.channel_version).toBeUndefined();
    });
  });

  describe('UploadMediaType', () => {
    it('should have correct enum values', () => {
      expect(UploadMediaType.IMAGE).toBe(1);
      expect(UploadMediaType.VIDEO).toBe(2);
      expect(UploadMediaType.FILE).toBe(3);
      expect(UploadMediaType.VOICE).toBe(4);
    });
  });

  describe('GetUploadUrlReq', () => {
    it('should define GetUploadUrlReq structure', () => {
      const req: GetUploadUrlReq = {
        filekey: 'test-key',
        media_type: UploadMediaType.IMAGE,
        to_user_id: 'user-123',
        rawsize: 1024,
        rawfilemd5: 'abc123',
        filesize: 1040,
        thumb_rawsize: 512,
        thumb_rawfilemd5: 'def456',
        thumb_filesize: 528,
        no_need_thumb: false,
        aeskey: 'base64key'
      };
      expect(req.filekey).toBe('test-key');
      expect(req.media_type).toBe(1);
      expect(req.to_user_id).toBe('user-123');
      expect(req.rawsize).toBe(1024);
      expect(req.rawfilemd5).toBe('abc123');
      expect(req.filesize).toBe(1040);
      expect(req.thumb_rawsize).toBe(512);
      expect(req.thumb_rawfilemd5).toBe('def456');
      expect(req.thumb_filesize).toBe(528);
      expect(req.no_need_thumb).toBe(false);
      expect(req.aeskey).toBe('base64key');
    });
  });

  describe('GetUploadUrlResp', () => {
    it('should define GetUploadUrlResp structure', () => {
      const resp: GetUploadUrlResp = {
        upload_param: 'param1',
        thumb_upload_param: 'param2'
      };
      expect(resp.upload_param).toBe('param1');
      expect(resp.thumb_upload_param).toBe('param2');
    });
  });

  describe('MessageType', () => {
    it('should have correct enum values', () => {
      expect(MessageType.NONE).toBe(0);
      expect(MessageType.USER).toBe(1);
      expect(MessageType.BOT).toBe(2);
    });
  });

  describe('MessageItemType', () => {
    it('should have correct enum values', () => {
      expect(MessageItemType.NONE).toBe(0);
      expect(MessageItemType.TEXT).toBe(1);
      expect(MessageItemType.IMAGE).toBe(2);
      expect(MessageItemType.VOICE).toBe(3);
      expect(MessageItemType.FILE).toBe(4);
      expect(MessageItemType.VIDEO).toBe(5);
    });
  });

  describe('MessageState', () => {
    it('should have correct enum values', () => {
      expect(MessageState.NEW).toBe(0);
      expect(MessageState.GENERATING).toBe(1);
      expect(MessageState.FINISH).toBe(2);
    });
  });

  describe('TextItem', () => {
    it('should define TextItem structure', () => {
      const item: TextItem = { text: 'Hello' };
      expect(item.text).toBe('Hello');
    });
  });

  describe('CDNMedia', () => {
    it('should define CDNMedia structure', () => {
      const media: CDNMedia = {
        encrypt_query_param: 'query',
        aes_key: 'base64key',
        encrypt_type: 1
      };
      expect(media.encrypt_query_param).toBe('query');
      expect(media.aes_key).toBe('base64key');
      expect(media.encrypt_type).toBe(1);
    });
  });

  describe('ImageItem', () => {
    it('should define ImageItem structure', () => {
      const media: CDNMedia = { aes_key: 'key' };
      const thumbMedia: CDNMedia = { aes_key: 'thumbkey' };
      const item: ImageItem = {
        media,
        thumb_media: thumbMedia,
        aeskey: 'hexkey',
        url: 'https://cdn.example.com/image',
        mid_size: 1024,
        thumb_size: 256,
        thumb_height: 100,
        thumb_width: 100,
        hd_size: 2048
      };
      expect(item.media).toEqual(media);
      expect(item.thumb_media).toEqual(thumbMedia);
      expect(item.aeskey).toBe('hexkey');
      expect(item.url).toBe('https://cdn.example.com/image');
      expect(item.mid_size).toBe(1024);
      expect(item.thumb_size).toBe(256);
      expect(item.thumb_height).toBe(100);
      expect(item.thumb_width).toBe(100);
      expect(item.hd_size).toBe(2048);
    });
  });

  describe('VoiceItem', () => {
    it('should define VoiceItem structure', () => {
      const media: CDNMedia = { aes_key: 'key' };
      const item: VoiceItem = {
        media,
        encode_type: 6,
        bits_per_sample: 16,
        sample_rate: 16000,
        playtime: 5000,
        text: 'Transcribed text'
      };
      expect(item.media).toEqual(media);
      expect(item.encode_type).toBe(6);
      expect(item.bits_per_sample).toBe(16);
      expect(item.sample_rate).toBe(16000);
      expect(item.playtime).toBe(5000);
      expect(item.text).toBe('Transcribed text');
    });
  });

  describe('FileItem', () => {
    it('should define FileItem structure', () => {
      const media: CDNMedia = { aes_key: 'key' };
      const item: FileItem = {
        media,
        file_name: 'document.pdf',
        md5: 'filemd5',
        len: '1024'
      };
      expect(item.media).toEqual(media);
      expect(item.file_name).toBe('document.pdf');
      expect(item.md5).toBe('filemd5');
      expect(item.len).toBe('1024');
    });
  });

  describe('VideoItem', () => {
    it('should define VideoItem structure', () => {
      const media: CDNMedia = { aes_key: 'key' };
      const thumbMedia: CDNMedia = { aes_key: 'thumbkey' };
      const item: VideoItem = {
        media,
        video_size: 10240,
        play_length: 30,
        video_md5: 'videomd5',
        thumb_media: thumbMedia,
        thumb_size: 256,
        thumb_height: 100,
        thumb_width: 200
      };
      expect(item.media).toEqual(media);
      expect(item.video_size).toBe(10240);
      expect(item.play_length).toBe(30);
      expect(item.video_md5).toBe('videomd5');
      expect(item.thumb_media).toEqual(thumbMedia);
      expect(item.thumb_size).toBe(256);
      expect(item.thumb_height).toBe(100);
      expect(item.thumb_width).toBe(200);
    });
  });

  describe('RefMessage', () => {
    it('should define RefMessage structure', () => {
      const msgItem: MessageItem = { type: 1, text_item: { text: 'ref' } };
      const ref: RefMessage = {
        message_item: msgItem,
        title: 'Reference title'
      };
      expect(ref.message_item).toEqual(msgItem);
      expect(ref.title).toBe('Reference title');
    });
  });

  describe('MessageItem', () => {
    it('should define MessageItem structure', () => {
      const item: MessageItem = {
        type: MessageItemType.TEXT,
        create_time_ms: 1700000000000,
        update_time_ms: 1700000001000,
        is_completed: true,
        msg_id: 'msg-123',
        ref_msg: { title: 'ref' },
        text_item: { text: 'Hello' },
        image_item: { url: 'https://example.com' },
        voice_item: { playtime: 1000 },
        file_item: { file_name: 'test.pdf' },
        video_item: { play_length: 10 }
      };
      expect(item.type).toBe(1);
      expect(item.create_time_ms).toBe(1700000000000);
      expect(item.update_time_ms).toBe(1700000001000);
      expect(item.is_completed).toBe(true);
      expect(item.msg_id).toBe('msg-123');
      expect(item.ref_msg?.title).toBe('ref');
      expect(item.text_item?.text).toBe('Hello');
    });
  });

  describe('WeixinMessage', () => {
    it('should define WeixinMessage with all fields', () => {
      const msg: WeixinMessage = {
        seq: 1,
        message_id: 12345,
        from_user_id: 'user-1',
        to_user_id: 'user-2',
        client_id: 'client-1',
        create_time_ms: 1700000000000,
        update_time_ms: 1700000001000,
        delete_time_ms: 0,
        session_id: 'session-1',
        group_id: 'group-1',
        message_type: MessageType.USER,
        message_state: MessageState.FINISH,
        item_list: [{ type: 1 }],
        context_token: 'token123'
      };
      expect(msg.seq).toBe(1);
      expect(msg.message_id).toBe(12345);
      expect(msg.from_user_id).toBe('user-1');
      expect(msg.to_user_id).toBe('user-2');
      expect(msg.client_id).toBe('client-1');
      expect(msg.create_time_ms).toBe(1700000000000);
      expect(msg.update_time_ms).toBe(1700000001000);
      expect(msg.delete_time_ms).toBe(0);
      expect(msg.session_id).toBe('session-1');
      expect(msg.group_id).toBe('group-1');
      expect(msg.message_type).toBe(1);
      expect(msg.message_state).toBe(2);
      expect(msg.item_list).toHaveLength(1);
      expect(msg.context_token).toBe('token123');
    });

    it('should use snake_case field names', () => {
      const msg: WeixinMessage = {
        from_user_id: 'user-1',
        to_user_id: 'user-2',
        message_id: 1,
        message_type: 1,
        message_state: 0,
        create_time_ms: 0,
        update_time_ms: 0,
        delete_time_ms: 0,
        session_id: 's1',
        group_id: 'g1',
        client_id: 'c1'
      };
      expect('from_user_id' in msg).toBe(true);
      expect('to_user_id' in msg).toBe(true);
      expect('message_id' in msg).toBe(true);
      expect('message_type' in msg).toBe(true);
      expect('message_state' in msg).toBe(true);
      expect('create_time_ms' in msg).toBe(true);
    });
  });

  describe('GetUpdatesReq', () => {
    it('should define GetUpdatesReq structure', () => {
      const req: GetUpdatesReq = {
        sync_buf: 'deprecated',
        get_updates_buf: 'buffer123'
      };
      expect(req.sync_buf).toBe('deprecated');
      expect(req.get_updates_buf).toBe('buffer123');
    });
  });

  describe('GetUpdatesResp', () => {
    it('should define GetUpdatesResp structure', () => {
      const resp: GetUpdatesResp = {
        ret: 0,
        errcode: -14,
        errmsg: 'session timeout',
        msgs: [{ from_user_id: 'user-1' }],
        sync_buf: 'deprecated',
        get_updates_buf: 'buffer456',
        longpolling_timeout_ms: 25000
      };
      expect(resp.ret).toBe(0);
      expect(resp.errcode).toBe(-14);
      expect(resp.errmsg).toBe('session timeout');
      expect(resp.msgs).toHaveLength(1);
      expect(resp.sync_buf).toBe('deprecated');
      expect(resp.get_updates_buf).toBe('buffer456');
      expect(resp.longpolling_timeout_ms).toBe(25000);
    });
  });

  describe('SendMessageReq', () => {
    it('should define SendMessageReq structure', () => {
      const req: SendMessageReq = {
        msg: {
          from_user_id: 'bot-1',
          to_user_id: 'user-1',
          message_type: MessageType.BOT
        }
      };
      expect(req.msg?.from_user_id).toBe('bot-1');
      expect(req.msg?.to_user_id).toBe('user-1');
      expect(req.msg?.message_type).toBe(2);
    });
  });

  describe('SendMessageResp', () => {
    it('should define empty SendMessageResp', () => {
      const resp: SendMessageResp = {};
      expect(resp).toBeDefined();
    });
  });

  describe('TypingStatus', () => {
    it('should have correct enum values', () => {
      expect(TypingStatus.TYPING).toBe(1);
      expect(TypingStatus.CANCEL).toBe(2);
    });
  });

  describe('SendTypingReq', () => {
    it('should define SendTypingReq structure', () => {
      const req: SendTypingReq = {
        ilink_user_id: 'user-123',
        typing_ticket: 'ticket456',
        status: TypingStatus.TYPING
      };
      expect(req.ilink_user_id).toBe('user-123');
      expect(req.typing_ticket).toBe('ticket456');
      expect(req.status).toBe(1);
    });
  });

  describe('SendTypingResp', () => {
    it('should define SendTypingResp structure', () => {
      const resp: SendTypingResp = {
        ret: 0,
        errmsg: 'success'
      };
      expect(resp.ret).toBe(0);
      expect(resp.errmsg).toBe('success');
    });
  });

  describe('GetConfigResp', () => {
    it('should define GetConfigResp structure', () => {
      const resp: GetConfigResp = {
        ret: 0,
        errmsg: 'success',
        typing_ticket: 'base64ticket'
      };
      expect(resp.ret).toBe(0);
      expect(resp.errmsg).toBe('success');
      expect(resp.typing_ticket).toBe('base64ticket');
    });
  });
});
