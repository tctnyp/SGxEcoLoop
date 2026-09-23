import { ComponentType } from 'react';
import { NovoEvent, NovoLocation } from '../types';

export const TasksMap: ComponentType<{ locations: NovoLocation[]; events: NovoEvent[]; userLocation?: { latitude: number; longitude: number } | null; focusUser?: number; onEventPress?: (eventId: string) => void }>;
