export function importedHelper(x: number): number {
  return x * 2;
}

export class BaseService {
  public baseName: string;

  constructor(name: string) {
    this.baseName = name;
  }

  public getBaseName(): string {
    return this.baseName;
  }
}

