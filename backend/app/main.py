import os

# Load environment variables from .env file at the workspace root
def _load_env_file():
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        # Fallback manual parser if python-dotenv is not installed
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        env_path = os.path.join(base_dir, ".env")
        if os.path.exists(env_path):
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        key, val = line.split("=", 1)
                        os.environ[key.strip()] = val.strip().strip('"').strip("'")

_load_env_file()

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
import json

from . import ml_pipeline
from . import database
from . import live_traffic

app = FastAPI(
    title="EventDNA AI Smart City Platform",
    description="Command & Control Platform for Intelligent Event-Aware Traffic Operations",
    version="2.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic Schemas
class EventCreateSchema(BaseModel):
    event_cause: str = Field(..., example="procession")
    event_type: str = Field(..., example="planned")
    zone: str = Field(..., example="Central Zone 2")
    junction: str = Field(..., example="M.G. Road")
    latitude: float = Field(12.9716, example=12.9716)
    longitude: float = Field(77.5946, example=77.5946)
    requires_road_closure: bool = Field(False, example=False)
    duration: float = Field(60.0, description="Duration in minutes", example=60.0)
    priority: str = Field("Low", example="Low")
    description: Optional[str] = Field(None, example="Annual religious procession route.")
    start_datetime: Optional[str] = Field(None, example="2026-06-20T14:00:00")

class PredictRequestSchema(BaseModel):
    event_cause: str
    event_type: str
    zone: str
    junction: str
    requires_road_closure: bool
    duration: float
    priority: str = "Low"
    latitude: Optional[float] = 12.9716
    longitude: Optional[float] = 77.5946

class TomFeedbackSchema(BaseModel):
    event_id: int
    predicted_impact: float
    recommended_officers: int
    recommended_patrols: int
    recommended_supervisors: int
    recommended_barricades: int
    actual_impact: float
    actual_officers: int
    actual_barricades: int
    actual_outcome: str # Successful, Partially Successful, Failed
    feedback: str
    # Upgraded fields
    actual_impact_radius_m: Optional[float] = None
    diversion_chosen: Optional[str] = None
    officers_dispatched: Optional[List[int]] = None
    response_time_mins: Optional[float] = None
    success_rating: Optional[float] = None

class DispatchCreateSchema(BaseModel):
    event_id: int
    officer_ids: List[int]
    barricades_count: int
    diversion_route: str
    message: str

class OfficerStatusUpdateSchema(BaseModel):
    status: str



@app.on_event("startup")
def startup_event():
    print("Pre-loading ML Models and Index...")
    ml_pipeline.load_all_models()
    print("Running database migrations and checking table schemas...")
    database.init_db_upgrades()
    print("API is ready to handle requests.")


@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": "EventDNA AI Smart City Platform",
        "description": "AI-powered Traffic Command & Control Platform"
    }

# Endpoint 1: Get Paginated Events (Command Center and Database)
@app.get("/api/events")
def get_events(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    zone: Optional[str] = None,
    risk_level: Optional[str] = None,
    event_cause: Optional[str] = None,
    query: Optional[str] = None
):
    try:
        data = database.get_paginated_events(page, page_size, zone, risk_level, event_cause, query)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Endpoint 2: Get Single Event by ID
