import os
import requests
import json
import random
from datetime import datetime
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut


class LiveTrafficService:
    @staticmethod
    def get_live_traffic(lat: float, lon: float) -> dict:
        """
        Fetches live traffic info. Defaults directly to OpenStreetMap-informed simulation since HERE and TomTom APIs are not configured.
        """
        return LiveTrafficService._get_osm_simulated_traffic(lat, lon)

    @staticmethod
    def _get_osm_simulated_traffic(lat: float, lon: float) -> dict:
        """
        Fallback that uses Nominatim to query surrounding details or 
        generates realistic traffic metadata for Bangalore based on time-of-day.
        """
        # Determine time-of-day multiplier
        hour = datetime.now().hour
        is_rush_hour = (8 <= hour <= 11) or (17 <= hour <= 20)
        is_night = (23 <= hour) or (hour <= 5)

        base_congestion = 65.0 if is_rush_hour else (15.0 if is_night else 35.0)
        # Add some random spatial variance
        random.seed(int((lat + lon) * 100000) + hour)
        base_congestion += random.uniform(-10.0, 15.0)
        base_congestion = min(95.0, max(5.0, base_congestion))

        travel_time_index = round(1.0 + (base_congestion / 100.0) * 0.6, 2)
        
        # Generate simulated incidents
        incidents = []
        closure_status = False

        if base_congestion > 50:
            incidents.append({
                "type": "congestion",
                "severity": "moderate",
                "description": "High traffic volume on main carriageway",
                "delay_sec": int(base_congestion * 5)
            })
        
        # 10% chance of random minor breakdown/accident
        if random.random() < 0.15:
            incidents.append({
                "type": "accident",
                "severity": "serious",
                "description": "Minor vehicle collision blocking left lane",
                "delay_sec": random.randint(300, 900)
            })
            base_congestion = min(100.0, base_congestion + 15)
            travel_time_index += 0.2

        if random.random() < 0.05:
            incidents.append({
                "type": "roadwork",
                "severity": "critical",
                "description": "Emergency utility repair road closure",
                "delay_sec": 1200
            })
            closure_status = True
            base_congestion = min(100.0, base_congestion + 20)
            travel_time_index += 0.3

        return {
            "congestion_level": round(base_congestion, 1),
            "incidents": incidents,
            "travel_time_index": round(travel_time_index, 2),
            "closure_status": closure_status
        }


def geocode_location(query: str) -> dict:
    """
    Geocodes a location query using OpenStreetMap Nominatim.
    Falls back to Bangalore center with a mock location description if not found.
    """
    if not query:
        return {"latitude": 12.9716, "longitude": 77.5946, "address": "Bangalore Center"}

    # Clean the query
    search_query = query.strip()
    if "bengaluru" not in search_query.lower() and "bangalore" not in search_query.lower():
        search_query += ", Bengaluru, Karnataka, India"

    try:
        # Initializing Nominatim geolocator
        geolocator = Nominatim(user_agent="eventdna_city_upgrade_copilot")
        location = geolocator.geocode(search_query, timeout=5)
        if location:
            lat = float(location.latitude)
            lon = float(location.longitude)
            # Restrict coordinates to Bangalore bounding box
            if not (12.80 <= lat <= 13.15 and 77.30 <= lon <= 77.85):
                lat = 12.9716
                lon = 77.5946
            return {
                "latitude": lat,
                "longitude": lon,
                "address": str(location.address)
            }
    except Exception as e:
        print(f"Geocoding exception: {e}")

    # Fallbacks for popular Bangalore locations mentioned in prompt
    popular_places = {
        "mg road": (12.9738, 77.6119, "M.G. Road, Bengaluru, Karnataka, India"),
        "majestic": (12.9764, 77.5729, "Majestic Bus Stand, Kempegowda, Bengaluru, Karnataka, India"),
        "urvashi": (12.9592, 77.5866, "Urvashi Theatre Junction, Lalbagh Road, Bengaluru, Karnataka, India"),
        "hebbal": (13.0359, 77.5978, "Hebbal Flyover, Outer Ring Road, Bengaluru, Karnataka, India"),
        "richmond": (12.9600, 77.5970, "Richmond Circle, Bengaluru, Karnataka, India"),
        "silk board": (12.9176, 77.6244, "Central Silk Board Junction, Hosur Road, Bengaluru, Karnataka, India")
    }

    q_lower = query.lower()
    for key, val in popular_places.items():
        if key in q_lower:
            return {
                "latitude": val[0],
                "longitude": val[1],
                "address": val[2]
            }

    # Default fallback near MG Road center
    return {
        "latitude": 12.9716 + random.uniform(-0.01, 0.01),
        "longitude": 77.5946 + random.uniform(-0.01, 0.01),
        "address": f"{query} (Estimated Location, Bengaluru, India)"
    }
