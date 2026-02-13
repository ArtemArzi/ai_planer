import { Keyboard, InlineKeyboard } from 'grammy';
import { env } from '../env';

// Main reply keyboard (persistent at bottom)
export function getMainKeyboard() {
  return new Keyboard()
    .text('🎯 Сегодня').text('📥 Inbox')
    .row()
    .text('❓ Помощь')
    .resized()
    .persistent();
}

// Inline keyboard for task completion
export function getTaskListKeyboard(tasks: { id: string; index: number }[]) {
  const keyboard = new InlineKeyboard();
  
  tasks.slice(0, 5).forEach((task) => {
    keyboard.text(`✅ ${task.index + 1}`, `complete:${task.id}`).row();
  });
  
  if (tasks.length > 5) {
    keyboard.webApp('Показать все', env.MINI_APP_URL);
  }
  
  return keyboard;
}

// Delete confirmation keyboard
export function getDeleteConfirmKeyboard() {
  return new InlineKeyboard()
    .text('❌ Да, удалить всё', 'delete_confirm')
    .text('Отмена', 'delete_cancel');
}
