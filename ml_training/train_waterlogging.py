import os
import pandas as pd
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report

# Setup paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXCEL_PATH = os.path.join(BASE_DIR, "underpass.xlsx")
MODEL_PATH = os.path.join(BASE_DIR, "backend", "app", "waterlogging_model.joblib")

# Load Excel data
df = pd.read_excel(EXCEL_PATH)

# Features and target
X = df[['rainfall_3hr_mm', 'peak_intensity_mm_hr', 'drain_blockage_flag']]
y = df['is_flooded']

# Train Random Forest Classifier
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

model = RandomForestClassifier(n_estimators=50, max_depth=5, random_state=42)
model.fit(X_train, y_train)

# Evaluate
y_pred = model.predict(X_test)
acc = accuracy_score(y_test, y_pred)
print(f"Model accuracy on test set: {acc:.2f}")
print("Classification Report:")
print(classification_report(y_test, y_pred))

# Save the trained model
joblib.dump(model, MODEL_PATH)
print(f"Saved waterlogging model to {MODEL_PATH}")
