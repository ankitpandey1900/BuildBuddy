__all__ = ["public_api"]

DEFAULT_RETRIES = 3

def public_api() -> bool:
    """Public function included in __all__."""
    return True

def internal_worker() -> bool:
    """Not in __all__, should not be exported."""
    return False
