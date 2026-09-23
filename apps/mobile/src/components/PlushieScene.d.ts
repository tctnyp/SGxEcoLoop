import { ComponentType } from 'react';
import { AccessoryId } from '../types';

export const PlushieScene: ComponentType<{ accessories: AccessoryId[]; manualRotation?: number; isInteracting?: boolean; autoRotate?: boolean }>;
