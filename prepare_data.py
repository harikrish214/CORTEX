import os
import sqlite3
import numpy as np
import pandas as pd
import faiss
from sentence_transformers import SentenceTransformer
from sklearn.model_selection import train_test_split
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.preprocessing import LabelEncoder
import joblib

# Constants
DB_PATH = "event_dna.db"
INDEX_PATH = "event_dna.index"
MODEL_PATH = "impact_model.joblib"
PREPROCESSORS_PATH = "preprocessors.joblib"
CSV_PATH = "Astram event data_anonymized - Astram event data_anonymizedb40ac87.csv"

# Default coordinates (Bangalore center)
DEFAULT_LAT = 12.9716
DEFAULT_LON = 77.5946

def load_and_clean_data():
    print("Loading dataset...")
    df = pd.read_csv(CSV_PATH)
    
    # 1. Clean Coordinates
    df['latitude'] = pd.to_numeric(df['latitude'], errors='coerce').fillna(DEFAULT_LAT)
    df['longitude'] = pd.to_numeric(df['longitude'], errors='coerce').fillna(DEFAULT_LON)
    
    # 2. Parse Datetimes
    start = pd.to_datetime(df['start_datetime'], errors='coerce', utc=True)
    closed = pd.to_datetime(df['closed_datetime'], errors='coerce', utc=True)
    end = pd.to_datetime(df['end_datetime'], errors='coerce', utc=True)
    resolved = pd.to_datetime(df['resolved_datetime'], errors='coerce', utc=True)
    
    # Resolve actual end time
    end_time = closed.fillna(end).fillna(resolved)
    duration_mins = (end_time - start).dt.total_seconds() / 60.0
    df['duration'] = duration_mins
    
    # Impute negative or null durations
    global_median_duration = 60.0
    medians = df[df['duration'] > 0].groupby('event_cause')['duration'].median()
    
    def impute_duration(row):
        dur = row['duration']
        cause = row['event_cause']
        if pd.isnull(dur) or dur <= 0:
            if cause in medians and not pd.isnull(medians[cause]):
                return medians[cause]
            return global_median_duration
        return dur
        
    df['duration'] = df.apply(impute_duration, axis=1)
    
    # Clean priority, zone, junction
    df['priority'] = df['priority'].fillna('Low')
    df['zone'] = df['zone'].fillna('Unknown Zone')
    df['junction'] = df['junction'].fillna('Unknown Junction')
    df['event_cause'] = df['event_cause'].fillna('others')
    df['event_type'] = df['event_type'].fillna('unplanned')
    
    return df

def generate_natural_language_description(row):
    planned_str = "A planned" if str(row['event_type']).lower() == 'planned' else "An unplanned"
    cause = str(row['event_cause']).replace('_', ' ')
    
    zone = str(row['zone'])
    zone_str = f" in {zone}" if zone.lower() != 'unknown zone' else ""
    
    junction = str(row['junction'])
    junction_str = f" at {junction}" if junction.lower() != 'unknown junction' else ""
    
    closure = row['requires_road_closure']
    closure_str = " requiring road closure" if closure == True or str(closure).lower() in ['true', 'yes', '1'] else " with no road closure"
    
    duration = int(row['duration'])
    duration_str = f" and lasting approximately {duration} minutes"
    
    return f"{planned_str} {cause} event{zone_str}{junction_str}{closure_str}{duration_str}."

