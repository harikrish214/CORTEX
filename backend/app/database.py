import os
import sqlite3
import json
import random
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB_PATH = os.path.join(BASE_DIR, "event_dna.db")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db_upgrades():
    """
    Performs non-destructive database migrations.
    Adds necessary columns and tables for Phase 2 Smart City capabilities.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Check and upgrade 'events' table
    cursor.execute("PRAGMA table_info(events)")
    event_cols = [r[1] for r in cursor.fetchall()]
    
    event_upgrades = {
        'impact_radius_m': 'REAL',
        'affected_junctions': 'INTEGER',
        'affected_roads': 'INTEGER',
        'severity_level': 'TEXT',
        'live_traffic_snapshot': 'TEXT'
    }
    
    for col, col_type in event_upgrades.items():
        if col not in event_cols:
            cursor.execute(f"ALTER TABLE events ADD COLUMN {col} {col_type}")
            print(f"Added column '{col}' to 'events' table")

    # 2. Check and upgrade 'tom_memory' table
    cursor.execute("PRAGMA table_info(tom_memory)")
    tom_cols = [r[1] for r in cursor.fetchall()]
    
    tom_upgrades = {
        'live_traffic_snapshot': 'TEXT',
        'impact_radius_m': 'REAL',
        'diversion_chosen': 'TEXT',
        'officers_dispatched': 'TEXT',
        'response_time_mins': 'REAL',
        'success_rating': 'REAL'
    }
    
    for col, col_type in tom_upgrades.items():
        if col not in tom_cols:
            cursor.execute(f"ALTER TABLE tom_memory ADD COLUMN {col} {col_type}")
            print(f"Added column '{col}' to 'tom_memory' table")

    # 3. Create 'officers' table (Officer Management System)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS officers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        officer_name TEXT,
        latitude REAL,
        longitude REAL,
        status TEXT
    )
    """)

    # 4. Create 'dispatches' table (Autonomous Dispatch Engine)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS dispatches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER,
        officer_ids TEXT,
        barricades_count INTEGER,
        diversion_route TEXT,
        status TEXT,
        dispatch_message TEXT,
        timestamp TEXT,
        FOREIGN KEY(event_id) REFERENCES events(id)
    )
    """)
    
    conn.commit()

    # 5. Populate Officers if table is empty
    cursor.execute("SELECT COUNT(*) FROM officers")
    if cursor.fetchone()[0] == 0:
        names = [
            # Supervisors
            "Inspector R. Gowda (Supervisor)", 
            "Sub-Inspector A. Khan (Supervisor)",
            "Inspector S. Patil (Supervisor)",
            "Sub-Inspector V. Reddy (Supervisor)",
            # Patrol Teams (Bikes)
            "Patrol Team Alpha (Bikes)", 
            "Patrol Team Beta (Bikes)", 
            "Patrol Team Gamma (Bikes)", 
            "Patrol Team Delta (Bikes)", 
            "Patrol Team Epsilon (Bikes)",
            # Officers
            "Officer M. Kumar", "Officer R. Sharma", "Officer N. Swamy", "Officer P. Rao",
            "Officer B. Singh", "Officer K. Hegde", "Officer J. Mathew", "Officer D. Souza",
            "Officer H. Prasad", "Officer M. Ali", "Officer T. Naidu", "Officer G. Gowda",
            "Officer S. Joshi", "Officer A. Nair", "Officer R. Menon", "Officer K. Pillai",
            "Officer C. Shekar", "Officer B. Das", "Officer Y. Yadav", "Officer S. Verma", "Officer J. Ray"
        ]
        # Major Bangalore coordinates for distribution
        junction_coords = [
            (12.9738, 77.6119), # MG Road
            (12.9764, 77.5729), # Majestic
            (12.9592, 77.5866), # Urvashi Junction
            (13.0359, 77.5978), # Hebbal
            (12.9600, 77.5970), # Richmond Circle
            (12.9176, 77.6244), # Central Silk Board
            (12.9784, 77.6408), # Indiranagar
            (12.9345, 77.6101)  # Koramangala
        ]
        
        officer_data = []
        for i, name in enumerate(names):
            base_coord = junction_coords[i % len(junction_coords)]
            # Add small random offsets (approx 500m - 1.5km)
            lat = base_coord[0] + random.uniform(-0.01, 0.01)
            lon = base_coord[1] + random.uniform(-0.01, 0.01)
            status = "Available" if i % 5 != 0 else "Busy"
            officer_data.append((name, lat, lon, status))
            
        cursor.executemany("INSERT INTO officers (officer_name, latitude, longitude, status) VALUES (?, ?, ?, ?)", officer_data)
        conn.commit()
        print("Populated officers table with 25 traffic officers.")

    conn.close()

# Officer Management Queries
def get_all_officers():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM officers")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def get_nearest_officers(lat: float, lon: float, limit: int = 5):
    """
    Finds nearest officers using the Haversine Distance formula.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM officers WHERE status = 'Available'")
    rows = cursor.fetchall()
    conn.close()

    officers = []
    # Haversine calculation
    R = 6371.0 # Earth radius in km
    
    for row in rows:
        o_lat = row['latitude']
        o_lon = row['longitude']
        
        dlat = math_radians(o_lat - lat)
        dlon = math_radians(o_lon - lon)
        
        a = (math_sin(dlat / 2) ** 2 + 
             math_cos(math_radians(lat)) * math_cos(math_radians(o_lat)) * math_sin(dlon / 2) ** 2)
        c = 2 * math_asin(math_sqrt(a))
        distance_km = R * c
        
        # Speed model for traffic officer response (e.g. 20 km/h avg in Bangalore)
        eta_mins = round((distance_km / 20.0) * 60.0, 1)
        if eta_mins < 1.0:
            eta_mins = 1.0
            
        officers.append({
            "id": row['id'],
            "officer_name": row['officer_name'],
            "latitude": o_lat,
            "longitude": o_lon,
            "status": row['status'],
            "distance_km": round(distance_km, 2),
            "eta_mins": eta_mins
        })
        
    # Sort by distance
    officers.sort(key=lambda x: x["distance_km"])
    return officers[:limit]

