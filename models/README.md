# Models

This directory stores the serialized machine learning model artifacts loaded by the FastAPI backend at startup. It contains the neighborhood classification model (`neighborhood_classifier.joblib`, a scikit-learn Random Forest) and the three future value regression models (`regression_6mo.joblib`, `regression_1yr.joblib`, `regression_3yr.joblib`, each an XGBoost Regressor). Models are trained offline via the scripts in `backend/scripts/` and should not be committed to Git if they exceed 100MB — document a download step instead.

# test