import { assertEquals } from "@std/assert";
import { name } from "../src/widget-provider.ts";

Deno.test("sanity check", () => {
	assertEquals(name(), "it works");
});
