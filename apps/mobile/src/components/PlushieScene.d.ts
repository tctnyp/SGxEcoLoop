import { ComponentType } from 'react';
import { AccessoryId, MascotType } from '../types';

export const PlushieScene: ComponentType<{ mascotType: MascotType; accessories: AccessoryId[]; manualRotationX?: number; manualRotationY?: number; isInteracting?: boolean; autoRotate?: boolean }>;
