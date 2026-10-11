from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
from .database import Base, engine
from . import models
from .api import router

app=FastAPI(title="RITOS API",version="0.1.0",description="Refund intelligence and ticket orchestration API")
origins=[x.strip() for x in settings.cors_origins.split(",") if x.strip()]
app.add_middleware(CORSMiddleware,allow_origins=origins,allow_credentials=True,allow_methods=["*"],allow_headers=["*"])
Base.metadata.create_all(bind=engine)
app.include_router(router)

@app.get("/")
def root():
    return {"name":"RITOS","version":"0.1.0","docs":"/docs","mode":settings.app_env}

@app.get("/health")
def health():
    return {"status":"ok","database":"configured","provider":"mock"}
