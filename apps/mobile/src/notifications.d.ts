import { NotificationPreferences } from './types';

export function syncNotificationSchedule(preferences: NotificationPreferences): Promise<boolean>;
export function sendLocalNotification(title: string, body: string, destination: string): Promise<void>;
