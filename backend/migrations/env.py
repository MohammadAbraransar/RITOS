from logging.config import fileConfig
from alembic import context
from sqlalchemy import text
# Reuse the app's engine: it normalizes the driver, handles URL-encoded passwords
# (alembic.ini interpolation would choke on "%40"), pooler settings and the DB_SCHEMA translation.
from app.database import Base, engine, db_schema, database_url
from app import models  # noqa: F401  (register models on Base.metadata)

config = context.config
if config.config_file_name:
    fileConfig(config.config_file_name)
target_metadata = Base.metadata
version_table_schema = db_schema or None

def run_migrations_offline():
    context.configure(url=database_url, target_metadata=target_metadata, literal_binds=True, compare_type=True,
                      version_table_schema=version_table_schema)
    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online():
    with engine.connect() as connection:
        if db_schema:
            connection.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{db_schema}"'))
            # Autogenerate reflects the default schema: make that the RITOS schema, not "public".
            connection.execute(text(f'SET search_path TO "{db_schema}"'))
            connection.commit()
        # alembic_version lives in the RITOS schema via the search_path above.
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
