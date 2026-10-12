import os
import tempfile

# Isolate tests from the developer database and background threads. Must run before app imports.
_db_dir = tempfile.mkdtemp(prefix="ritos-test-")
os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(_db_dir, "test.db").replace("\\", "/")
os.environ["DB_SCHEMA"] = ""
os.environ["RUN_BACKGROUND_WORKERS"] = "false"
os.environ["APP_ENV"] = "development"
os.environ["RITOS_API_KEY"] = "test-key"
os.environ["SEED_PASSWORD"] = "ChangeMe123!"
os.environ["AUTO_APPROVE_MAX_INR"] = "5000"
