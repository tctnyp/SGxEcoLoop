import './TasksMap.web.css';
import { useEffect, useRef } from 'react';
import { NovoEvent, NovoLocation } from '../types';

type MapInstance = { addControl: (control: unknown, position: string) => void; remove: () => void };
type PopupInstance = { setDOMContent: (content: HTMLElement) => PopupInstance };
type MarkerInstance = { setLngLat: (coordinates: [number, number]) => MarkerInstance; setPopup: (popup: PopupInstance) => MarkerInstance; addTo: (map: MapInstance) => MarkerInstance };
type MapLibreApi = {
  Map: new (options: { container: HTMLElement; style: string; center: [number, number]; zoom: number; attributionControl: boolean }) => MapInstance;
  AttributionControl: new (options: { compact: boolean }) => unknown;
  Marker: new (options: { element: HTMLElement; anchor?: string }) => MarkerInstance;
  Popup: new (options: { offset: number }) => PopupInstance;
};

declare global { interface Window { maplibregl?: MapLibreApi } }

let mapLibreLoader: Promise<MapLibreApi> | null = null;
function loadMapLibre() {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  if (mapLibreLoader) return mapLibreLoader;
  mapLibreLoader = new Promise<MapLibreApi>((resolve, reject) => {
    if (!document.querySelector('link[data-novo-maplibre]')) {
      const stylesheet = document.createElement('link');
      stylesheet.rel = 'stylesheet';
      stylesheet.href = 'https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.css';
      stylesheet.dataset.novoMaplibre = 'true';
      document.head.appendChild(stylesheet);
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-novo-maplibre]');
    const script = existing ?? document.createElement('script');
    if (!existing) {
      script.src = 'https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.js';
      script.dataset.novoMaplibre = 'true';
      document.head.appendChild(script);
    }
    const finish = () => window.maplibregl ? resolve(window.maplibregl) : reject(new Error('MapLibre did not initialize.'));
    if (window.maplibregl) finish();
    else { script.addEventListener('load', finish, { once: true }); script.addEventListener('error', () => reject(new Error('MapLibre could not load.')), { once: true }); }
  });
  return mapLibreLoader;
}

function popupContent(title: string, detail: string, meta: string) {
  const content = document.createElement('div');
  const heading = document.createElement('strong');
  const copy = document.createElement('div');
  const note = document.createElement('small');
  heading.textContent = title; copy.textContent = detail; note.textContent = meta;
  content.append(heading, copy, note);
  return content;
}

function markerShell(child: HTMLElement, size: number) {
  const shell = document.createElement('span');
  shell.className = 'novo-marker-shell';
  shell.style.width = `${size}px`;
  shell.style.height = `${size}px`;
  shell.appendChild(child);
  return shell;
}

export function TasksMap({ locations, events, userLocation, focusUser = 0, onEventPress }: { locations: NovoLocation[]; events: NovoEvent[]; userLocation?: { latitude: number; longitude: number } | null; focusUser?: number; onEventPress?: (eventId: string) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let disposed = false;
    let map: MapInstance | null = null;
    loadMapLibre().then((maplibregl) => {
      if (disposed || !containerRef.current) return;
      map = new maplibregl.Map({ container: containerRef.current, style: 'https://tiles.openfreemap.org/styles/positron', center: userLocation ? [userLocation.longitude, userLocation.latitude] : [103.8198, 1.3521], zoom: userLocation ? 13.6 : 10.45, attributionControl: false });
      if (userLocation) { const marker = document.createElement('span'); marker.className = 'novo-user-marker'; new maplibregl.Marker({ element: markerShell(marker, 39), anchor: 'center' }).setLngLat([userLocation.longitude, userLocation.latitude]).addTo(map); }
      locations.forEach((location) => {
        const marker = document.createElement('span'); marker.className = 'novo-location-marker';
        new maplibregl.Marker({ element: markerShell(marker, 36), anchor: 'center' }).setLngLat([location.longitude, location.latitude]).setPopup(new maplibregl.Popup({ offset: 14 }).setDOMContent(popupContent(location.name, location.address, 'Return-Right machine'))).addTo(map!);
      });
      events.forEach((event) => {
        if (event.latitude === null || event.longitude === null) return;
        const size = Math.min(46, 28 + Math.round(event.points / 45));
        const marker = document.createElement('span'); marker.className = `novo-event-marker${event.status === 'live' ? ' live' : ''}`; marker.style.width = `${size}px`; marker.style.height = `${size}px`; marker.style.background = event.status === 'live' ? '#E74E43' : '#7058C9'; marker.textContent = String(event.points);
        marker.setAttribute('aria-label', event.title); marker.addEventListener('click', () => onEventPress?.(event.id));
        new maplibregl.Marker({ element: markerShell(marker, size + 18), anchor: 'center' }).setLngLat([event.longitude, event.latitude]).addTo(map!);
      });
    }).catch(() => { if (containerRef.current) containerRef.current.dataset.error = 'true'; });
    return () => { disposed = true; map?.remove(); };
  }, [events, locations, userLocation, focusUser, onEventPress]);

  return <div ref={containerRef} className="novo-map" aria-label="Live and scheduled events and Return-Right machines"><div className="novo-map-error">Map unavailable. Check your connection and try again.</div></div>;
}
