import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { registrationCompletionSchema, registrationPhoneSchema } from "../shared/registrationValidation";

const validRegistration = {
  role: "restaurant" as const,
  companyName: "Gasthof Test",
  contactName: "Max Mustermann",
  phone: "+49 89 1234567",
  address: "Marienplatz 1",
  city: "München",
  postalCode: "80331",
  profile: "",
  latitude: 48.1374,
  longitude: 11.5755,
  locationConfirmed: true as const,
};

describe("registration validation", () => {
  test("accepts common international phone formats with real digits", () => {
    for (const phone of ["+49 89 1234567", "+39 (0471) 123456", "0043-1-234567"]) {
      assert.equal(registrationPhoneSchema.safeParse(phone).success, true);
    }
  });

  test("rejects alphabetic, too-short, and placeholder phone values", () => {
    for (const phone of ["abc123", "123456", "000000000", "+49 phone 123"]) {
      assert.equal(registrationPhoneSchema.safeParse(phone).success, false);
    }
  });

  test("requires a confirmed pin and valid coordinates for completion", () => {
    assert.equal(registrationCompletionSchema.safeParse(validRegistration).success, true);
    assert.equal(
      registrationCompletionSchema.safeParse({
        ...validRegistration,
        locationConfirmed: false,
      }).success,
      false,
    );
    assert.equal(
      registrationCompletionSchema.safeParse({
        ...validRegistration,
        latitude: undefined,
        longitude: undefined,
      }).success,
      false,
    );
  });

  test("rejects coordinates outside the earth", () => {
    assert.equal(
      registrationCompletionSchema.safeParse({
        ...validRegistration,
        latitude: 91,
      }).success,
      false,
    );
    assert.equal(
      registrationCompletionSchema.safeParse({
        ...validRegistration,
        longitude: -181,
      }).success,
      false,
    );
  });
});