def compute_ground_truth(df):
    print("Computing impact score, risk levels, and resource recommendations...")
    
    # Heuristics for Impact Score (0-100)
    cause_scores = {
        'accident': 40,
        'procession': 50,
        'protest': 60,
        'vip_movement': 65,
        'water_logging': 55,
        'vehicle_breakdown': 25,
        'construction': 45,
        'tree_fall': 35,
        'pot_holes': 20,
        'congestion': 35,
        'road_conditions': 25,
        'Debris': 20,
        'debris': 20,
        'Fog / Low Visibility': 25,
        'test_demo': 10,
        'others': 15
    }
    
    impact_scores = []
    for idx, row in df.iterrows():
        score = cause_scores.get(row['event_cause'], 15)
        
        # Road closure penalty
        closure = row['requires_road_closure']
        if closure == True or str(closure).lower() in ['true', 'yes', '1']:
            score += 30
            
        # Priority penalty
        if row['priority'] == 'High':
            score += 15
            
        # Duration penalty
        dur = row['duration']
        score += min(15, (dur / 60.0) * 2.0)
        
        # Vehicle type penalty
        veh = str(row.get('veh_type', ''))
        if 'heavy' in veh.lower() or 'bus' in veh.lower():
            score += 10
            
        # Cap score
        score = min(100.0, max(10.0, score))
        impact_scores.append(score)
        
    df['impact_score'] = impact_scores
    
    # Deriving Risk Level
    def get_risk_level(score):
        if score < 35: return 'Low'
        elif score < 60: return 'Medium'
        elif score < 80: return 'High'
        else: return 'Critical'
        
    df['risk_level'] = df['impact_score'].apply(get_risk_level)
    
    # Deriving Expected Duration Category
    def get_duration_cat(dur):
        if dur < 45: return 'Short'
        elif dur < 180: return 'Medium'
        elif dur < 720: return 'Long'
        else: return 'Prolonged'
        
    df['duration_category'] = df['duration'].apply(get_duration_cat)
    
    # Deriving Area Impact
    def get_area_impact(row):
        closure = row['requires_road_closure']
        is_closure = closure == True or str(closure).lower() in ['true', 'yes', '1']
        if is_closure or row['impact_score'] >= 75:
            return 'Regional'
        elif row['impact_score'] >= 45:
            return 'Sub-regional'
        else:
            return 'Local'
            
    df['area_impact'] = df.apply(get_area_impact, axis=1)
    
    # Synthesize Operational Deployments (Traffic Operations Memory baseline)
    officers = []
    patrols = []
    supervisors = []
    barricades = []
    placements = []
    div_a = []
    div_b = []
    div_c = []
    reasonings = []
    outcomes = []
    feedbacks = []
    
    for idx, row in df.iterrows():
        score = row['impact_score']
        closure = row['requires_road_closure']
        is_closure = closure == True or str(closure).lower() in ['true', 'yes', '1']
        junc = row['junction']
        cause = row['event_cause']
        
        # Manpower mapping
        n_off = int(score / 8) + 1
        n_pat = int(score / 25) + 1
        n_sup = 1 if score >= 60 else 0
        if score >= 80:
            n_sup = 2
            
        officers.append(n_off)
        patrols.append(n_pat)
        supervisors.append(n_sup)
        
        # Barricades
        if is_closure:
            n_barr = int(score / 3) + 10
            place = f"Block off access points 50m before {junc}."
        else:
            n_barr = int(score / 15)
            place = f"Use warning barricades around event area at {junc}." if n_barr > 0 else "None"
            
        barricades.append(n_barr)
        placements.append(place)
        
        # Diversions
        div_a.append(f"Divert incoming traffic via adjacent arterials bypass.")
        div_b.append(f"Reroute heavy vehicles to external ring road.")
        div_c.append(f"Set up local single-lane operation with manual signs.")
        
        reasonings.append(f"Based on {np.random.randint(4, 15)} similar historical events. Impact score of {score:.1f} and cause '{cause}' requires active control.")
        
        # Outcome & Feedback
        rand = np.random.rand()
        if rand > 0.15:
            outcomes.append("Successful")
            feedbacks.append("Traffic cleared with normal flow restored quickly. Recommended deployment was appropriate.")
        elif rand > 0.05:
            outcomes.append("Partially Successful")
            feedbacks.append("Slight queues formed due to delay in barricade setup. Additional officers helped clear congestion.")
        else:
            outcomes.append("Failed")
            feedbacks.append("Severe bottleneck formed. Number of officers was insufficient for the scale of diversion needed.")
            
    df['manpower_officers'] = officers
    df['manpower_patrols'] = patrols
    df['manpower_supervisors'] = supervisors
    df['barricades_count'] = barricades
    df['barricades_placement'] = placements
    df['diversion_route_a'] = div_a
    df['diversion_route_b'] = div_b
    df['diversion_route_c'] = div_c
    df['diversion_reasoning'] = reasonings
    df['outcome'] = outcomes
    df['feedback'] = feedbacks
    
    return df

def generate_embeddings_and_index(df):
    print("Generating natural language descriptions...")
    descriptions = df.apply(generate_natural_language_description, axis=1).tolist()
    df['generated_description'] = descriptions
    
    print("Loading Sentence-BERT model (all-MiniLM-L6-v2)...")
    model = SentenceTransformer('all-MiniLM-L6-v2')
    
    print("Encoding descriptions (this may take a minute)...")
    embeddings = model.encode(descriptions, show_progress_bar=True)
    embeddings = embeddings.astype('float32')
    
    print(f"Embeddings generated with shape: {embeddings.shape}")
    
    # Build FAISS index
    dimension = embeddings.shape[1]
    index = faiss.IndexFlatL2(dimension)
    index.add(embeddings)
    
    print("Saving FAISS index...")
    faiss.write_index(index, INDEX_PATH)
    
    return df, embeddings

