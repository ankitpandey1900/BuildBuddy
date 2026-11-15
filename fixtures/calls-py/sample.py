from .utils import imported_helper, BaseService

def direct_local_helper(a: int, b: int) -> int:
    return a + b

# Function 1: py_linear
# CC = 1 (base) = 1
def py_linear(x: int) -> int:
    y = x * 2
    return y + 1

# Function 2: py_branch
# CC = 1 (base) + 1 (if) = 2
def py_branch(x: int) -> str:
    if x > 0:
        return "positive"
    return "non-positive"

# Function 3: py_compound_with_network
# CC = 1 (base) + 1 (if) + 1 (and) + 1 (or) = 4
def py_compound_with_network(a: bool, b: bool, c: bool) -> bool:
    if a and (b or c):
        requests.get("https://api.example.com/log")
        return True
    return False

# Function 4: py_loop_with_fs
# CC = 1 (base) + 1 (for) + 1 (if) + 1 (except) = 4
def py_loop_with_fs(items: list) -> int:
    count = 0
    for item in items:
        try:
            if len(item) > 5:
                open(item)
                count += 1
        except Exception:
            count -= 1
    return count

# Function 5: py_conditional_elif_db
# CC = 1 (base) + 1 (conditional) + 1 (if) + 1 (elif) = 4
def py_conditional_elif_db(code: int, flag: bool, obj: any, dynamic_method: str) -> str:
    prefix = "FLAG_" if flag else ""

    # Dynamic call: getattr(obj, dynamic_method)()
    getattr(obj, dynamic_method)()

    # Dynamic call: obj[name]()
    obj[dynamic_method]()

    if code == 1:
        return prefix + "ONE"
    elif code == 2:
        return prefix + "TWO"
    else:
        db.query("SELECT 1")
        return prefix + "OTHER"

# Function 6: py_calls_demonstration
def py_calls_demonstration(client, callback):
    # Direct call (confirmed)
    direct_local_helper(1, 2)

    # Imported call (confirmed)
    imported_helper(5)

    # Call on unknown receiver (inferred)
    client.fetch_data()

    # Callback call on parameter (inferred)
    callback(100)

    # Unresolved function (unknown)
    unresolved_external_func()

class AdvancedCalculator(BaseService):
    def __init__(self, name: str, precision: int):
        self.base_name = name
        self.precision = precision

    def internal_compute(self, val: int) -> int:
        return val * self.precision

    def calculate(self, a: int, b: int) -> int:
        # Call on self resolving to parent class method (static)
        self.get_base_name()
        # Call on self resolving to same class method (confirmed)
        return self.internal_compute(a + b)

def run_demo():
    # Instantiation of class (confirmed)
    calc = AdvancedCalculator("engine", 2)
    calc.calculate(10, 20)

