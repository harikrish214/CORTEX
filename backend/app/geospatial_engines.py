import os
import math
import random
import requests
from shapely.geometry import Point, Polygon, mapping
import h3

def latlng_to_cell(lat, lng, res):
    if hasattr(h3, 'latlng_to_cell'):
        return h3.latlng_to_cell(lat, lng, res)
    return h3.geo_to_h3(lat, lng, res)

def grid_disk(cell, k):
    if hasattr(h3, 'grid_disk'):
        return h3.grid_disk(cell, k)
    return h3.k_ring(cell, k)

def cell_to_boundary(cell):
    if hasattr(h3, 'cell_to_boundary'):
        return h3.cell_to_boundary(cell)
    return h3.h3_to_geo_boundary(cell)

class TrafficImpactRadiusEngine:
    @staticmethod
    def calculate_impact_radius(event_cause, event_type, requires_road_closure, duration, priority, congestion_level):
        # Heuristics to compute impact radius in meters (from 100m to 1800m)
        base = 200.0
        
        # event cause adjustment
        cause_multipliers = {
            'accident': 1.5,
            'procession': 2.0,
            'protest': 2.5,
            'vip_movement': 3.0,
            'water_logging': 1.8,
            'vehicle_breakdown': 1.2,
            'construction': 1.6,
            'tree_fall': 1.4,
            'pot_holes': 1.1,
            'congestion': 1.5,
            'road_conditions': 1.3,
            'others': 1.0
        }
        mult = cause_multipliers.get(event_cause.lower(), 1.0)
        radius_m = base * mult
        
        if requires_road_closure:
            radius_m += 300.0
            
        if priority.lower() == 'high':
            radius_m += 200.0
            
        # duration adjustment
        radius_m += min(300.0, (duration / 60.0) * 50.0)
        
        # congestion level adjustment
        radius_m += min(400.0, (congestion_level / 100.0) * 300.0)
        
        # Cap radius between 100m and 1800m
        radius_m = min(1800.0, max(100.0, radius_m))
        
        # Estimate affected junctions and roads
        affected_junctions = int(radius_m / 250.0) + 1
        affected_roads = int(radius_m / 150.0) + 1
        
        # Severity level based on radius
        if radius_m < 300:
            severity = "Low"
        elif radius_m < 700:
            severity = "Medium"
        elif radius_m < 1200:
            severity = "High"
        else:
            severity = "Critical"
            
        return {
            "radius_m": float(radius_m),
            "radius_km": float(radius_m / 1000.0),
            "affected_junctions": affected_junctions,
            "affected_roads": affected_roads,
            "severity_level": severity
        }

    @staticmethod
    def get_geojson_visualizations(lat, lon, radius_m, road_name=""):
        res = 9
        center_cell = latlng_to_cell(lat, lon, res)
        k = max(1, int(radius_m / 150.0))
        cells = grid_disk(center_cell, k)
        
        features = []
        for cell in cells:
            boundary = cell_to_boundary(cell)
            coords = [[coord[1], coord[0]] for coord in boundary]
            if coords:
                coords.append(coords[0])
                
            features.append({
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [coords]
                },
                "properties": {
                    "h3_index": cell
                }
            })
            
        geojson_h3 = {
            "type": "FeatureCollection",
            "features": features
        }
        
        road_geom = SmartDiversionEngine.get_road_geometry(lat, lon, road_name)
        
        return {
            "h3_hexagons": geojson_h3,
            "incident_road": road_geom
        }