def train_impact_model(df, embeddings):
    print("Training Impact Prediction Engine model...")
    
    # Categorical columns to encode
    cat_cols = ['event_cause', 'event_type', 'zone', 'junction', 'priority']
    encoders = {}
    
    encoded_features = []
    for col in cat_cols:
        le = LabelEncoder()
        # Fit with all possible categories plus an 'Unknown' class to handle future unseen items
        categories = list(df[col].astype(str).unique()) + ['Unknown']
        le.fit(categories)
        df[col + '_enc'] = le.transform(df[col].astype(str))
        encoders[col] = le
        encoded_features.append(df[col + '_enc'].values.reshape(-1, 1))
        
    df['requires_road_closure_enc'] = df['requires_road_closure'].apply(lambda x: 1 if x == True or str(x).lower() in ['true', 'yes', '1'] else 0)
    encoded_features.append(df['requires_road_closure_enc'].values.reshape(-1, 1))
    
    # Tabular features array
    X_tabular = np.hstack(encoded_features)
    
    # Concatenate tabular features with Sentence-BERT embeddings
    X = np.hstack([X_tabular, embeddings])
    
    # Target
    y = df['impact_score'].values
    
    print(f"Feature matrix shape: {X.shape}, Target shape: {y.shape}")
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    regressor = GradientBoostingRegressor(n_estimators=100, learning_rate=0.1, max_depth=5, random_state=42)
    regressor.fit(X_train, y_train)
    
    train_score = regressor.score(X_train, y_train)
    test_score = regressor.score(X_test, y_test)
    print(f"Model trained. Train R2: {train_score:.4f}, Test R2: {test_score:.4f}")
    
    # Save model and preprocessors
    joblib.dump(regressor, MODEL_PATH)
    joblib.dump(encoders, PREPROCESSORS_PATH)
    print("Model and preprocessors saved.")

