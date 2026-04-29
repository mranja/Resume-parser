from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import router
from app.database import Base, engine
from app.models import Candidate, JobPosting, MatchScore

_ = (Candidate, JobPosting, MatchScore)

app = FastAPI(
    title="Smart Recruitment & Resume Parser",
    description="Upload resume PDFs, extract skills with NLP, and rank candidates against job postings.",
    version="1.0.0",
)

app.include_router(router)
app.mount("/static", StaticFiles(directory="app/static"), name="static")


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)


@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    return FileResponse("app/static/index.html")
