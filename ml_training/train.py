import os
import sqlite3
import numpy as np
import pandas as pd
import joblib
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import mean_squared_error, r2_score
from sentence_transformers import SentenceTransformer

# 1. Config and Directories
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "event_dna.db")
MODEL_PATH = os.path.join(BASE_DIR, "impact_model.joblib")
PREPROCESSORS_PATH = os.path.join(BASE_DIR, "preprocessors.joblib")
CURVES_DIR = os.path.join(os.path.dirname(__file__), "learning_curves")
CURVES_DIR2 = os.path.join(BASE_DIR, "frontend", "public", "learning_curves")

os.makedirs(CURVES_DIR, exist_ok=True)
os.makedirs(CURVES_DIR2, exist_ok=True)

print("Initializing EventDNA AI Training Pipeline (generating real learning curves)...")

# 2. Fetch Data from SQLite
if not os.path.exists(DB_PATH):
    raise FileNotFoundError(f"Database event_dna.db not found at {DB_PATH}")

conn = sqlite3.connect(DB_PATH)
query = """
    SELECT event_cause, event_type, zone, junction, requires_road_closure, duration, priority, impact_score
    FROM events
"""
df = pd.read_sql_query(query, conn)
conn.close()

print(f"Loaded {len(df)} historical events from database.")

# 3. Text Descriptions Generation for S-BERT
def generate_description(row):
    planned_str = "A planned" if str(row['event_type']).lower() == 'planned' else "An unplanned"
    cause = str(row['event_cause']).replace('_', ' ')
    zone_str = f" in {row['zone']}" if row['zone'] and str(row['zone']).lower() != 'unknown zone' else ""
    junction_str = f" at {row['junction']}" if row['junction'] and str(row['junction']).lower() != 'unknown junction' else ""
    closure_str = " requiring road closure" if row['requires_road_closure'] else " with no road closure"
    duration_str = f" and lasting approximately {int(row['duration'])} minutes" if row['duration'] and row['duration'] > 0 else ""
    return f"{planned_str} {cause} event{zone_str}{junction_str}{closure_str}{duration_str}."

df['description'] = df.apply(generate_description, axis=1)

# 4. Generate Sentence-BERT Embeddings (with cache logic for ultra fast retrains)
EMBEDDINGS_CACHE = os.path.join(os.path.dirname(__file__), "embeddings_cache.joblib")

if os.path.exists(EMBEDDINGS_CACHE):
    try:
        cached_embeddings = joblib.load(EMBEDDINGS_CACHE)
        if len(cached_embeddings) == len(df):
            print("Loading S-BERT embeddings from cache...")
            embeddings = cached_embeddings
        elif len(df) > len(cached_embeddings):
            print(f"Incremental S-BERT encoding for {len(df) - len(cached_embeddings)} new events...")
            sbert_model = SentenceTransformer('all-MiniLM-L6-v2')
            new_desc = df['description'].iloc[len(cached_embeddings):].tolist()
            new_embeds = sbert_model.encode(new_desc, show_progress_bar=False)
            embeddings = np.vstack([cached_embeddings, new_embeds])
            joblib.dump(embeddings, EMBEDDINGS_CACHE)
        else:
            print("Encoding event descriptions with Sentence-BERT (DB reset/shrink detected)...")
            sbert_model = SentenceTransformer('all-MiniLM-L6-v2')
            descriptions = df['description'].tolist()
            embeddings = sbert_model.encode(descriptions, show_progress_bar=False)
            embeddings = np.array(embeddings).astype('float32')
            joblib.dump(embeddings, EMBEDDINGS_CACHE)
    except Exception as e:
        print(f"Cache read error: {e}. Re-encoding all...")
        sbert_model = SentenceTransformer('all-MiniLM-L6-v2')
        descriptions = df['description'].tolist()
        embeddings = sbert_model.encode(descriptions, show_progress_bar=False)
        embeddings = np.array(embeddings).astype('float32')
        joblib.dump(embeddings, EMBEDDINGS_CACHE)
else:
    print("Encoding event descriptions with Sentence-BERT...")
    sbert_model = SentenceTransformer('all-MiniLM-L6-v2')
    descriptions = df['description'].tolist()
    embeddings = sbert_model.encode(descriptions, show_progress_bar=False)
    embeddings = np.array(embeddings).astype('float32')
    joblib.dump(embeddings, EMBEDDINGS_CACHE)

# 5. Tabular Feature Encoding
categorical_cols = ['event_cause', 'event_type', 'zone', 'junction', 'priority']
encoders = {}
for col in categorical_cols:
    le = LabelEncoder()
    unique_vals = list(df[col].dropna().unique()) + ['Unknown']
    le.fit(unique_vals)
    df[col] = df[col].apply(lambda x: x if x in le.classes_ else 'Unknown')
    df[f'{col}_encoded'] = le.transform(df[col])
    encoders[col] = le

tabular_features = df[[f'{col}_encoded' for col in categorical_cols]].values
closure_features = df['requires_road_closure'].values.reshape(-1, 1)

# Combined Feature Matrix
X = np.hstack([tabular_features, closure_features, embeddings])
y = df['impact_score'].values

# Split
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Set plotting style
sns.set_theme(style="darkgrid")
plt.rcParams.update({
    'font.size': 10,
    'text.color': '#0f172a',
    'axes.labelcolor': '#0f172a'
})