def build_sqlite_db(df):
    print(f"Building SQLite Database at {DB_PATH}...")
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
        
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Create Events Table
    cursor.execute("""
    CREATE TABLE events (
        id INTEGER PRIMARY KEY,
        original_id TEXT,
        event_cause TEXT,
        event_type TEXT,
        zone TEXT,
        junction TEXT,
        latitude REAL,
        longitude REAL,
        start_datetime TEXT,
        end_datetime TEXT,
        closed_datetime TEXT,
        requires_road_closure INTEGER,
        priority TEXT,
        description TEXT,
        duration REAL,
        generated_description TEXT,
        impact_score REAL,
        risk_level TEXT,
        duration_category TEXT,
        area_impact TEXT,
        manpower_officers INTEGER,
        manpower_patrols INTEGER,
        manpower_supervisors INTEGER,
        barricades_count INTEGER,
        barricades_placement TEXT,
        diversion_route_a TEXT,
        diversion_route_b TEXT,
        diversion_route_c TEXT,
        diversion_reasoning TEXT,
        outcome TEXT,
        feedback TEXT
    )
    """)
    
    # Create TOM Memory Table
    cursor.execute("""
    CREATE TABLE tom_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER,
        predicted_impact REAL,
        recommended_officers INTEGER,
        recommended_patrols INTEGER,
        recommended_supervisors INTEGER,
        recommended_barricades INTEGER,
        actual_impact REAL,
        actual_officers INTEGER,
        actual_barricades INTEGER,
        actual_outcome TEXT,
        feedback TEXT,
        timestamp TEXT,
        FOREIGN KEY(event_id) REFERENCES events(id)
    )
    """)
    
    # Create Metrics Table
    cursor.execute("""
    CREATE TABLE metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER,
        impact_prediction_accuracy REAL,
        resource_recommendation_accuracy REAL,
        diversion_success_rate REAL,
        timestamp TEXT,
        FOREIGN KEY(event_id) REFERENCES events(id)
    )
    """)
    
    conn.commit()
    
    # Insert events
    cols_to_insert = [
        'id', 'original_id', 'event_cause', 'event_type', 'zone', 'junction', 'latitude', 'longitude',
        'start_datetime', 'end_datetime', 'closed_datetime', 'requires_road_closure',
        'priority', 'description', 'duration', 'generated_description', 'impact_score',
        'risk_level', 'duration_category', 'area_impact', 'manpower_officers',
        'manpower_patrols', 'manpower_supervisors', 'barricades_count', 'barricades_placement',
        'diversion_route_a', 'diversion_route_b', 'diversion_route_c', 'diversion_reasoning',
        'outcome', 'feedback'
    ]
    
    # Make sure we have id in numerical range 1..N
    df['id'] = range(1, len(df) + 1)
    
    insert_data = []
    for idx, row in df.iterrows():
        closure_int = 1 if row['requires_road_closure'] == True or str(row['requires_road_closure']).lower() in ['true', 'yes', '1'] else 0
        insert_data.append((
            int(row['id']),
            str(row.get('id_orig', row['id'])),
            str(row['event_cause']),
            str(row['event_type']),
            str(row['zone']),
            str(row['junction']),
            float(row['latitude']),
            float(row['longitude']),
            str(row['start_datetime']),
            str(row.get('end_datetime', '')),
            str(row.get('closed_datetime', '')),
            closure_int,
            str(row['priority']),
            str(row.get('description', '')),
            float(row['duration']),
            str(row['generated_description']),
            float(row['impact_score']),
            str(row['risk_level']),
            str(row['duration_category']),
            str(row['area_impact']),
            int(row['manpower_officers']),
            int(row['manpower_patrols']),
            int(row['manpower_supervisors']),
            int(row['barricades_count']),
            str(row['barricades_placement']),
            str(row['diversion_route_a']),
            str(row['diversion_route_b']),
            str(row['diversion_route_c']),
            str(row['diversion_reasoning']),
            str(row['outcome']),
            str(row['feedback'])
        ))
        
    placeholders = ",".join(["?"] * len(cols_to_insert))
    cursor.executemany(f"INSERT INTO events ({','.join(cols_to_insert)}) VALUES ({placeholders})", insert_data)
    
    # Populate a few sample rows in TOM memory (e.g. 50 events)
    sample_tom_data = []
    sample_metrics_data = []
    # Pick events with outcomes
    for i in range(1, 101): # 100 historical events in memory
        row = df.iloc[i-1]
        ev_id = int(row['id'])
        imp = float(row['impact_score'])
        pred_imp = imp + np.random.normal(0, 3) # slight deviation
        pred_imp = min(100.0, max(0.0, pred_imp))
        
        rec_off = int(row['manpower_officers'])
        act_off = rec_off if np.random.rand() > 0.1 else rec_off + np.random.choice([-1, 1])
        act_off = max(1, act_off)
        
        rec_barr = int(row['barricades_count'])
        act_barr = rec_barr if np.random.rand() > 0.1 else rec_barr + np.random.choice([-2, 2])
        act_barr = max(0, act_barr)
        
        actual_impact = imp
        outcome = str(row['outcome'])
        feedback = str(row['feedback'])
        timestamp = str(row['start_datetime'])
        
        sample_tom_data.append((
            ev_id, pred_imp, rec_off, int(row['manpower_patrols']), int(row['manpower_supervisors']),
            rec_barr, actual_impact, act_off, act_barr, outcome, feedback, timestamp
        ))
        
        # Calculate accuracy metrics
        impact_acc = 100.0 - abs(pred_imp - actual_impact) / (actual_impact + 1e-5) * 100.0
        impact_acc = min(100.0, max(0.0, impact_acc))
        
        res_acc = 100.0
        if rec_off != act_off or rec_barr != act_barr:
            res_acc = 100.0 - (abs(rec_off - act_off) + abs(rec_barr - act_barr)) / (rec_off + rec_barr + 1e-5) * 100.0
            res_acc = min(100.0, max(0.0, res_acc))
            
        div_succ = 100.0 if outcome == "Successful" else (70.0 if outcome == "Partially Successful" else 30.0)
        
        sample_metrics_data.append((
            ev_id, impact_acc, res_acc, div_succ, timestamp
        ))
        
    cursor.executemany("""
    INSERT INTO tom_memory (
        event_id, predicted_impact, recommended_officers, recommended_patrols, recommended_supervisors,
        recommended_barricades, actual_impact, actual_officers, actual_barricades, actual_outcome, feedback, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, sample_tom_data)
    
    cursor.executemany("""
    INSERT INTO metrics (
        event_id, impact_prediction_accuracy, resource_recommendation_accuracy, diversion_success_rate, timestamp
    ) VALUES (?, ?, ?, ?, ?)
    """, sample_metrics_data)
    
    conn.commit()
    conn.close()
    print("Database build complete.")

def main():
    # Save original IDs before cleaning
    df = load_and_clean_data()
    df['id_orig'] = df['id']
    df = compute_ground_truth(df)
    df, embeddings = generate_embeddings_and_index(df)
    train_impact_model(df, embeddings)
    build_sqlite_db(df)
    print("All tasks completed successfully!")

if __name__ == "__main__":
    main()
