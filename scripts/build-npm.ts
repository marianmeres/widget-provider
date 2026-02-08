import { npmBuild } from "@marianmeres/npmbuild";

const denoJson = JSON.parse(Deno.readTextFileSync("deno.json"));

await npmBuild({
	name: denoJson.name,
	version: denoJson.version,
	repository: denoJson.name.replace(/^@/, ""),
	dependencies: [
		"@marianmeres/store@^2",
		"@marianmeres/clog@^3",
		"@marianmeres/pubsub@^2",
	],
});
