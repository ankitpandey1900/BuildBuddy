import { importedHelper, BaseService } from "./utils";

export interface ICalculator {
  calculate(a: number, b: number): number;
}

export function directLocalHelper(a: number, b: number): number {
  return a + b;
}

// Function 1: simpleLinear
// CC = 1 (base) = 1
export function simpleLinear(x: number): number {
  const y = x * 2;
  return y + 1;
}

// Function 2: singleBranch
// CC = 1 (base) + 1 (if) = 2
export function singleBranch(x: number): string {
  if (x > 0) {
    return "positive";
  }
  return "non-positive";
}

// Function 3: compoundConditionWithEffects
// CC = 1 (base) + 1 (if) + 1 (&&) + 1 (||) = 4
export function compoundConditionWithEffects(a: boolean, b: boolean, c: boolean): boolean {
  if (a && (b || c)) {
    fetch("https://api.example.com/log");
    return true;
  }
  return false;
}

// Function 4: loopWithCatchAndFs
// CC = 1 (base) + 1 (for) + 1 (if) + 1 (catch) = 4
export function loopWithCatchAndFs(items: string[]): number {
  let count = 0;
  for (const item of items) {
    try {
      if (item.length > 5) {
        fs.readFile(item);
        count += 1;
      }
    } catch (err) {
      count -= 1;
    }
  }
  return count;
}

// Function 5: complexSwitchAndDynamic
// CC = 1 (base) + 1 (ternary) + 3 (case 1, 2, 3) = 5
export function complexSwitchAndDynamic(code: number, flag: boolean, obj: any, dynamicMethod: string): string {
  const prefix = flag ? "FLAG_" : "";

  // Dynamic call: obj[name]()
  obj[dynamicMethod]();

  // Dynamic builtin: eval()
  eval("console.log('dynamic')");

  switch (code) {
    case 1:
      return prefix + "ONE";
    case 2:
      return prefix + "TWO";
    case 3:
      db.query("SELECT * FROM items");
      return prefix + "THREE";
    default:
      return prefix + "UNKNOWN";
  }
}

// Function 6: callsDemonstration
// Covers direct calls, imported calls, unknown receiver, callback, unknown callee
export function callsDemonstration(
  client: any,
  callback: (n: number) => void
): void {
  // Direct call (confirmed)
  directLocalHelper(1, 2);

  // Imported call (confirmed)
  importedHelper(5);

  // Call on unknown receiver (inferred)
  client.fetchData();

  // Callback call on parameter (inferred)
  callback(100);

  // Unresolved / unknown global call (unknown)
  unresolvedGlobalFunction();
}

export class AdvancedCalculator extends BaseService implements ICalculator {
  public precision: number;

  constructor(name: string, precision: number) {
    super(name);
    this.precision = precision;
  }

  public internalCompute(val: number): number {
    return val * this.precision;
  }

  public calculate(a: number, b: number): number {
    // Call on this (confirmed)
    return this.internalCompute(a + b);
  }
}

export function runDemo(): void {
  // Instantiation of class (confirmed)
  const calc = new AdvancedCalculator("engine", 2);
  calc.calculate(10, 20);
}

