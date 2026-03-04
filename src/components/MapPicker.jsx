import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Navigation, Loader2 } from 'lucide-react';

// Fix Leaflet default marker icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

export default function MapPicker({ onLocationSelect, initialCoords }) {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markerRef = useRef(null);
    const [isLocating, setIsLocating] = useState(false);
    const [selectedCoords, setSelectedCoords] = useState(initialCoords || null);

    // Default center: Indonesia
    const defaultCenter = [-5.0, 119.4];
    const defaultZoom = 5;
    const selectedZoom = 16;

    useEffect(() => {
        if (mapInstanceRef.current) return; // already initialized

        const map = L.map(mapRef.current, {
            center: initialCoords ? [initialCoords.lat, initialCoords.lng] : defaultCenter,
            zoom: initialCoords ? selectedZoom : defaultZoom,
            zoomControl: true,
            attributionControl: false,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
        }).addTo(map);

        // Add initial marker if coords exist
        if (initialCoords) {
            markerRef.current = L.marker([initialCoords.lat, initialCoords.lng], { draggable: true }).addTo(map);
            setupMarkerDrag(markerRef.current);
        }

        // Click to place/move marker
        map.on('click', (e) => {
            const { lat, lng } = e.latlng;
            placeMarker(map, lat, lng);
        });

        mapInstanceRef.current = map;

        // Auto-locate on first open if no initial coords
        if (!initialCoords) {
            locateUser(map);
        }

        return () => {
            // Cleanup on unmount
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }
        };
    }, []);

    const setupMarkerDrag = (marker) => {
        marker.on('dragend', () => {
            const pos = marker.getLatLng();
            updateCoords(pos.lat, pos.lng);
        });
    };

    const placeMarker = (map, lat, lng) => {
        if (markerRef.current) {
            markerRef.current.setLatLng([lat, lng]);
        } else {
            markerRef.current = L.marker([lat, lng], { draggable: true }).addTo(map);
            setupMarkerDrag(markerRef.current);
        }
        updateCoords(lat, lng);
    };

    const updateCoords = (lat, lng) => {
        const coords = { lat, lng };
        setSelectedCoords(coords);
        const mapsLink = `https://www.google.com/maps?q=${lat},${lng}`;
        onLocationSelect(coords, mapsLink);
    };

    const locateUser = (map) => {
        if (!navigator.geolocation) return;
        setIsLocating(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { latitude, longitude } = pos.coords;
                map = map || mapInstanceRef.current;
                map.setView([latitude, longitude], selectedZoom);
                placeMarker(map, latitude, longitude);
                setIsLocating(false);
            },
            () => {
                setIsLocating(false);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

    const btnStyle = {
        display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
        padding: '0.4rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0',
        background: 'white', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
        fontFamily: 'inherit', color: '#334155', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    };

    return (
        <div style={{ borderRadius: '0.5rem', overflow: 'hidden', border: '1px solid var(--glass-border, #e2e8f0)' }}>
            <div ref={mapRef} style={{ width: '100%', height: '220px' }} />
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.5rem 0.75rem', background: '#f8fafc', fontSize: '0.8rem',
                flexWrap: 'wrap', gap: '0.5rem'
            }}>
                <span style={{ color: selectedCoords ? '#16a34a' : '#94a3b8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <MapPin size={14} />
                    {selectedCoords
                        ? `${selectedCoords.lat.toFixed(5)}, ${selectedCoords.lng.toFixed(5)}`
                        : 'Klik peta untuk pilih lokasi'}
                </span>
                <button
                    type="button"
                    onClick={() => locateUser(mapInstanceRef.current)}
                    disabled={isLocating}
                    style={{ ...btnStyle, opacity: isLocating ? 0.6 : 1 }}
                >
                    {isLocating
                        ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Mencari...</>
                        : <><Navigation size={14} /> Lokasi Saya</>}
                </button>
            </div>
        </div>
    );
}
