import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { NotificationPreferences } from './types';

const CHANNEL_ID = 'novo-reminders';

export async function syncNotificationSchedule(preferences: NotificationPreferences) {
  const wantsNotifications = Object.values(preferences).some(Boolean);
  if (!wantsNotifications) {
    await Notifications.cancelAllScheduledNotificationsAsync();
    return false;
  }
  const permission = await Notifications.getPermissionsAsync();
  const finalPermission = permission.granted ? permission : await Notifications.requestPermissionsAsync();
  if (!finalPermission.granted) return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, { name: 'novo reminders', importance: Notifications.AndroidImportance.DEFAULT });
  }
  await Notifications.cancelAllScheduledNotificationsAsync();
  const scheduleDaily = (hour: number, minute: number, title: string, body: string, data: Record<string, string>) => Notifications.scheduleNotificationAsync({
    content: { title, body, data },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId: CHANNEL_ID },
  });
  if (preferences.dailyGreeting) await scheduleDaily(9, 0, 'Your plushie is ready to say hello', 'Tap the novo patch to protect your streak and refresh today’s quests.', { destination: 'home' });
  if (preferences.tasks) await scheduleDaily(18, 0, 'A small action still fits today', 'Open your quest board and submit evidence before the day ends.', { destination: 'tasks' });
  if (preferences.events) await scheduleDaily(12, 30, 'See what’s happening nearby', 'Check novo for live and scheduled community events.', { destination: 'tasks' });
  return true;
}

export async function sendLocalNotification(title: string, body: string, destination: string) {
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return;
  await Notifications.scheduleNotificationAsync({ content: { title, body, data: { destination } }, trigger: null });
}
