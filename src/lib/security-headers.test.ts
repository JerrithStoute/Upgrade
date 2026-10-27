import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileStorageOrigin, securityHeaders } from "./security-headers";

const csp = (h: { key: string; value: string }[]) => h.find((x) => x.key === "Content-Security-Policy")!.value;
const directive = (policy: string, name: string) => policy.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("security headers", () => {
  it("let the browser fetch, show and upload files straight to file storage (files direct)", () => {
    const policy = csp(securityHeaders(true, fileStorageOrigin({ S3_ENDPOINT: "https://abc123.r2.cloudflarestorage.com/" } as unknown as NodeJS.ProcessEnv, true)));
    for (const d of ["connect-src", "img-src", "media-src"]) assert.match(directive(policy, d), /https:\/\/abc123\.r2\.cloudflarestorage\.com(\s|$)/, d);
  });
  it("online with no storage address set: any R2 address; on this PC with none: nothing extra", () => {
    assert.equal(fileStorageOrigin({} as unknown as NodeJS.ProcessEnv, true), "https://*.r2.cloudflarestorage.com");
    assert.equal(fileStorageOrigin({} as unknown as NodeJS.ProcessEnv, false), "");
    assert.equal(directive(csp(securityHeaders(false, "")), "connect-src"), "connect-src 'self'");
  });
});
