import os
from abc import ABC, abstractmethod
from loguru import logger
from utiles.text import MarkdownCleaner

class TTSProviderBase(ABC):
    def __init__(self, config):
        self.output_file = config.get("output_dir")

    @abstractmethod
    def generate_filename(self):
        pass

    @abstractmethod
    def text_to_speak(self, text, output_file):
        pass

    @abstractmethod
    def reConfig(self, config):
        pass

    def to_tts(self, text, target_file = None):
        if target_file is None:
            target_file = self.generate_filename()
        try:
            max_repeat_time = 5
            text = MarkdownCleaner.clean_markdown(text)
            while not os.path.exists(target_file) and max_repeat_time > 0:
                try:
                    self.text_to_speak(text, target_file)
                except Exception as e:
                    logger.warning(f"语音生成失败{5 - max_repeat_time + 1}次: {text}，错误: {e}")

                    # 未执行成功，删除文件
                    if os.path.exists(target_file):
                        os.remove(target_file)
                    max_repeat_time -= 1

            if max_repeat_time > 0:
                logger.info(f"语音生成成功: {text}:{target_file}，重试{5 - max_repeat_time}次")
            else:
                logger.error(f"语音生成失败: {text}，请检查网络或服务是否正常")
                target_file = None

            return target_file
        except Exception as e:
            logger.error(f"Failed to generate TTS file: {e}")
            return None