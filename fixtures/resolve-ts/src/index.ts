import React from "react";
import { Button } from "./barrel";
import { formatData } from "./utils";
import { Button as ButtonAlias } from "@components/button";
import { a } from "./cycle_a";

export function run(): void {
    console.log(React, Button, formatData("test"), ButtonAlias, a);
}
