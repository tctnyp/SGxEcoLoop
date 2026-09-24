import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Text } from './Typography';
import { NovoEvent, NovoLocation } from '../types';

function mapDocument(locations: NovoLocation[], events: NovoEvent[], userLocation?: { latitude: number; longitude: number } | null) {
  const locationData = JSON.stringify(locations).replace(/</g, '\\u003c');
  const eventData = JSON.stringify(events).replace(/</g, '\\u003c');
  const userData = JSON.stringify(userLocation ?? null).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' https://unpkg.com; style-src 'unsafe-inline' https://unpkg.com; img-src data: blob: https:; connect-src https://tiles.openfreemap.org; worker-src blob:" />
  <link rel="stylesheet" href="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.css" />
  <style>
    html,body,#map{width:100%;height:100%;margin:0;background:#eef1ed;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .maplibregl-popup-content{border-radius:18px;box-shadow:0 12px 34px rgba(23,53,42,.18);padding:13px 15px;color:#17352a;font-size:12px;line-height:1.45;min-width:150px}
    .maplibregl-popup-content strong{display:block;margin-bottom:3px;font-size:14px}
    .maplibregl-popup-content em{display:block;margin-top:5px;color:#65716b;font-style:normal;font-weight:700}
    .marker-shell{display:grid;place-items:center;box-sizing:border-box;overflow:visible;contain:layout;transform-origin:center center}
    .novo-marker{display:block;width:22px;height:22px;box-sizing:border-box;border:3px solid #fff;box-shadow:0 5px 14px rgba(23,53,42,.25);background:#227A62;border-radius:7px}
    .event-marker{position:relative;display:grid;place-items:center;box-sizing:border-box;border:3px solid #fff;border-radius:50%;box-shadow:0 7px 18px rgba(23,53,42,.3);color:#fff;font-size:11px;font-weight:900;line-height:1;white-space:nowrap}
    .event-marker.live:after{content:"";position:absolute;inset:-7px;border:2px solid rgba(231,78,67,.42);border-radius:50%;animation:pulse 1.7s ease-out infinite;pointer-events:none}
    .user-marker{position:relative;width:19px;height:19px;box-sizing:border-box;border:4px solid #fff;border-radius:50%;background:#3478f6;box-shadow:0 3px 12px rgba(29,78,160,.42)}
    .user-marker:after{content:"";position:absolute;inset:-10px;border-radius:50%;background:rgba(52,120,246,.16);z-index:-1;pointer-events:none}
    @keyframes pulse{0%{transform:scale(.76);opacity:1}100%{transform:scale(1.35);opacity:0}}
    #load-error{display:none;position:absolute;z-index:999;inset:0;place-items:center;padding:28px;background:#eef1ed;color:#52605a;text-align:center;font-size:13px;line-height:1.5}
  </style>
</head>
<body>
  <div id="map"></div>
  <div id="load-error">The live map could not be loaded. Check your internet connection and try again.</div>
  <script src="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.js" onerror="document.getElementById('load-error').style.display='grid'"></script>
  <script>
    (function () {
      if (!window.maplibregl) { document.getElementById('load-error').style.display = 'grid'; return; }
      var locations = ${locationData};
      var events = ${eventData};
      var userLocation = ${userData};
      var map = new maplibregl.Map({ container: 'map', style: 'https://tiles.openfreemap.org/styles/positron', center: userLocation ? [userLocation.longitude, userLocation.latitude] : [103.8198, 1.3521], zoom: userLocation ? 13.6 : 10.45, attributionControl: false });
      function markerShell(child, size) { var shell = document.createElement('span'); shell.className = 'marker-shell'; shell.style.width = size + 'px'; shell.style.height = size + 'px'; shell.appendChild(child); return shell; }
      if (userLocation) { var userMarker = document.createElement('span'); userMarker.className = 'user-marker'; new maplibregl.Marker({ element: markerShell(userMarker, 39), anchor: 'center' }).setLngLat([userLocation.longitude, userLocation.latitude]).addTo(map); }
      function escapeHtml(value) { return String(value).replace(/[&<>"']/g, function (character) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]; }); }
      locations.forEach(function (location) {
        var marker = document.createElement('span'); marker.className = 'novo-marker';
        new maplibregl.Marker({ element: markerShell(marker, 36), anchor: 'center' }).setLngLat([location.longitude, location.latitude]).setPopup(new maplibregl.Popup({ offset: 14 }).setHTML('<strong>' + escapeHtml(location.name) + '</strong>' + escapeHtml(location.address) + '<em>Return-Right machine</em>')).addTo(map);
      });
      events.forEach(function (event) {
        if (typeof event.latitude !== 'number' || typeof event.longitude !== 'number') return;
        var size = Math.min(46, 28 + Math.round(event.points / 45)); var live = event.status === 'live';
        var marker = document.createElement('span'); marker.className = 'event-marker ' + (live ? 'live' : ''); marker.style.width = size + 'px'; marker.style.height = size + 'px'; marker.style.background = live ? '#E74E43' : '#7058C9'; marker.textContent = event.points;
        marker.setAttribute('aria-label', event.title); marker.addEventListener('click', function () { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'event', eventId: event.id })); });
        new maplibregl.Marker({ element: markerShell(marker, size + 18), anchor: 'center' }).setLngLat([event.longitude, event.latitude]).addTo(map);
      });
      map.on('error', function (event) { if (!event || !event.error) return; console.warn(event.error.message || 'Map error'); });
    })();
  </script>
</body>
</html>`;
}

export function TasksMap({ locations, events, userLocation, focusUser = 0, onEventPress }: { locations: NovoLocation[]; events: NovoEvent[]; userLocation?: { latitude: number; longitude: number } | null; focusUser?: number; onEventPress?: (eventId: string) => void }) {
  const html = useMemo(() => mapDocument(locations, events, userLocation), [locations, events, userLocation, focusUser]);
  return <View style={styles.mapBackdrop}><WebView source={{ html }} originWhitelist={['about:*', 'https://*']} onMessage={(message) => { try { const payload = JSON.parse(message.nativeEvent.data) as { type?: string; eventId?: string }; if (payload.type === 'event' && payload.eventId) onEventPress?.(payload.eventId); } catch { /* Ignore messages not created by the map. */ } }} javaScriptEnabled domStorageEnabled mixedContentMode="never" setSupportMultipleWindows={false} startInLoadingState renderLoading={() => <View style={styles.loading}><ActivityIndicator color="#17352A" /><Text style={styles.loadingText}>Loading live map…</Text></View>} renderError={() => <View style={styles.loading}><Text style={styles.errorTitle}>Map unavailable</Text><Text style={styles.loadingText}>Check your connection and reopen Tasks.</Text></View>} style={styles.map} /></View>;
}

const styles = StyleSheet.create({
  mapBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#EEF1ED', overflow: 'hidden' },
  map: { ...StyleSheet.absoluteFillObject, backgroundColor: '#EEF1ED' },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 9, padding: 24, backgroundColor: '#EEF1ED' },
  loadingText: { color: '#65716B', fontSize: 13, lineHeight: 18, textAlign: 'center' },
  errorTitle: { color: '#17352A', fontSize: 16, fontWeight: '800' },
});