@app.get("/api/events/{event_id}")
def get_event(event_id: int):
    event = database.get_event_by_id(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return event

# Endpoint 3: Predict Event Impact & Get Operational Recommendations
@app.post("/api/predict")
def predict_event(request: PredictRequestSchema):
    try:
        preds = ml_pipeline.predict_event_impact_and_recommend(
            event_cause=request.event_cause,
            event_type=request.event_type,
            zone=request.zone,
            junction=request.junction,
            requires_road_closure=request.requires_road_closure,
            duration=request.duration,
            priority=request.priority,
            latitude=request.latitude,
            longitude=request.longitude
        )
        return preds
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# Endpoint 4: Insert New Event and Save Prediction (with Auto-Dispatch)
@app.post("/api/events")
def create_event(request: EventCreateSchema):
    try:
        # 1. Run predictions & recommendations first (Live traffic & Routing are fused here)
        preds = ml_pipeline.predict_event_impact_and_recommend(
            event_cause=request.event_cause,
            event_type=request.event_type,
            zone=request.zone,
            junction=request.junction,
            requires_road_closure=request.requires_road_closure,
            duration=request.duration,
            priority=request.priority,
            latitude=request.latitude,
            longitude=request.longitude
        )
        
        # 2. Prepare event dictionary for insert
        start_dt = request.start_datetime or datetime.now().isoformat()
        
        event_dict = {
            'event_cause': request.event_cause,
            'event_type': request.event_type,
            'zone': request.zone,
            'junction': request.junction,
            'latitude': request.latitude,
            'longitude': request.longitude,
            'requires_road_closure': request.requires_road_closure,
            'duration': request.duration,
            'priority': request.priority,
            'description': request.description or "",
            'start_datetime': start_dt,
            'generated_description': preds['description'],
            'impact_score': preds['predicted_impact'],
            'risk_level': preds['risk_level'],
            'duration_category': preds['duration_category'],
            'area_impact': preds['area_impact'],
            'manpower_officers': preds['recommended_officers'],
            'manpower_patrols': preds['recommended_patrols'],
            'manpower_supervisors': preds['recommended_supervisors'],
            'barricades_count': preds['recommended_barricades'],
            'barricades_placement': preds['barricades_placement'],
            'diversion_route_a': preds['diversion_route_a'],
            'diversion_route_b': preds['diversion_route_b'],
            'diversion_route_c': preds['diversion_route_c'],
            'diversion_reasoning': preds['diversion_reasoning'],
            # New geospatial features
            'impact_radius_m': preds['impact_radius_m'],
            'affected_junctions': preds['affected_junctions'],
            'affected_roads': preds['affected_roads'],
            'severity_level': preds['severity_level'],
            'live_traffic_snapshot': json.dumps(preds['live_traffic'])
        }
        
        # 3. Save event to SQLite database
        new_id = database.insert_new_event(event_dict)
        event_dict['id'] = new_id
        
        # 4. NEW FEATURE 6: Autonomous Dispatch Engine trigger
        dispatch_created = False
        dispatch_order = None
        
        # Dispatch threshold: fused impact score > 50.0
        if preds['predicted_impact'] > 50.0:
            # Find nearest available officers based on GPS (Haversine)
            needed_officers = preds['recommended_officers']
            nearest_officers = database.get_nearest_officers(request.latitude, request.longitude, limit=needed_officers)
            
            officer_ids = [o['id'] for o in nearest_officers]
            officer_names = ", ".join([o['officer_name'] for o in nearest_officers])
            
            # Compile Deployment Order
            msg = f"EVENT ALERT: Critical incident detected at {request.junction} ({request.event_cause}). " \
                  f"Predicted Impact: {preds['predicted_impact']:.1f} ({preds['risk_level']}). " \
                  f"Deploying officers: {officer_names}. " \
                  f"Barricades required: {preds['recommended_barricades']}. " \
                  f"Diversion setup: {preds['diversion_route_a']}."
            
            # Store dispatch record in database
            disp_id = database.create_dispatch(
                event_id=new_id,
                officer_ids=officer_ids,
                barricades_count=preds['recommended_barricades'],
                diversion_route=preds['diversion_route_a'],
                message=msg
            )
            
            dispatch_created = True
            dispatch_order = {
                "id": disp_id,
                "officer_ids": officer_ids,
                "officer_names": officer_names,
                "message": msg,
                "status": "Dispatched"
            }
            
            # Print mock integrations (SMS / Email / WhatsApp logs)
            print(f"[SMS API] Notification successfully sent to officers: {officer_names}")
            print(f"[Email Server] Deployment Order Email sent to regional Traffic Operations Commissioner.")
        
        return {
            'event': event_dict,
            'predictions': preds,
            'autonomous_dispatch': {
                'triggered': dispatch_created,
                'order': dispatch_order
            }
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# Endpoint 5: Get Zone Risk Analytics
@app.get("/api/zone-risk")
def get_zone_risk():
    try:
        data = database.get_zone_risk_scores()
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Endpoint 6: Traffic Operations Memory (TOM) Logs
@app.get("/api/tom")
def get_tom_memory(limit: int = Query(50, ge=1, le=200)):
    try:
        data = database.get_tom_records(limit)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/tom/{record_id}")
def delete_tom_record(record_id: int):
    try:
        database.delete_tom_record(record_id)
        return {"status": "success", "message": f"Record {record_id} deleted successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/events/{event_id}")
def delete_event(event_id: int):
    try:
        database.delete_event(event_id)
        return {"status": "success", "message": f"Event {event_id} deleted successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Endpoint 7: Post-Event Learning Feedback loop submission (Upgraded)
@app.post("/api/tom/feedback")
def submit_tom_feedback(request: TomFeedbackSchema):
    try:
        success = database.insert_tom_record(
            event_id=request.event_id,
            predicted_impact=request.predicted_impact,
            rec_off=request.recommended_officers,
            rec_pat=request.recommended_patrols,
            rec_sup=request.recommended_supervisors,
            rec_barr=request.recommended_barricades,
            act_impact=request.actual_impact,
            act_off=request.actual_officers,
            act_barr=request.actual_barricades,
            outcome=request.actual_outcome,
            feedback=request.feedback,
            # Upgraded parameters
            live_traffic_snapshot={"congestion_level": request.actual_impact}, # fallback snapshot
            impact_radius_m=request.actual_impact_radius_m,
            diversion_chosen=request.diversion_chosen,
            officers_dispatched=request.officers_dispatched,
            response_time_mins=request.response_time_mins,
            success_rating=request.success_rating
        )
        return {"success": success, "message": "Feedback submitted successfully. Models and Memory updated."}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# Endpoint 8: Get Performance Metrics (Prediction Accuracy, Evolution etc.)
@app.get("/api/metrics")
def get_metrics():
    try:
        data = database.get_performance_metrics()
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# NEW ENDPOINT 9: Automatic Location Intelligence geocoder
@app.get("/api/geocode")
def geocode(query: str = Query(..., min_length=2)):
    try:
        data = live_traffic.geocode_location(query)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# NEW ENDPOINT 10: Get All Officers
@app.get("/api/officers")
def get_officers():
    try:
        data = database.get_all_officers()
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/officers/{officer_id}/status")
def update_officer_status(officer_id: int, request: OfficerStatusUpdateSchema):
    try:
        if request.status not in ["Available", "Busy", "Dispatched", "HighAlert"]:
            raise HTTPException(status_code=400, detail="Invalid status. Must be Available, Busy, Dispatched, or HighAlert.")
        success = database.update_officer_status(officer_id, request.status)
        return {"success": success, "message": f"Officer #{officer_id} status updated to {request.status}."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# NEW ENDPOINT 11: Get Nearest Officers
@app.get("/api/officers/nearest")
def get_nearest_officers(latitude: float = Query(...), longitude: float = Query(...), limit: int = Query(5)):
    try:
        data = database.get_nearest_officers(latitude, longitude, limit)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# NEW ENDPOINT 12: Manual Dispatch Creation
@app.post("/api/dispatches")
def create_manual_dispatch(request: DispatchCreateSchema):
    try:
        # Get names for message
        officers = database.get_all_officers()
        officers_map = {o['id']: o['officer_name'] for o in officers}
        names = [officers_map.get(o_id, f"Officer #{o_id}") for o_id in request.officer_ids]
        names_str = ", ".join(names)
        
        # Message
        message = f"MANUAL DISPATCH ORDER: Tactical unit assigned to Event #{request.event_id}. " \
                  f"Deploying officers: {names_str}. " \
                  f"Barricades required: {request.barricades_count}. " \
                  f"Diversion setup: {request.diversion_route}."
                  
        disp_id = database.create_dispatch(
            event_id=request.event_id,
            officer_ids=request.officer_ids,
            barricades_count=request.barricades_count,
            diversion_route=request.diversion_route,
            message=message
        )
        return {"success": True, "dispatch_id": disp_id, "message": "Manual dispatch unit deployed successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# NEW ENDPOINT 13: Get All Dispatches
@app.get("/api/dispatches")
def get_dispatches():
    try:
        data = database.get_all_dispatches()
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# NEW ENDPOINT 14: Astram Stream Simulation Data Source
import os
import pandas as pd
import numpy as np

_astram_df = None

def get_astram_dataset():
    global _astram_df
    if _astram_df is None:
        try:
            from .ml_pipeline import BASE_DIR
            csv_path = os.path.join(BASE_DIR, "Astram event data_anonymized - Astram event data_anonymizedb40ac87.csv")
            if os.path.exists(csv_path):
                print(f"Loading Astram dataset for simulation from {csv_path}")
                _astram_df = pd.read_csv(csv_path)
                # Fill na values
                _astram_df['event_cause'] = _astram_df['event_cause'].fillna('others')
                _astram_df['event_type'] = _astram_df['event_type'].fillna('unplanned')
                _astram_df['priority'] = _astram_df['priority'].fillna('Low')
                _astram_df['zone'] = _astram_df['zone'].fillna('Central Zone 2')
                _astram_df['junction'] = _astram_df['junction'].fillna('M.G. Road')
                _astram_df['latitude'] = pd.to_numeric(_astram_df['latitude'], errors='coerce').fillna(12.9716)
                _astram_df['longitude'] = pd.to_numeric(_astram_df['longitude'], errors='coerce').fillna(77.5946)
                _astram_df['requires_road_closure'] = _astram_df['requires_road_closure'].apply(
                    lambda x: True if str(x).lower() in ['true', 'yes', '1'] else False
                )
                _astram_df['description'] = _astram_df['description'].fillna('')
                
                # Calculate duration in minutes if possible, else 60
                start = pd.to_datetime(_astram_df['start_datetime'], errors='coerce', utc=True)
                closed = pd.to_datetime(_astram_df['closed_datetime'], errors='coerce', utc=True)
                end = pd.to_datetime(_astram_df['end_datetime'], errors='coerce', utc=True)
                resolved = pd.to_datetime(_astram_df['resolved_datetime'], errors='coerce', utc=True)
                end_time = closed.fillna(end).fillna(resolved)
                duration_mins = (end_time - start).dt.total_seconds() / 60.0
                _astram_df['duration'] = duration_mins.fillna(60.0)
                _astram_df.loc[_astram_df['duration'] <= 0, 'duration'] = 60.0
            else:
                print(f"Warning: Astram dataset not found at {csv_path}")
        except Exception as e:
            print(f"Error loading Astram dataset: {e}")
    return _astram_df

@app.get("/api/simulation/random-event")
def get_random_simulation_event():
    df = get_astram_dataset()
    if df is None or len(df) == 0:
        return {
            "id": "FKID_MOCK_999",
            "event_cause": "accident",
            "event_type": "unplanned",
            "zone": "Central Zone 2",
            "junction": "Richmond Circle",
            "latitude": 12.9600,
            "longitude": 77.5970,
            "requires_road_closure": True,
            "duration": 90.0,
            "priority": "High",
            "description": "Mock accident blocking two lanes.",
            "start_datetime": datetime.now().isoformat()
        }
    
    row = df.sample(n=1).iloc[0]
    
    junction = str(row['junction'])
    address = str(row.get('address', ''))
    
    if not junction or junction == 'nan' or junction == 'Unknown Junction':
        if ',' in address:
            junction = address.split(',')[0]
        else:
            junction = "Bangalore Corridor"
            
    if junction.strip() == "" or junction == 'nan':
        junction = "Bangalore Corridor"
        
    desc = str(row['description'])
    if desc == 'nan' or desc.strip() == "":
        desc = f"Reported {row['event_cause']} event at {junction}."
        
    start_dt = str(row['start_datetime'])
    if start_dt == 'nan' or not start_dt:
        start_dt = datetime.now().isoformat()
        
    # Standardize event causes to fit the front-end causes
    cause = str(row['event_cause']).strip().lower()
    valid_causes = ['vehicle_breakdown', 'accident', 'tree_fall', 'water_logging', 'pot_holes', 'congestion', 'construction', 'vip_movement', 'procession', 'protest', 'debris', 'others']
    if cause not in valid_causes:
        if 'breakdown' in cause:
            cause = 'vehicle_breakdown'
        elif 'crash' in cause or 'collision' in cause:
            cause = 'accident'
        elif 'water' in cause or 'flooding' in cause:
            cause = 'water_logging'
        elif 'jam' in cause or 'traffic' in cause:
            cause = 'congestion'
        else:
            cause = 'others'
            
    # Standardize zone
    zone = str(row['zone']).strip()
    if zone == 'nan' or zone == 'Unknown Zone' or zone == '':
        zone = 'Central Zone 2'
        
    return {
        "id": str(row['id']),
        "event_cause": cause,
        "event_type": str(row['event_type']),
        "zone": zone,
        "junction": junction,
        "latitude": float(row['latitude']),
        "longitude": float(row['longitude']),
        "requires_road_closure": bool(row['requires_road_closure']),
        "duration": float(row['duration']),
        "priority": str(row['priority']),
        "description": desc,
        "start_datetime": start_dt
    }


# NEW WATERLOGGING ENDPOINTS
class WaterloggingPredictRequestSchema(BaseModel):
    google_api_key: Optional[str] = None
    simulate_heavy_rain: Optional[bool] = False

@app.get("/api/waterlogging/underpasses")
def get_underpasses():
    try:
        from .waterlogging_predictor import WaterloggingPredictor
        predictor = WaterloggingPredictor()
        if predictor.underpasses_df is not None:
            return predictor.underpasses_df.to_dict(orient="records")
        return []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/waterlogging/predict")
def predict_waterlogging(request: WaterloggingPredictRequestSchema):
    try:
        from .waterlogging_predictor import WaterloggingPredictor
        predictor = WaterloggingPredictor()
        results = predictor.fetch_weather_and_predict(
            google_api_key=request.google_api_key,
            simulate_heavy_rain=request.simulate_heavy_rain
        )
        return results
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

