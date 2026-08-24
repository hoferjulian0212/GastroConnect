import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type RegistrationCoordinates = {
  lat: number;
  lng: number;
};

const SOUTH_TYROL_CENTER: [number, number] = [46.6, 11.45];

const registrationPin = L.divIcon({
  className: "registration-pin",
  html: '<div style="width:24px;height:24px;border-radius:999px 999px 999px 0;transform:rotate(-45deg);background:#161921;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.35)"></div>',
  iconSize: [24, 24],
  iconAnchor: [12, 24],
});

function RecenterMap({ coordinates }: { coordinates: RegistrationCoordinates }) {
  const map = useMap();
  useEffect(() => {
    map.setView([coordinates.lat, coordinates.lng], Math.max(map.getZoom(), 15));
  }, [coordinates.lat, coordinates.lng, map]);
  return null;
}

function MapClickHandler({
  onChange,
}: {
  onChange: (coordinates: RegistrationCoordinates) => void;
}) {
  useMapEvents({
    click(event) {
      onChange({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });
  return null;
}

export function RegistrationLocationPicker({
  coordinates,
  onChange,
}: {
  coordinates: RegistrationCoordinates;
  onChange: (coordinates: RegistrationCoordinates) => void;
}) {
  return (
    <div
      className="h-[280px] overflow-hidden rounded-2xl border border-black/10"
      data-testid="registration-location-map"
    >
      <MapContainer
        center={
          coordinates
            ? [coordinates.lat, coordinates.lng]
            : SOUTH_TYROL_CENTER
        }
        zoom={15}
        scrollWheelZoom
        style={{ width: "100%", height: "100%" }}
      >
        <RecenterMap coordinates={coordinates} />
        <MapClickHandler onChange={onChange} />
        <TileLayer
          attribution="Tiles &copy; Esri"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          maxZoom={19}
        />
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
          maxZoom={19}
        />
        <Marker
          position={[coordinates.lat, coordinates.lng]}
          icon={registrationPin}
          draggable
          eventHandlers={{
            dragend(event) {
              const marker = event.target as L.Marker;
              const point = marker.getLatLng();
              onChange({ lat: point.lat, lng: point.lng });
            },
          }}
        />
      </MapContainer>
    </div>
  );
}