class SmartDiversionEngine:
    @staticmethod
    def get_road_geometry(lat: float, lon: float, road_name: str = "") -> dict:
        try:
            url = f"https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lon}&format=json&zoom=17&polygon_geojson=1"
            headers = {"User-Agent": "eventdna_city_upgrade_copilot"}
            res = requests.get(url, headers=headers, timeout=2.5)
            if res.status_code == 200:
                data = res.json()
                geojson = data.get("geojson")
                if geojson and geojson.get("type") in ["LineString", "MultiLineString", "Polygon", "MultiPolygon"]:
                    return geojson
        except Exception as e:
            print(f"Failed to fetch road geometry: {e}")
        
        # Fallback road geometry around (lat, lon)
        return {
            "type": "LineString",
            "coordinates": [
                [lon - 0.0015, lat],
                [lon + 0.0015, lat]
            ]
        }

    @staticmethod
    def get_road_name(lat: float, lon: float) -> str:
        try:
            url = f"https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lon}&format=json&zoom=16"
            headers = {"User-Agent": "eventdna_city_upgrade_copilot"}
            res = requests.get(url, headers=headers, timeout=2.5)
            if res.status_code == 200:
                data = res.json()
                address = data.get("address", {})
                road = address.get("road") or address.get("suburb") or address.get("neighbourhood") or "Local Road"
                return road
        except Exception as e:
            print(f"Reverse geocode failed: {e}")
        return "Local Bypass Corridor"

    @staticmethod
    def decode_polyline(polyline_str: str) -> list:
        index = 0
        lat = 0
        lng = 0
        coordinates = []
        
        while index < len(polyline_str):
            # Decode latitude
            shift = 0
            result = 0
            while True:
                b = ord(polyline_str[index]) - 63
                index += 1
                result |= (b & 0x1f) << shift
                shift += 5
                if not (b >= 0x20):
                    break
            dlat = ~(result >> 1) if (result & 1) else (result >> 1)
            lat += dlat
            
            # Decode longitude
            shift = 0
            result = 0
            while True:
                b = ord(polyline_str[index]) - 63
                index += 1
                result |= (b & 0x1f) << shift
                shift += 5
                if not (b >= 0x20):
                    break
            dlng = ~(result >> 1) if (result & 1) else (result >> 1)
            lng += dlng
            
            coordinates.append([lat / 1e5, lng / 1e5])
            
        return coordinates

    @staticmethod
    def get_alternative_routes(lat: float, lon: float, radius_m: float, 
                               requires_road_closure: bool, congestion_level: float,
                               event_cause: str = "others") -> list:
        # ONLY suggest diversion routes if a road closure or obstruction is detected as an event
        is_obstruction = (
            requires_road_closure or 
            event_cause.lower() in ['obstruction', 'road_closure', 'accident', 'tree_fall', 'construction', 'debris', 'water_logging', 'congestion']
        )
        
        if not is_obstruction:
            return []
            
        # Define 3 diversion waypoints that steer the route away from the incident [lat, lon]
        waypoints = [
            (lat - 0.003, lon - 0.006, "West Bypass"),
            (lat + 0.005, lon + 0.005, "East Bypass"),
            (lat + 0.006, lon - 0.003, "North-West Link")
        ]
        
        routes_data = []
        start_lat, start_lon = lat - 0.008, lon - 0.008
        end_lat, end_lon = lat + 0.008, lon + 0.008
        
        google_api_key = os.getenv("GOOGLE_API_KEY", "")
        
        for idx, (wp_lat, wp_lon, default_name) in enumerate(waypoints):
            coords, duration_sec, distance_m = None, None, None
            
            # Try Google Maps Directions API first if key is present
            if google_api_key:
                try:
                    url = f"https://maps.googleapis.com/maps/api/directions/json?origin={start_lat},{start_lon}&destination={end_lat},{end_lon}&waypoints={wp_lat},{wp_lon}&key={google_api_key}"
                    res = requests.get(url, timeout=3)
                    if res.status_code == 200:
                        data = res.json()
                        if data.get("status") == "OK" and data.get("routes"):
                            route = data["routes"][0]
                            # Decode the polyline points
                            polyline_str = route.get("overview_polyline", {}).get("points", "")
                            if polyline_str:
                                coords = SmartDiversionEngine.decode_polyline(polyline_str)
                            
                            # Sum durations and distances of all legs
                            legs = route.get("legs", [])
                            duration_sec = sum(leg.get("duration", {}).get("value", 0) for leg in legs)
                            distance_m = sum(leg.get("distance", {}).get("value", 0) for leg in legs)
                            print(f"Successfully calculated Google Maps diversion route {idx+1}")
                except Exception as e:
                    print(f"Google Maps Directions API path {idx} failed: {e}, falling back to OSRM...")

            # Fallback to OSRM
            if not coords:
                try:
                    url = f"http://router.project-osrm.org/route/v1/driving/{start_lon},{start_lat};{wp_lon},{wp_lat};{end_lon},{end_lat}?overview=full&geometries=geojson"
                    headers = {"User-Agent": "eventdna_city_upgrade_copilot"}
                    res = requests.get(url, headers=headers, timeout=2.5)
                    if res.status_code == 200:
                        data = res.json()
                        if data.get("routes"):
                            route = data["routes"][0]
                            geometry = route.get("geometry", {})
                            coords = [[c[1], c[0]] for c in geometry.get("coordinates", [])]
                            duration_sec = route.get("duration", 600)
                            distance_m = route.get("distance", 2000)
                except Exception as e:
                    print(f"OSRM path {idx} failed: {e}")
                
            # Fallback if OSRM failed
            if not coords:
                coords = [
                    [start_lat, start_lon],
                    [wp_lat, start_lon],
                    [wp_lat, wp_lon],
                    [end_lat, wp_lon],
                    [end_lat, end_lon]
                ]
                duration_sec = 600 + idx * 120
                distance_m = 2500 + idx * 500
            
            # Find actual street name near the midpoint of the route
            mid_idx = len(coords) // 2
            mid_lat, mid_lon = coords[mid_idx][0], coords[mid_idx][1]
            road_name = SmartDiversionEngine.get_road_name(mid_lat, mid_lon)
            if road_name in ["Local Road", "Local Bypass Corridor", ""]:
                road_name = f"Alternative Corridor {idx+1}"
                
            eta_mins = round((duration_sec + (congestion_level * 1.5)) / 60.0, 1)
            if eta_mins < 5.0:
                eta_mins = 8.5 + idx * 2.0
            delay_saved = round(max(0.5, 18.0 - eta_mins + (idx * 1.5)), 1)
            distance_km = round(distance_m / 1000.0, 1)
            congestion_pct = int(max(15, min(95, 100 - (duration_sec / (duration_sec + congestion_level * 2 + 1)) * 100)))
            
            routes_data.append({
                "name": f"Diversion via {road_name}",
                "eta_mins": eta_mins,
                "delay_saved_mins": delay_saved,
                "description": f"Bypasses the incident zone by rerouting traffic through {road_name}.",
                "coordinates": coords,
                "traffic_duration_sec": eta_mins * 60,
                "distance_km": distance_km,
                "congestion_avoided_pct": congestion_pct
            })
            
        routes_data.sort(key=lambda x: x["traffic_duration_sec"])
        return routes_data
