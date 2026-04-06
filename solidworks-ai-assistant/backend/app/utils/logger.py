import sys
from loguru import logger
from app.config import get_settings


def setup_logging() -> None:
    settings = get_settings()

    logger.remove()

    if settings.debug:
        fmt = (
            "<green>{time:HH:mm:ss}</green> | "
            "<level>{level: <8}</level> | "
            "<cyan>{name}</cyan>:<cyan>{line}</cyan> — "
            "<level>{message}</level>"
        )
        logger.add(sys.stderr, format=fmt, level="DEBUG", colorize=True)
    else:
        logger.add(
            sys.stderr,
            format="{time:YYYY-MM-DD HH:mm:ss} | {level} | {name}:{line} | {message}",
            level=settings.log_level,
            serialize=False,
        )

    logger.add(
        "data/logs/app.log",
        rotation="10 MB",
        retention="7 days",
        level="INFO",
        encoding="utf-8",
    )


def get_logger(name: str):
    return logger.bind(name=name)


app_logger = get_logger("ctm.assistant")