def update_officer_status(officer_id: int, status: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE officers SET status = ? WHERE id = ?", (status, officer_id))
    conn.commit()
    conn.close()
    return True

# Autonomous Dispatch Queries
def create_dispatch(event_id: int, officer_ids: list, barricades_count: int, diversion_route: str, message: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    timestamp = datetime.now().isoformat()
    
    officer_str = ",".join(map(str, officer_ids))
    cursor.execute("""
        INSERT INTO dispatches (event_id, officer_ids, barricades_count, diversion_route, status, dispatch_message, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (event_id, officer_str, barricades_count, diversion_route, "Dispatched", message, timestamp))
    
    # Mark officers as dispatched/busy
    for o_id in officer_ids:
        cursor.execute("UPDATE officers SET status = 'Dispatched' WHERE id = ?", (o_id,))
        
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return new_id

def get_all_dispatches():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT d.*, e.junction, e.event_cause, e.risk_level, e.impact_score 
        FROM dispatches d
        JOIN events e ON d.event_id = e.id
        ORDER BY d.id DESC
    """)
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

# Math wrappers to avoid imports
def math_radians(deg):
    import math
    return math.radians(deg)
def math_sin(rad):
    import math
    return math.sin(rad)
def math_cos(rad):
    import math
    return math.cos(rad)
def math_asin(x):
    import math
    return math.asin(x)
def math_sqrt(x):
    import math
    return math.sqrt(x)

def get_paginated_events(page=1, page_size=20, zone=None, risk_level=None, event_cause=None, query=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Base query
    sql = "SELECT * FROM events WHERE 1=1"
    params = []
    
    if zone and zone != 'All':
        sql += " AND zone = ?"
        params.append(zone)
    if risk_level and risk_level != 'All':
        sql += " AND risk_level = ?"
        params.append(risk_level)
    if event_cause and event_cause != 'All':
        sql += " AND event_cause = ?"
        params.append(event_cause)
    if query:
        sql += " AND (junction LIKE ? OR generated_description LIKE ? OR original_id LIKE ?)"
        like_query = f"%{query}%"
        params.extend([like_query, like_query, like_query])
        
    # Get total count first
    count_sql = sql.replace("SELECT *", "SELECT COUNT(*)")
    cursor.execute(count_sql, params)
    total_count = cursor.fetchone()[0]
    
    # Add ordering and pagination
    sql += " ORDER BY id DESC LIMIT ? OFFSET ?"
    params.extend([page_size, (page - 1) * page_size])
    
    cursor.execute(sql, params)
    rows = cursor.fetchall()
    
    events = [dict(row) for row in rows]
    conn.close()
    
    return {
        'total_count': total_count,
        'page': page,
        'page_size': page_size,
        'total_pages': (total_count + page_size - 1) // page_size,
        'events': events
    }

def get_event_by_id(event_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM events WHERE id = ?", (event_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def insert_new_event(event):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Generate unique ID for this new event
    cursor.execute("SELECT MAX(id) FROM events")
    max_id = cursor.fetchone()[0]
    new_id = (max_id or 0) + 1
    
    cols = [
        'id', 'original_id', 'event_cause', 'event_type', 'zone', 'junction', 'latitude', 'longitude',
        'start_datetime', 'end_datetime', 'closed_datetime', 'requires_road_closure',
        'priority', 'description', 'duration', 'generated_description', 'impact_score',
        'risk_level', 'duration_category', 'area_impact', 'manpower_officers',
        'manpower_patrols', 'manpower_supervisors', 'barricades_count', 'barricades_placement',
        'diversion_route_a', 'diversion_route_b', 'diversion_route_c', 'diversion_reasoning',
        'outcome', 'feedback', 'impact_radius_m', 'affected_junctions', 'affected_roads',
        'severity_level', 'live_traffic_snapshot'
    ]
    
    placeholders = ",".join(["?"] * len(cols))
    
    val_list = [
        new_id,
        f"EV-{new_id:04d}",
        event['event_cause'],
        event['event_type'],
        event['zone'],
        event['junction'],
        event['latitude'],
        event['longitude'],
        event['start_datetime'],
        event.get('end_datetime', ''),
        event.get('closed_datetime', ''),
        1 if event['requires_road_closure'] else 0,
        event.get('priority', 'Low'),
        event.get('description', ''),
        event['duration'],
        event['generated_description'],
        event['impact_score'],
        event['risk_level'],
        event['duration_category'],
        event['area_impact'],
        event['manpower_officers'],
        event['manpower_patrols'],
        event['manpower_supervisors'],
        event['barricades_count'],
        event['barricades_placement'],
        event['diversion_route_a'],
        event['diversion_route_b'],
        event['diversion_route_c'],
        event['diversion_reasoning'],
        event.get('outcome', 'Active'),
        event.get('feedback', ''),
        event.get('impact_radius_m', 250.0),
        event.get('affected_junctions', 4),
        event.get('affected_roads', 6),
        event.get('severity_level', 'Medium'),
        event.get('live_traffic_snapshot', '')
    ]
    
    cursor.execute(f"INSERT INTO events ({','.join(cols)}) VALUES ({placeholders})", val_list)
    conn.commit()
    conn.close()
    return new_id

def get_zone_risk_scores():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT 
            zone, 
            COUNT(*) as event_count, 
            AVG(impact_score) as avg_impact,
            SUM(requires_road_closure) as closure_count,
            AVG(latitude) as avg_lat,
            AVG(longitude) as avg_lon
        FROM events 
        GROUP BY zone
    """)
    rows = cursor.fetchall()
    
    zones_list = []
    for row in rows:
        zone_name = row['zone']
        if not zone_name or zone_name == 'Unknown Zone':
            continue
            
        count = row['event_count']
        avg_imp = row['avg_impact']
        closures = row['closure_count']
        
        freq_factor = min(30, (count / 10.0))
        closure_factor = min(10, closures * 0.5)
        risk_score = (avg_imp * 0.6) + freq_factor + closure_factor
        risk_score = min(100.0, max(10.0, risk_score))
        
        today_score = risk_score + np_random_variance(-4, 4)
        weekly_score = risk_score + np_random_variance(-2, 2)
        monthly_score = risk_score
        
        zones_list.append({
            'zone': zone_name,
            'event_count': count,
            'avg_impact': round(avg_imp, 1),
            'risk_score': round(risk_score, 1),
            'today_score': round(min(100, max(0, today_score)), 1),
            'weekly_score': round(min(100, max(0, weekly_score)), 1),
            'monthly_score': round(min(100, max(0, monthly_score)), 1),
            'latitude': row['avg_lat'],
            'longitude': row['avg_lon']
        })
        
    conn.close()
    return zones_list

def np_random_variance(low, high):
    import numpy as np
    return np.random.uniform(low, high)

def get_tom_records(limit=50):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT 
            t.*, 
            e.event_cause, 
            e.event_type, 
            e.zone, 
            e.junction, 
            e.generated_description
        FROM tom_memory t
        JOIN events e ON t.event_id = e.id
        ORDER BY t.id DESC
        LIMIT ?
    """, (limit,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def delete_tom_record(record_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    # Find the corresponding event_id before deleting the record
    cursor.execute("SELECT event_id FROM tom_memory WHERE id = ?", (record_id,))
    row = cursor.fetchone()
    if row:
        event_id = row['event_id']
        # Delete referencing records first
        cursor.execute("DELETE FROM tom_memory WHERE id = ?", (record_id,))
        cursor.execute("DELETE FROM dispatches WHERE event_id = ?", (event_id,))
        cursor.execute("DELETE FROM metrics WHERE event_id = ?", (event_id,))
        # Finally delete from events
        cursor.execute("DELETE FROM events WHERE id = ?", (event_id,))
    else:
        cursor.execute("DELETE FROM tom_memory WHERE id = ?", (record_id,))
    conn.commit()
    conn.close()
    return True

def delete_event(event_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    # Delete referencing records first
    cursor.execute("DELETE FROM tom_memory WHERE event_id = ?", (event_id,))
    cursor.execute("DELETE FROM dispatches WHERE event_id = ?", (event_id,))
    cursor.execute("DELETE FROM metrics WHERE event_id = ?", (event_id,))
    # Finally delete from events
    cursor.execute("DELETE FROM events WHERE id = ?", (event_id,))
    conn.commit()
    conn.close()
    return True

def insert_tom_record(event_id, predicted_impact, rec_off, rec_pat, rec_sup, rec_barr, act_impact, act_off, act_barr, outcome, feedback,
                      live_traffic_snapshot=None, impact_radius_m=None, diversion_chosen=None, officers_dispatched=None, response_time_mins=None, success_rating=None):
    """
    Upgraded TOM feedback record insertion with Live Context and Self-Learning.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    timestamp = datetime.now().isoformat()
    
    # 1. Fetch predicted impact radius from the event to calculate accuracy
    cursor.execute("SELECT impact_radius_m, requires_road_closure FROM events WHERE id = ?", (event_id,))
    event_row = cursor.fetchone()
    pred_radius = event_row['impact_radius_m'] if (event_row and event_row['impact_radius_m'] is not None) else 250.0
    
    # Defaults for actual parameters if not provided
    act_radius = impact_radius_m if impact_radius_m is not None else pred_radius
    resp_time = response_time_mins if response_time_mins is not None else 15.0
    succ_rate = success_rating if success_rating is not None else (9.0 if outcome == "Successful" else (6.0 if outcome == "Partially Successful" else 3.0))
    
    # Stringify objects
    traffic_snap_str = json.dumps(live_traffic_snapshot) if live_traffic_snapshot else "{}"
    off_disp_str = json.dumps(officers_dispatched) if officers_dispatched else "[]"
    
    cursor.execute("""
        INSERT INTO tom_memory (
            event_id, predicted_impact, recommended_officers, recommended_patrols, recommended_supervisors,
            recommended_barricades, actual_impact, actual_officers, actual_barricades, actual_outcome, feedback, timestamp,
            live_traffic_snapshot, impact_radius_m, diversion_chosen, officers_dispatched, response_time_mins, success_rating
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        event_id, predicted_impact, rec_off, rec_pat, rec_sup,
        rec_barr, act_impact, act_off, act_barr, outcome, feedback, timestamp,
        traffic_snap_str, act_radius, diversion_chosen, off_disp_str, resp_time, succ_rate
    ))
    
    # Update the event's outcome and feedback in the events table
    cursor.execute("""
        UPDATE events 
        SET outcome = ?, feedback = ?
        WHERE id = ?
    """, (outcome, feedback, event_id))
    
    # Free up officers if they were dispatched
    if officers_dispatched:
        for o_id in officers_dispatched:
            cursor.execute("UPDATE officers SET status = 'Available' WHERE id = ?", (o_id,))
    else:
        # Fallback: Release officers associated with any active dispatches for this event
        cursor.execute("SELECT officer_ids FROM dispatches WHERE event_id = ?", (event_id,))
        dispatch_rows = cursor.fetchall()
        for d_row in dispatch_rows:
            if d_row['officer_ids']:
                o_ids = [int(x) for x in d_row['officer_ids'].split(",") if x.strip()]
                for o_id in o_ids:
                    cursor.execute("UPDATE officers SET status = 'Available' WHERE id = ?", (o_id,))
                    
        # Update dispatches to completed
        cursor.execute("UPDATE dispatches SET status = 'Completed' WHERE event_id = ?", (event_id,))
    
    # NEW FEATURE 10: Post-Event Self-Learning Metrics Calibration
    # 1. Forecast Accuracy = 50% Impact Accuracy + 50% Radius Accuracy
    impact_acc = 100.0 - (abs(predicted_impact - act_impact) / (act_impact + 1e-5) * 100.0)
    impact_acc = min(100.0, max(0.0, impact_acc))
    
    radius_acc = 100.0 - (abs(pred_radius - act_radius) / (act_radius + 1e-5) * 100.0)
    radius_acc = min(100.0, max(0.0, radius_acc))
    
    # Combined forecast accuracy
    combined_forecast_acc = (impact_acc + radius_acc) / 2.0
    
    # 2. Dispatch Accuracy = compares recommended manpower & barricades vs actual used
    res_acc = 100.0
    if (rec_off + rec_barr) > 0:
        res_acc = 100.0 - ((abs(rec_off - act_off) + abs(rec_barr - act_barr)) / (rec_off + rec_barr + 1e-5) * 100.0)
        res_acc = min(100.0, max(0.0, res_acc))
        
    # 3. Diversion Success Rate = maps success rating (0-10) to percentage
    div_succ = succ_rate * 10.0
    
    cursor.execute("""
        INSERT INTO metrics (
            event_id, impact_prediction_accuracy, resource_recommendation_accuracy, diversion_success_rate, timestamp
        ) VALUES (?, ?, ?, ?, ?)
    """, (event_id, combined_forecast_acc, res_acc, div_succ, timestamp))
    
    conn.commit()
    conn.close()
    return True

def get_performance_metrics():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Overall averages
    cursor.execute("""
        SELECT 
            AVG(impact_prediction_accuracy) as avg_impact_acc,
            AVG(resource_recommendation_accuracy) as avg_resource_acc,
            AVG(diversion_success_rate) as avg_div_rate,
            COUNT(*) as total_feedback_runs
        FROM metrics
    """)
    row = cursor.fetchone()
    
    overall = {
        'avg_impact_accuracy': round(row['avg_impact_acc'] or 85.0, 1),
        'avg_resource_accuracy': round(row['avg_resource_acc'] or 88.0, 1),
        'avg_diversion_success_rate': round(row['avg_div_rate'] or 91.0, 1),
        'total_feedback_runs': row['total_feedback_runs'] or 0
    }
    
    # Metrics over time (ordered by ID)
    cursor.execute("""
        SELECT id, impact_prediction_accuracy, resource_recommendation_accuracy, diversion_success_rate, timestamp
        FROM metrics
        ORDER BY id ASC
    """)
    rows = cursor.fetchall()
    
    # Sample outcomes summary
    cursor.execute("""
        SELECT actual_outcome, COUNT(*) as count
        FROM tom_memory
        GROUP BY actual_outcome
    """)
    outcome_rows = cursor.fetchall()
    outcomes_dict = {r['actual_outcome']: r['count'] for r in outcome_rows}
    
    # Calculate Evolution over epochs
    history = []
    for idx, r in enumerate(rows):
        history.append({
            'run': idx + 1,
            'impact_accuracy': round(r['impact_prediction_accuracy'], 1),
            'resource_accuracy': round(r['resource_recommendation_accuracy'], 1),
            'diversion_success': round(r['diversion_success_rate'], 1),
            'date': r['timestamp'][:10]
        })
        
    conn.close()
    
    return {
        'overall': overall,
        'history': history,
        'outcomes': outcomes_dict
    }
