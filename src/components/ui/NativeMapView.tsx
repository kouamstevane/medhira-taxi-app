import React, { useEffect, useRef, useState } from 'react';
import { GoogleMap } from '@capacitor/google-maps';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface NativeMapViewProps {
    apiKey: string;
    center: { lat: number; lng: number };
    zoom: number;
    markers?: Array<{
        id: string;
        position: { lat: number; lng: number };
        title?: string;
    }>;
    onMapClick?: (event: any) => void;
    onMarkerClick?: (markerId: string) => void;
    className?: string;
}

export const NativeMapView: React.FC<NativeMapViewProps> = ({
    apiKey,
    center,
    zoom,
    markers = [],
    onMapClick,
    onMarkerClick,
    className = '',
}) => {
    const mapRef = useRef<HTMLDivElement>(null);
    const [map, setMap] = useState<GoogleMap | null>(null);

    useEffect(() => {
        if (!mapRef.current) return;

        const createMap = async () => {
            try {
                const newMap = await GoogleMap.create({
                    id: 'my-map',
                    element: mapRef.current!,
                    apiKey: apiKey,
                    config: {
                        center: center,
                        zoom: zoom,
                        androidLiteMode: false,
                        devicePixelRatio: window.devicePixelRatio,
                        styles: [
                            {
                                featureType: 'poi',
                                elementType: 'labels',
                                stylers: [{ visibility: 'off' }],
                            },
                        ],
                    },
                });

                setMap(newMap);

                // Activer le point bleu de localisation (très précis sur natif)
                await newMap.enableCurrentLocation(true);

                // Listeners
                if (onMapClick) {
                    await newMap.setOnMapClickListener(onMapClick);
                }

                if (onMarkerClick) {
                    await newMap.setOnMarkerClickListener((event) => {
                        onMarkerClick(event.markerId);
                    });
                }
            } catch (e) {
                console.error('Error creating native map', e);
            }
        };

        if (!map) {
            createMap();
        }

        return () => {
            if (map) {
                map.destroy();
            }
        };
    }, []); // Init only once

    // Update Center
    useEffect(() => {
        if (map && center) {
            map.setCamera({
                coordinate: center,
                zoom: zoom,
                animate: true
            });
        }
    }, [map, center, zoom]);

    // Update Markers
    useEffect(() => {
        if (map && markers.length > 0) {
            map.addMarkers(markers.map(m => ({
                coordinate: m.position,
                title: m.title,
                snippet: m.title,
                markerId: m.id
            })));
        }
    }, [map, markers]);

    return (
        <div className={`relative w-full h-full ${className}`}>
            <div
                ref={mapRef}
                id="capacitor-map-container"
                style={{
                    display: 'block',
                    width: '100%',
                    height: '100%',
                }}
            />
        </div>
    );
};
