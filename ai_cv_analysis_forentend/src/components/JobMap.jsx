import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix for default marker icons in Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

export default function JobMap({ onShowSoftwareHouses }) {
  const mapRef = useRef(null);
  const mapContainerRef = useRef(null);
  const markersRef = useRef([]);
  const [loading, setLoading] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const GEOAPIFY_KEY = "b5725e990c634e9abb644769eafc3de6";

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Initialize map
    mapRef.current = L.map(mapContainerRef.current).setView([33.6844, 73.0479], 13);

    L.tileLayer(
      `https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${GEOAPIFY_KEY}`,
      { 
        maxZoom: 20,
        attribution: '&copy; <a href="https://www.geoapify.com/">Geoapify</a>'
      }
    ).addTo(mapRef.current);

    // Get user location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setUserLocation({ lat: latitude, lng: longitude });
          
          // Center map on user location
          mapRef.current.setView([latitude, longitude], 13);

          // Add user marker with custom blue icon
          const userIcon = L.divIcon({
            className: 'custom-user-marker',
            html: '<div style="background-color: #3B82F6; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.5);"></div>',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          });

          L.marker([latitude, longitude], { icon: userIcon })
            .addTo(mapRef.current)
            .bindPopup("<b>📍 Your Location</b>")
            .openPopup();
        },
        (error) => {
          console.error("Error getting location:", error);
        }
      );
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Function to search for nearby software houses
  const searchNearbySoftwareHouses = async () => {
    if (!userLocation || !mapRef.current) {
      alert("Please allow location access to find nearby software houses");
      return;
    }

    setLoading(true);

    // Clear previous markers (except user marker)
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    try {
      let allResults = [];
      const radius = 10000; // Expanded to 10km radius
      const limit = 50;

      // Method 1: Search by categories
      const categories = [
        'commercial.office.it',
        'commercial.office.company',
        'commercial.computer',
        'office.company',
        'commercial.office'
      ];

      const categoryResponse = await fetch(
        `https://api.geoapify.com/v2/places?categories=${categories.join(',')}&filter=circle:${userLocation.lng},${userLocation.lat},${radius}&limit=${limit}&apiKey=${GEOAPIFY_KEY}`
      );

      const categoryData = await categoryResponse.json();
      if (categoryData.features && categoryData.features.length > 0) {
        allResults = [...categoryData.features];
      }

      // Method 2: Text search as fallback
      const searchTerms = [
        'software house',
        'IT company',
        'software company',
        'tech company',
        'software development',
        'technology company'
      ];

      for (const term of searchTerms) {
        if (allResults.length >= 30) break; // Stop if we have enough results

        try {
          const textResponse = await fetch(
            `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(term)}&filter=circle:${userLocation.lng},${userLocation.lat},${radius}&limit=10&apiKey=${GEOAPIFY_KEY}`
          );

          const textData = await textResponse.json();
          if (textData.features && textData.features.length > 0) {
            // Add unique results only
            textData.features.forEach(feature => {
              const isDuplicate = allResults.some(existing => 
                Math.abs(existing.geometry.coordinates[0] - feature.geometry.coordinates[0]) < 0.0001 &&
                Math.abs(existing.geometry.coordinates[1] - feature.geometry.coordinates[1]) < 0.0001
              );
              if (!isDuplicate) {
                allResults.push(feature);
              }
            });
          }
        } catch (err) {
          console.log(`Search for ${term} failed:`, err);
        }
      }

      if (allResults.length > 0) {
        // Add markers for each software house
        allResults.forEach((place) => {
          const [lng, lat] = place.geometry.coordinates;
          const name = place.properties.name || 
                       place.properties.address_line1 || 
                       place.properties.formatted?.split(',')[0] ||
                       "Company";
          const address = place.properties.address_line2 || 
                         place.properties.formatted ||
                         'Address not available';

          // Filter out generic or non-business results
          if (name && !name.match(/^(Street|Road|Avenue|Boulevard|Highway)/i)) {
            // Create custom red marker for companies
            const companyIcon = L.divIcon({
              className: 'custom-company-marker',
              html: '<div style="background-color: #EF4444; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 8px rgba(0,0,0,0.4);"></div>',
              iconSize: [16, 16],
              iconAnchor: [8, 8]
            });

            const marker = L.marker([lat, lng], { icon: companyIcon })
              .addTo(mapRef.current)
              .bindPopup(`
                <div style="min-width: 200px;">
                  <b>🏢 ${name}</b><br/>
                  <span style="font-size: 12px; color: #666;">${address}</span>
                </div>
              `);

            markersRef.current.push(marker);
          }
        });

        if (markersRef.current.length > 0) {
          // Fit bounds to show all markers
          const bounds = L.latLngBounds(
            markersRef.current.map(m => m.getLatLng())
          );
          mapRef.current.fitBounds(bounds, { padding: [50, 50] });

          if (onShowSoftwareHouses) {
            onShowSoftwareHouses(markersRef.current.length);
          }
        } else {
          alert("No software houses found nearby within 10km radius. Try a different location or check back later.");
        }
      } else {
        alert("No software houses found nearby within 10km radius. The area might not have registered tech companies in the database.");
      }
    } catch (error) {
      console.error("Error searching for software houses:", error);
      alert("Failed to search for nearby companies. Please check your internet connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <div 
        ref={mapContainerRef} 
        id="job-map" 
        style={{ height: "500px", width: "100%", borderRadius: "12px" }}
        className="shadow-lg"
      ></div>
      
      <button
        onClick={searchNearbySoftwareHouses}
        disabled={loading || !userLocation}
        className={`absolute top-4 right-4 z-[1000] px-4 py-2 rounded-lg font-medium shadow-lg transition-all ${
          loading || !userLocation
            ? "bg-gray-400 cursor-not-allowed"
            : "bg-[#050E7F] hover:bg-indigo-700 text-white"
        }`}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            Searching...
          </span>
        ) : (
          "🔍 Find Nearby Software Houses"
        )}
      </button>
    </div>
  );
}
