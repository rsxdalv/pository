import { describe, it } from "node:test";
import assert from "node:assert";
import {
  validateDebianPackage,
  sanitizePath,
  isValidPackageName,
  isValidVersion,
  isValidArchitecture,
} from "../src/services/debian-validator.js";

describe("Debian Validator", () => {
  describe("sanitizePath", () => {
    it("should remove path separators", () => {
      assert.strictEqual(sanitizePath("foo/bar"), "foobar");
      assert.strictEqual(sanitizePath("foo\\bar"), "foobar");
    });

    it("should remove parent directory references", () => {
      assert.strictEqual(sanitizePath(".."), "");
      assert.strictEqual(sanitizePath("../foo"), "foo");
      assert.strictEqual(sanitizePath("foo/../bar"), "foobar");
    });

    it("should remove leading dots", () => {
      assert.strictEqual(sanitizePath(".hidden"), "hidden");
      assert.strictEqual(sanitizePath("...foo"), "foo");
    });

    it("should handle normal names", () => {
      assert.strictEqual(sanitizePath("normal-name"), "normal-name");
      assert.strictEqual(sanitizePath("package_1.0.0"), "package_1.0.0");
    });
  });

  describe("isValidPackageName", () => {
    it("should accept valid names", () => {
      assert.strictEqual(isValidPackageName("package"), true);
      assert.strictEqual(isValidPackageName("lib-foo"), true);
      assert.strictEqual(isValidPackageName("lib+foo"), true);
      assert.strictEqual(isValidPackageName("lib.foo"), true);
      assert.strictEqual(isValidPackageName("0ad"), true);
    });

    it("should reject invalid names", () => {
      assert.strictEqual(isValidPackageName(""), false);
      assert.strictEqual(isValidPackageName("-foo"), false);
      assert.strictEqual(isValidPackageName(".foo"), false);
      assert.strictEqual(isValidPackageName("foo bar"), false);
      assert.strictEqual(isValidPackageName("foo/bar"), false);
    });
  });

  describe("isValidVersion", () => {
    it("should accept valid versions", () => {
      assert.strictEqual(isValidVersion("1.0.0"), true);
      assert.strictEqual(isValidVersion("1.0.0-1"), true);
      assert.strictEqual(isValidVersion("1:1.0.0"), true);
      assert.strictEqual(isValidVersion("1.0.0~beta1"), true);
      assert.strictEqual(isValidVersion("2.0+dfsg1"), true);
    });

    it("should reject invalid versions", () => {
      assert.strictEqual(isValidVersion(""), false);
      assert.strictEqual(isValidVersion("-1.0.0"), false);
      assert.strictEqual(isValidVersion("1.0.0 "), false);
    });
  });

  describe("isValidArchitecture", () => {
    it("should accept valid architectures", () => {
      assert.strictEqual(isValidArchitecture("all"), true);
      assert.strictEqual(isValidArchitecture("amd64"), true);
      assert.strictEqual(isValidArchitecture("arm64"), true);
      assert.strictEqual(isValidArchitecture("i386"), true);
      assert.strictEqual(isValidArchitecture("armhf"), true);
    });

    it("should accept custom architectures matching pattern", () => {
      assert.strictEqual(isValidArchitecture("custom-arch"), true);
    });

    it("should reject invalid architectures", () => {
      assert.strictEqual(isValidArchitecture(""), false);
      assert.strictEqual(isValidArchitecture("123"), false);
      assert.strictEqual(isValidArchitecture("-invalid"), false);
    });
  });

  describe("validateDebianPackage", () => {
    it("should reject non-ar archives", async () => {
      const result = await validateDebianPackage(Buffer.from("not an ar"));
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes("ar archive"));
    });

    it("should reject empty buffer", async () => {
      const result = await validateDebianPackage(Buffer.alloc(0));
      assert.strictEqual(result.valid, false);
    });

    // Create a minimal valid ar archive structure for testing
    it("should reject ar without debian-binary", async () => {
      const arMagic = "!<arch>\n";
      // Create minimal ar with just a random file
      const filename = "testfile        ";
      const timestamp = "0           ";
      const ownerId = "0     ";
      const groupId = "0     ";
      const mode = "100644  ";
      const size = "4         ";
      const ending = "`\n";
      const header = filename + timestamp + ownerId + groupId + mode + size + ending;
      const data = "test";

      const buffer = Buffer.concat([
        Buffer.from(arMagic),
        Buffer.from(header),
        Buffer.from(data),
      ]);

      const result = await validateDebianPackage(buffer);
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes("debian-binary"));
    });
  });
});
