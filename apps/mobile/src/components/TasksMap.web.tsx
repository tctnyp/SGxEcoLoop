import './TasksMap.web.css';
import { memo, useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { NovoEvent, NovoLocation } from '../types';

type MapFeature = { geometry: { coordinates: [number, number] }; properties: Record<string, string | number> };
type GeoJsonSource = { getClusterExpansionZoom: (clusterId: number) => Promise<number> };
type MapInstance = {
  addControl: (control: unknown, position: string) => void;
  addSource: (id: string, source: unknown) => void;
  addLayer: (layer: unknown) => void;
  getSource: (id: string) => GeoJsonSource;
  getCanvas: () => HTMLCanvasElement;
  easeTo: (options: { center: [number, number]; zoom: number }) => void;
  on: {
    (event: 'load', listener: () => void): void;
    (event: string, layer: string, listener: (event: { features?: MapFeature[] }) => void): void;
  };
  remove: () => void;
};
type PopupInstance = { setDOMContent: (content: HTMLElement) => PopupInstance; setLngLat: (coordinates: [number, number]) => PopupInstance; addTo: (map: MapInstance) => PopupInstance };
type MarkerInstance = { setLngLat: (coordinates: [number, number]) => MarkerInstance; setPopup: (popup: PopupInstance) => MarkerInstance; addTo: (map: MapInstance) => MarkerInstance };
type MapLibreApi = {
  Map: new (options: { container: HTMLElement; style: string; center: [number, number]; zoom: number; attributionControl: boolean }) => MapInstance;
  AttributionControl: new (options: { compact: boolean }) => unknown;
  Marker: new (options: { element: HTMLElement; anchor?: string }) => MarkerInstance;
  Popup: new (options: { offset: number }) => PopupInstance;
};

const mapLibre = maplibregl as unknown as MapLibreApi;

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

export const TasksMap = memo(function TasksMap({ locations, events, userLocation, focusUser = 0, onEventPress }: { locations: NovoLocation[]; events: NovoEvent[]; userLocation?: { latitude: number; longitude: number } | null; focusUser?: number; onEventPress?: (eventId: string) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const markerRef = useRef<MarkerInstance | null>(null);
  const apiRef = useRef<MapLibreApi | null>(null);
  const latestLocationRef = useRef(userLocation);
  const lastFocusRef = useRef(focusUser);
  latestLocationRef.current = userLocation;

  const updateUserMarker = (focus: boolean) => {
    const location = latestLocationRef.current;
    const map = mapRef.current;
    const maplibregl = apiRef.current;
    if (!location || !map || !maplibregl) return;
    if (!markerRef.current) { const marker = document.createElement('span'); marker.className = 'novo-user-marker'; markerRef.current = new maplibregl.Marker({ element: markerShell(marker, 39), anchor: 'center' }).setLngLat([location.longitude, location.latitude]).addTo(map); }
    else markerRef.current.setLngLat([location.longitude, location.latitude]);
    if (focus) map.easeTo({ center: [location.longitude, location.latitude], zoom: 14 });
  };

  useEffect(() => {
    const shouldFocus = focusUser !== lastFocusRef.current;
    lastFocusRef.current = focusUser;
    updateUserMarker(shouldFocus);
  }, [userLocation?.latitude, userLocation?.longitude, focusUser]);

  useEffect(() => {
    let disposed = false;
    let map: MapInstance | null = null;
    Promise.resolve(mapLibre).then((maplibregl) => {
      if (disposed || !containerRef.current) return;
      const initialLocation = latestLocationRef.current;
      map = new maplibregl.Map({ container: containerRef.current, style: 'https://tiles.openfreemap.org/styles/positron', center: initialLocation ? [initialLocation.longitude, initialLocation.latitude] : [103.8198, 1.3521], zoom: initialLocation ? 13.6 : 10.45, attributionControl: false });
      mapRef.current = map;
      apiRef.current = maplibregl;
      updateUserMarker(Boolean(initialLocation));
      const returnPointData = { type: 'FeatureCollection', features: locations.map((location) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [location.longitude, location.latitude] }, properties: { id: location.id, name: location.name, address: location.address } })) };
      map.on('load', () => {
        if (!map) return;
        map.addSource('return-right-points', { type: 'geojson', data: returnPointData, cluster: true, clusterMaxZoom: 14, clusterRadius: 48 });
        map.addLayer({ id: 'return-right-clusters', type: 'circle', source: 'return-right-points', filter: ['has', 'point_count'], paint: { 'circle-color': ['step', ['get', 'point_count'], '#5A9F7D', 20, '#287E63', 80, '#155C49'], 'circle-radius': ['step', ['get', 'point_count'], 17, 20, 21, 80, 26], 'circle-stroke-width': 3, 'circle-stroke-color': '#FFFFFF', 'circle-opacity': 0.94 } });
        map.addLayer({ id: 'return-right-cluster-count', type: 'symbol', source: 'return-right-points', filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 11, 'text-font': ['Noto Sans Regular'] }, paint: { 'text-color': '#FFFFFF' } });
        map.addLayer({ id: 'return-right-point', type: 'circle', source: 'return-right-points', filter: ['!', ['has', 'point_count']], paint: { 'circle-color': '#227A62', 'circle-radius': 8, 'circle-stroke-width': 3, 'circle-stroke-color': '#FFFFFF' } });
        map.on('click', 'return-right-clusters', (event) => { const feature = event.features?.[0]; if (!feature || !map) return; map.getSource('return-right-points').getClusterExpansionZoom(Number(feature.properties.cluster_id)).then((zoom) => map?.easeTo({ center: feature.geometry.coordinates, zoom })); });
        map.on('click', 'return-right-point', (event) => { const feature = event.features?.[0]; if (!feature || !map) return; new maplibregl.Popup({ offset: 14 }).setLngLat(feature.geometry.coordinates).setDOMContent(popupContent(String(feature.properties.name), String(feature.properties.address), 'Return Right machine')).addTo(map); });
        ['return-right-clusters', 'return-right-point'].forEach((layer) => {
          map?.on('mouseenter', layer, () => { if (map) map.getCanvas().style.cursor = 'pointer'; });
          map?.on('mouseleave', layer, () => { if (map) map.getCanvas().style.cursor = ''; });
        });
      });
      events.forEach((event) => {
        if (event.latitude === null || event.longitude === null) return;
        const size = Math.min(46, 28 + Math.round(event.points / 45));
        const marker = document.createElement('span'); marker.className = `novo-event-marker${event.status === 'live' ? ' live' : ''}${event.registered ? ' registered' : ''}`; marker.style.width = `${size}px`; marker.style.height = `${size}px`; marker.style.background = event.status === 'live' ? '#E74E43' : '#7058C9'; marker.textContent = event.registered ? '✓' : String(event.points);
        if (event.registered) marker.style.boxShadow = '0 0 0 4px #DFFB84,0 7px 18px rgba(23,53,42,.32)';
        marker.setAttribute('aria-label', `${event.title}${event.registered ? ', joined' : ''}`); marker.addEventListener('click', () => onEventPress?.(event.id));
        new maplibregl.Marker({ element: markerShell(marker, size + 18), anchor: 'center' }).setLngLat([event.longitude, event.latitude]).addTo(map!);
      });
    }).catch(() => { if (containerRef.current) containerRef.current.dataset.error = 'true'; });
    return () => { disposed = true; markerRef.current = null; mapRef.current = null; apiRef.current = null; map?.remove(); };
  }, [events, locations, onEventPress]);

  return <div ref={containerRef} className="novo-map" aria-label="Live and scheduled events and Return-Right machines"><div className="novo-map-error">Map unavailable. Check your connection and try again.</div></div>;
});
