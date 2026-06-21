import os
import faiss
import numpy as np
import pandas as pd
from sentence_transformers import SentenceTransformer
import joblib
import sqlite3

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
INDEX_PATH = os.path.join(BASE_DIR, "event_dna.index")
MODEL_PATH = os.path.join(BASE_DIR, "impact_model.joblib")
PREPROCESSORS_PATH = os.path.join(BASE_DIR, "preprocessors.joblib")
DB_PATH = os.path.join(BASE_DIR, "event_dna.db")

# Global variables to cache models
_sbert_model = None
_faiss_index = None
_regressor = None
_encoders = None

def get_sbert_model():
    global _sbert_model
    if _sbert_model is None:
        print("Loading Sentence-BERT model...")
        _sbert_model = SentenceTransformer('all-MiniLM-L6-v2')
    return _sbert_model

def get_faiss_index():
    global _faiss_index
    if _faiss_index is None:
        print("Loading FAISS index...")
        _faiss_index = faiss.read_index(INDEX_PATH)
    return _faiss_index

def get_ml_model():
    global _regressor
    if _regressor is None:
        print("Loading ML Impact prediction model...")
        _regressor = joblib.load(MODEL_PATH)
    return _regressor

def get_preprocessors():
    global _encoders
    if _encoders is None:
        print("Loading Preprocessors...")
        _encoders = joblib.load(PREPROCESSORS_PATH)
    return _encoders

# Ensure models can load on startup
def load_all_models():
    get_sbert_model()
    get_faiss_index()
    get_ml_model()
    get_preprocessors()

def generate_description_from_params(event_cause, event_type, zone, junction, requires_road_closure, duration):
    planned_str = "A planned" if str(event_type).lower() == 'planned' else "An unplanned"
    cause = str(event_cause).replace('_', ' ')
    
    zone_str = f" in {zone}" if zone and str(zone).lower() != 'unknown zone' else ""
    junction_str = f" at {junction}" if junction and str(junction).lower() != 'unknown junction' else ""
    
    closure_str = " requiring road closure" if requires_road_closure else " with no road closure"
    duration_str = f" and lasting approximately {int(duration)} minutes" if duration and duration > 0 else ""
    
    return f"{planned_str} {cause} event{zone_str}{junction_str}{closure_str}{duration_str}."

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def find_similar_events_by_embedding(embedding, k=5):
    index = get_faiss_index()
    # Reshape embedding to (1, D)
    emb_array = np.array([embedding]).astype('float32')
    distances, indices = index.search(emb_array, k)
    
    similar_ids = [int(idx) + 1 for idx in indices[0]] # 1-indexed in SQLite
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    placeholders = ",".join(["?"] * len(similar_ids))
    cursor.execute(f"SELECT * FROM events WHERE id IN ({placeholders})", similar_ids)
    rows = cursor.fetchall()
    
    # Map back to original order and add distance/similarity score
    events_dict = {row['id']: dict(row) for row in rows}
    
    similar_events = []
    for i, idx in enumerate(similar_ids):
        if idx in events_dict:
            ev = events_dict[idx]
            dist = distances[0][i]
            similarity = 1.0 / (1.0 + dist)
            ev['similarity_score'] = float(round(similarity * 100, 1))
            similar_events.append(ev)
            
    conn.close()
    return similar_events

