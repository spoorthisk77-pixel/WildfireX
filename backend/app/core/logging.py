import logging
import sys
from typing import Optional


def configure_logging(level: int = logging.INFO) -> logging.Logger:
    logger = logging.getLogger("wildfirex")
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        formatter = logging.Formatter(
            "%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)
    logger.setLevel(level)
    logger.propagate = False
    return logger


def get_logger(name: Optional[str] = None) -> logging.Logger:
    base = configure_logging()
    if name:
        return base.getChild(name)
    return base
