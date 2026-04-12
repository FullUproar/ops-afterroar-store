"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

/* ------------------------------------------------------------------ */
/*  LocationPicker — click-to-place pin with draggable marker          */
/*  Uses Leaflet + OSM tiles. No API key needed.                       */
/* ------------------------------------------------------------------ */

interface LocationPickerProps {
  lat: number;
  lng: number;
  radiusMeters: number;
  onLocationChange: (lat: number, lng: number) => void;
}

export function LocationPicker({ lat, lng, radiusMeters, onLocationChange }: LocationPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const [ready, setReady] = useState(false);

  const hasLocation = lat !== 0 && lng !== 0;
  const defaultCenter: [number, number] = hasLocation ? [lat, lng] : [39.8283, -98.5795]; // US center
  const defaultZoom = hasLocation ? 17 : 4;

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Dynamic import to avoid SSR issues
    import("leaflet").then((L) => {
      // Fix default marker icon (Leaflet + bundlers issue)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(mapRef.current!, {
        center: defaultCenter,
        zoom: defaultZoom,
        zoomControl: true,
        attributionControl: false,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);

      // Add attribution in a smaller format
      L.control.attribution({ prefix: false }).addAttribution(
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OSM</a>'
      ).addTo(map);

      mapInstanceRef.current = map;

      // Place initial marker if location exists
      if (hasLocation) {
        const marker = L.marker([lat, lng], { draggable: true }).addTo(map);
        marker.on("dragend", () => {
          const pos = marker.getLatLng();
          const newLat = Math.round(pos.lat * 1000000) / 1000000;
          const newLng = Math.round(pos.lng * 1000000) / 1000000;
          onLocationChange(newLat, newLng);
          if (circleRef.current) {
            circleRef.current.setLatLng([newLat, newLng]);
          }
        });
        markerRef.current = marker;

        // Radius circle
        const circle = L.circle([lat, lng], {
          radius: radiusMeters,
          color: "#FF8200",
          fillColor: "#FF8200",
          fillOpacity: 0.1,
          weight: 2,
          dashArray: "6 4",
        }).addTo(map);
        circleRef.current = circle;
      }

      // Click to place/move marker
      map.on("click", (e: L.LeafletMouseEvent) => {
        const newLat = Math.round(e.latlng.lat * 1000000) / 1000000;
        const newLng = Math.round(e.latlng.lng * 1000000) / 1000000;

        if (markerRef.current) {
          markerRef.current.setLatLng([newLat, newLng]);
        } else {
          const marker = L.marker([newLat, newLng], { draggable: true }).addTo(map);
          marker.on("dragend", () => {
            const pos = marker.getLatLng();
            const dLat = Math.round(pos.lat * 1000000) / 1000000;
            const dLng = Math.round(pos.lng * 1000000) / 1000000;
            onLocationChange(dLat, dLng);
            if (circleRef.current) {
              circleRef.current.setLatLng([dLat, dLng]);
            }
          });
          markerRef.current = marker;
        }

        if (circleRef.current) {
          circleRef.current.setLatLng([newLat, newLng]);
        } else {
          const circle = L.circle([newLat, newLng], {
            radius: radiusMeters,
            color: "#FF8200",
            fillColor: "#FF8200",
            fillOpacity: 0.1,
            weight: 2,
            dashArray: "6 4",
          }).addTo(map);
          circleRef.current = circle;
        }

        onLocationChange(newLat, newLng);
        map.setView([newLat, newLng], Math.max(map.getZoom(), 16));
      });

      setReady(true);
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
        circleRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update radius circle when radius changes
  useEffect(() => {
    if (circleRef.current) {
      circleRef.current.setRadius(radiusMeters);
    }
  }, [radiusMeters]);

  // Update marker/circle when lat/lng change externally (e.g. GPS button)
  useEffect(() => {
    if (!ready || !hasLocation) return;
    if (markerRef.current) {
      const currentPos = markerRef.current.getLatLng();
      if (Math.abs(currentPos.lat - lat) > 0.000001 || Math.abs(currentPos.lng - lng) > 0.000001) {
        markerRef.current.setLatLng([lat, lng]);
        circleRef.current?.setLatLng([lat, lng]);
        mapInstanceRef.current?.setView([lat, lng], Math.max(mapInstanceRef.current.getZoom(), 16));
      }
    } else if (mapInstanceRef.current) {
      // No marker yet but we have coords — create one
      import("leaflet").then((L) => {
        const map = mapInstanceRef.current!;
        const marker = L.marker([lat, lng], { draggable: true }).addTo(map);
        marker.on("dragend", () => {
          const pos = marker.getLatLng();
          onLocationChange(
            Math.round(pos.lat * 1000000) / 1000000,
            Math.round(pos.lng * 1000000) / 1000000,
          );
          circleRef.current?.setLatLng(pos);
        });
        markerRef.current = marker;

        const circle = L.circle([lat, lng], {
          radius: radiusMeters,
          color: "#FF8200",
          fillColor: "#FF8200",
          fillOpacity: 0.1,
          weight: 2,
          dashArray: "6 4",
        }).addTo(map);
        circleRef.current = circle;
        map.setView([lat, lng], 17);
      });
    }
  }, [lat, lng, ready, hasLocation, radiusMeters, onLocationChange]);

  return (
    <div className="rounded-lg overflow-hidden border border-card-border">
      <div ref={mapRef} style={{ height: 260, width: "100%" }} />
      <div className="bg-card-hover px-3 py-1.5">
        <span className="text-[11px] text-muted">
          {hasLocation
            ? "Click to move pin, or drag it. Orange circle shows the geofence radius."
            : "Click the map to set your store location, or use the GPS button above."}
        </span>
      </div>
    </div>
  );
}
