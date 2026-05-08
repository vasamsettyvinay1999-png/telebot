import { bot } from '../../bot.js';

export class TelegramNotifier {
  public async sendMessage(telegramId: number, text: string): Promise<void> {
    await bot.telegram.sendMessage(telegramId, text);
  }
}

