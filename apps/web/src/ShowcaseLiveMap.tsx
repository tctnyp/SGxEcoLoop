import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

type LiveEvent = { id: string; title: string; location: string; points: number; latitude: number; longitude: number };

export function ShowcaseLiveMap({ events }: { events: LiveEvent[] }) {
  const host = useRef<HTMLDivElement | null>(null);
  const map = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!host.current || map.current) return;
    const instance = new maplibregl.Map({ container: host.current, style: 'https://tiles.openfreemap.org/styles/liberty', center: [103.8198, 1.3521], zoom: 10.5, scrollZoom: false });
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.current = instance;
    return () => { instance.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const draw = () => {
      const data: GeoJSON.FeatureCollection<GeoJSON.Point, { title: string; location: string; points: string }> = { type: 'FeatureCollection', features: events.map((event) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [event.longitude, event.latitude] }, properties: { title: event.title, location: event.location, points: String(event.points) } })) };
      const source = instance.getSource('novo-events') as maplibregl.GeoJSONSource | undefined;
      if (source) source.setData(data);
      else {
        instance.addSource('novo-events', { type: 'geojson', data });
        instance.addLayer({ id: 'novo-event-halo', type: 'circle', source: 'novo-events', paint: { 'circle-radius': 25, 'circle-color': 'rgba(223,252,118,.24)', 'circle-blur': .45 } });
        instance.addLayer({ id: 'novo-event-points', type: 'circle', source: 'novo-events', paint: { 'circle-radius': 18, 'circle-color': '#17352A', 'circle-stroke-width': 3, 'circle-stroke-color': '#F7F9F3' } });
        instance.addLayer({ id: 'novo-event-labels', type: 'symbol', source: 'novo-events', layout: { 'text-field': ['get', 'points'], 'text-size': 11, 'text-font': ['Noto Sans Bold'] }, paint: { 'text-color': '#DFFC76' } });
        instance.on('click', 'novo-event-points', (event) => {
          const feature = event.features?.[0];
          if (!feature?.properties) return;
          new maplibregl.Popup({ closeButton: false, offset: 22, className: 'showcase-map-popup' }).setLngLat(event.lngLat).setHTML(`<strong>${feature.properties.title}</strong><span>${feature.properties.location}</span>`).addTo(instance);
        });
        instance.on('mouseenter', 'novo-event-points', () => { instance.getCanvas().style.cursor = 'pointer'; });
        instance.on('mouseleave', 'novo-event-points', () => { instance.getCanvas().style.cursor = ''; });
      }
      if (events.length) {
        const bounds = events.reduce((next, event) => next.extend([event.longitude, event.latitude]), new maplibregl.LngLatBounds());
        instance.fitBounds(bounds, { padding: 90, maxZoom: 11.6, duration: 0 });
      }
    };
    if (instance.isStyleLoaded()) draw(); else instance.once('load', draw);
    return () => { instance.off('load', draw); };
  }, [events]);

  return <div ref={host} className="showcase-map" aria-label="Map of live and upcoming novo events across Singapore"/>;
}
