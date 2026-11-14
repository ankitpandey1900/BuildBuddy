import requests
from .utils import format_row
from .cycle_x import val_x

def execute():
    res = requests.get("https://example.com")
    return format_row(res.text) + val_x
