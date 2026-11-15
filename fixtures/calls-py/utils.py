def imported_helper(x: int) -> int:
    return x * 2

class BaseService:
    def __init__(self, name: str):
        self.base_name = name

    def get_base_name(self) -> str:
        return self.base_name