def predict_event_impact_and_recommend(event_cause, event_type, zone, junction, requires_road_closure, duration, priority='Low', latitude=12.9716, longitude=77.5946):
    """
    Upgraded model inference that blends the S-BERT + GBDT ML base prediction 
    with real-time traffic conditions, geolocated context, and impact radius calculations.
    """
    from .live_traffic import LiveTrafficService
    from .geospatial_engines import TrafficImpactRadiusEngine, SmartDiversionEngine

    # Load ML pipeline parts
    regressor = get_ml_model()
    encoders = get_preprocessors()
    sbert = get_sbert_model()
    
    # 1. Generate text description and embedding
    desc = generate_description_from_params(event_cause, event_type, zone, junction, requires_road_closure, duration)
    emb = sbert.encode([desc])[0]
    
    # 2. Encode tabular features
    def encode_value(col, val):
        le = encoders[col]
        val_str = str(val) if val else 'Unknown'
        if val_str not in le.classes_:
            return int(le.transform(['Unknown'])[0])
        return int(le.transform([val_str])[0])
        
    cause_enc = encode_value('event_cause', event_cause)
    type_enc = encode_value('event_type', event_type)
    zone_enc = encode_value('zone', zone)
    junc_enc = encode_value('junction', junction)
    priority_enc = encode_value('priority', priority)
    closure_enc = 1 if requires_road_closure else 0
    
    tabular_features = np.array([cause_enc, type_enc, zone_enc, junc_enc, priority_enc, closure_enc])
    
    # Concatenate tabular and embedding features
    X = np.hstack([tabular_features, emb]).reshape(1, -1)
    
    # 3. Predict Base ML Impact Score
    base_score = float(regressor.predict(X)[0])
    base_score = min(100.0, max(0.0, base_score))
    
    # 4. Integrate Live Context Fusion (New Feature 8)
    # Fetch live traffic condition
    live_traffic = LiveTrafficService.get_live_traffic(latitude, longitude)
    congestion_lvl = live_traffic["congestion_level"]
    closure_active = live_traffic["closure_status"]
    
    # Fused impact score calculation
    # Blend base_score with congestion factor (up to +25%) and road closure bonus (+10)
    fused_score = base_score * (1.0 + (congestion_lvl / 100.0) * 0.25)
    if closure_active:
        fused_score += 10.0
        
    # Cap score
    predicted_score = min(100.0, max(0.0, fused_score))
    
    # 5. Derive categorical risk metrics based on fused score
    def get_risk_level(score):
        if score < 35: return 'Low'
        elif score < 60: return 'Medium'
        elif score < 80: return 'High'
        else: return 'Critical'
        
    risk_level = get_risk_level(predicted_score)
    
    def get_duration_cat(dur):
        if dur < 45: return 'Short'
        elif dur < 180: return 'Medium'
        elif dur < 720: return 'Long'
        else: return 'Prolonged'
        
    dur_cat = get_duration_cat(duration)
    
    area_impact = 'Regional' if (requires_road_closure or predicted_score >= 75) else ('Sub-regional' if predicted_score >= 45 else 'Local')
    
    # 6. Retrieve top-5 similar events
    similar_events = find_similar_events_by_embedding(emb, k=5)
    
    # 7. Generate Recommendations (copilot) based on similar successful historical runs
    successful_similar = [e for e in similar_events if e.get('outcome') == 'Successful']
    
    if successful_similar:
        avg_off = int(np.mean([e['manpower_officers'] for e in successful_similar]))
        avg_pat = int(np.mean([e['manpower_patrols'] for e in successful_similar]))
        avg_sup = int(np.mean([e['manpower_supervisors'] for e in successful_similar]))
        avg_barr = int(np.mean([e['barricades_count'] for e in successful_similar]))
        
        # Scaling factor based on live traffic multiplier
        live_multiplier = predicted_score / (base_score + 1e-5)
        
        rec_off = max(1, int(avg_off * live_multiplier))
        rec_pat = max(1, int(avg_pat * live_multiplier))
        rec_sup = max(0, int(avg_sup * live_multiplier))
        rec_barr = int(avg_barr * live_multiplier)
        reasoning_basis = f"Fused: Based on {len(successful_similar)} historical successful matches (e.g. Event #{successful_similar[0]['id']} similarity {successful_similar[0]['similarity_score']}%) calibrated by live traffic context (multiplier: {live_multiplier:.2f}x)."
    else:
        # Heuristics backup if no successful similar events
        rec_off = int(predicted_score / 8) + 1
        rec_pat = int(predicted_score / 25) + 1
        rec_sup = 1 if predicted_score >= 60 else 0
        if predicted_score >= 80:
            rec_sup = 2
            
        if requires_road_closure:
            rec_barr = int(predicted_score / 3) + 10
        else:
            rec_barr = int(predicted_score / 15)
        reasoning_basis = f"Based on impact rules for predicted fused score {predicted_score:.1f} and no matches in historical successful memory."
        
    placement = f"Block off access points 50m before {junction}." if requires_road_closure else (f"Use warning barricades around event area at {junction}." if rec_barr > 0 else "None")
    
    # 8. Run Geospatial engines (New Features 3 & 4)
    radius_data = TrafficImpactRadiusEngine.calculate_impact_radius(
        event_cause=event_cause,
        event_type=event_type,
        requires_road_closure=requires_road_closure,
        duration=duration,
        priority=priority,
        congestion_level=congestion_lvl
    )
    radius_m = radius_data["radius_m"]
    
    diversion_routes = SmartDiversionEngine.get_alternative_routes(
        lat=latitude,
        lon=longitude,
        radius_m=radius_m,
        requires_road_closure=requires_road_closure,
        congestion_level=congestion_lvl,
        event_cause=event_cause
    )
    
    # Map visualisations
    geojson_vis = TrafficImpactRadiusEngine.get_geojson_visualizations(latitude, longitude, radius_m)
    
    # Safely get diversion route summaries
    div_a = f"{diversion_routes[0]['name']}: ETA {diversion_routes[0]['eta_mins']} mins, Delay Saved {diversion_routes[0]['delay_saved_mins']} mins. ({diversion_routes[0]['description']})" if len(diversion_routes) > 0 else "No diversion required"
    div_b = f"{diversion_routes[1]['name']}: ETA {diversion_routes[1]['eta_mins']} mins, Delay Saved {diversion_routes[1]['delay_saved_mins']} mins. ({diversion_routes[1]['description']})" if len(diversion_routes) > 1 else "No diversion required"
    div_c = f"{diversion_routes[2]['name']}: ETA {diversion_routes[2]['eta_mins']} mins, Delay Saved {diversion_routes[2]['delay_saved_mins']} mins. ({diversion_routes[2]['description']})" if len(diversion_routes) > 2 else "No diversion required"

    return {
        'description': desc,
        'predicted_impact': round(predicted_score, 1),
        'risk_level': risk_level,
        'duration_category': dur_cat,
        'area_impact': area_impact,
        'recommended_officers': rec_off,
        'recommended_patrols': rec_pat,
        'recommended_supervisors': rec_sup,
        'recommended_barricades': rec_barr,
        'barricades_placement': placement,
        'diversion_route_a': div_a,
        'diversion_route_b': div_b,
        'diversion_route_c': div_c,
        'diversion_reasoning': reasoning_basis,
        'similar_events': similar_events,
        # New smart city properties
        'live_traffic': live_traffic,
        'impact_radius_m': radius_m,
        'impact_radius_km': radius_data["radius_km"],
        'affected_junctions': radius_data["affected_junctions"],
        'affected_roads': radius_data["affected_roads"],
        'severity_level': radius_data["severity_level"],
        'diversion_routes': diversion_routes,
        'geojson_visualizations': geojson_vis
    }
