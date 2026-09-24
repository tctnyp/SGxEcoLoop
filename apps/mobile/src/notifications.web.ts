import { NotificationPreferences } from './types';

export async function syncNotificationSchedule(_preferences: NotificationPreferences) { return false; }
export async function sendLocalNotification(_title: string, _body: string, _destination: string) { return undefined; }
