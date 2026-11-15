import { a } from "./barrel";

export function run(client: any): string {
    client.notify("cycle starting");
    return a;
}