# 6. Fit and Track Metrics over Epochs
n_estimators = 120
regressor = GradientBoostingRegressor(
    n_estimators=n_estimators,
    learning_rate=0.05,
    max_depth=6,
    min_samples_split=5,
    min_samples_leaf=4,
    random_state=42
)
regressor.fit(X_train, y_train)

# Calculate staged errors
train_loss = []
val_loss = []
for pred_train, pred_val in zip(regressor.staged_predict(X_train), regressor.staged_predict(X_test)):
    train_loss.append(mean_squared_error(y_train, pred_train))
    val_loss.append(mean_squared_error(y_test, pred_val))

epochs = np.arange(1, n_estimators + 1)

# Helper to save to both locations
def save_plot(name):
    plt.tight_layout()
    plt.savefig(os.path.join(CURVES_DIR, name), dpi=150)
    plt.savefig(os.path.join(CURVES_DIR2, name), dpi=150)
    plt.close()

# --- Curve 1: Train & Val Loss ---
plt.figure(figsize=(6, 4))
plt.plot(epochs, train_loss, label='Train MSE', color='#3b82f6', linewidth=2)
plt.plot(epochs, val_loss, label='Validation MSE', color='#ef4444', linewidth=2)
best_epoch = np.argmin(val_loss) + 1
plt.axvline(x=best_epoch, color='#10b981', linestyle='--', label=f'Best Epoch ({best_epoch})')
plt.title("1. Training & Validation Loss Curve")
plt.xlabel("Boosting Iterations (Epochs)")
plt.ylabel("Loss (MSE)")
plt.legend()
save_plot("loss_curve.png")

# --- Curve 2: RMSE Curve ---
plt.figure(figsize=(6, 4))
plt.plot(epochs, np.sqrt(train_loss), label='Train RMSE', color='#6366f1', linewidth=2)
plt.plot(epochs, np.sqrt(val_loss), label='Validation RMSE', color='#f59e0b', linewidth=2)
plt.title("2. Root Mean Squared Error (RMSE) Curve")
plt.xlabel("Epochs")
plt.ylabel("RMSE")
plt.legend()
save_plot("rmse_curve.png")

# --- Curve 3: R2 Score Curve ---
plt.figure(figsize=(6, 4))
train_r2 = [r2_score(y_train, p) for p in regressor.staged_predict(X_train)]
val_r2 = [r2_score(y_test, p) for p in regressor.staged_predict(X_test)]
plt.plot(epochs, train_r2, label='Train R²', color='#10b981', linewidth=2)
plt.plot(epochs, val_r2, label='Validation R²', color='#8b5cf6', linewidth=2)
plt.title("3. R-squared (R²) Accuracy Curve")
plt.xlabel("Epochs")
plt.ylabel("R² Score")
plt.legend()
save_plot("r2_curve.png")

# --- Curve 4: Learning Rate Schedule ---
plt.figure(figsize=(6, 4))
plt.plot(epochs, np.full_like(epochs, 0.05, dtype=float), color='#ec4899', linewidth=2, label='Base LR')
plt.title("4. Learning Rate Schedule")
plt.xlabel("Epochs")
plt.ylabel("Learning Rate")
plt.legend()
save_plot("lr_decay.png")

# --- Curve 5: Complexity Curve (Max Depth Tuning) ---
print("Computing model complexity curve...")
depths = np.arange(1, 11)
train_depth_scores = []
val_depth_scores = []
for d in depths:
    temp_reg = GradientBoostingRegressor(n_estimators=50, max_depth=d, random_state=42)
    temp_reg.fit(X_train, y_train)
    train_depth_scores.append(r2_score(y_train, temp_reg.predict(X_train)))
    val_depth_scores.append(r2_score(y_test, temp_reg.predict(X_test)))

plt.figure(figsize=(6, 4))
plt.plot(depths, train_depth_scores, 'o-', label='Train R²', color='#2563eb')
plt.plot(depths, val_depth_scores, 'o-', label='Validation R²', color='#ea580c')
plt.title("5. Model Complexity Curve (Max Depth)")
plt.xlabel("Max Depth")
plt.ylabel("R² Score")
plt.legend()
save_plot("complexity_curve.png")

# --- Curve 6: Feature Importance weights ---
importances = regressor.feature_importances_
tab_imp = importances[:len(categorical_cols)]
closure_imp = importances[len(categorical_cols):len(categorical_cols)+1]
embed_imp = np.sum(importances[len(categorical_cols)+1:])

feat_names = categorical_cols + ['requires_road_closure', 'S-BERT Embeddings']
feat_imp = list(tab_imp) + list(closure_imp) + [embed_imp]

plt.figure(figsize=(6, 4))
sns.barplot(x=feat_imp, y=feat_names, palette="viridis", hue=feat_names, legend=False)
plt.title("6. Feature Importance Weights")
plt.xlabel("Relative Importance Score")
save_plot("feature_importance.png")

# --- Curve 7: Residuals ---
y_pred = regressor.predict(X_test)
residuals = y_test - y_pred
plt.figure(figsize=(6, 4))
plt.scatter(y_pred, residuals, alpha=0.6, color='#475569', edgecolors='none', s=20)
plt.axhline(y=0, color='#ef4444', linestyle='--')
plt.title("7. Residuals Plot (Model Fit Analysis)")
plt.xlabel("Predicted Traffic Impact Score")
plt.ylabel("Residuals")
save_plot("residuals_plot.png")

# Save models
joblib.dump(regressor, MODEL_PATH)
joblib.dump(encoders, PREPROCESSORS_PATH)
print("All 7 learning curves generated directly from real training run.")
