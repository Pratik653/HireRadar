import { describe, expect, it } from "vitest";
import { DEFAULT_FORM, isFieldReset, isFormDefault, resetField, sanitizeForm } from "./form";
import { placeNames } from "./linkedin";
import {
  ancestorsOf,
  clearWithin,
  countWithin,
  coveringSelection,
  keyOf,
  label,
  sanitize,
  searchLocations,
  toggle,
} from "./locations";
import type { LocationSelection } from "./types";

const dubai = { country_code: "AE", city: "Dubai" };
const berlin = { country_code: "DE", subdivision: "DE-BE", city: "Berlin" };
const bengaluru = { country_code: "IN", subdivision: "IN-KA", city: "Bengaluru" };
const karnataka = { country_code: "IN", subdivision: "IN-KA" };

describe("location hierarchy", () => {
  it("knows the ancestors of a city", () => {
    expect(ancestorsOf(keyOf(bengaluru))).toEqual(["s:IN-KA", "c:IN", "r:asia", "r:world"]);
    expect(ancestorsOf(keyOf(dubai))).toEqual(["c:AE", "r:gcc", "r:asia", "r:world"]);
    expect(ancestorsOf("r:gcc")).toEqual(["r:asia", "r:world"]);
  });

  it("labels selections like the backend", () => {
    expect(label(bengaluru)).toBe("Bengaluru, Karnataka, India");
    expect(label(berlin)).toBe("Berlin, Germany");
    expect(label({ region: "europe" })).toBe("Europe");
  });
});

describe("selection operations", () => {
  it("keeps several countries and continents at once", () => {
    let value: LocationSelection[] = [];
    for (const sel of [dubai, berlin, bengaluru, { region: "africa" }, { country_code: "CA" }]) value = toggle(value, sel);
    expect(value.map(keyOf)).toEqual(["t:AE||Dubai", "t:DE|DE-BE|Berlin", "t:IN|IN-KA|Bengaluru", "r:africa", "c:CA"]);
  });

  it("selecting a country replaces its cities instead of adding every city", () => {
    const value = toggle([bengaluru, karnataka, dubai], { country_code: "IN" });
    expect(value.map(keyOf)).toEqual(["t:AE||Dubai", "c:IN"]);
  });

  it("does not add a place already covered by a broader selection", () => {
    const value: LocationSelection[] = [{ region: "europe" }];
    expect(toggle(value, berlin)).toBe(value);
    expect(coveringSelection(value, keyOf(berlin))).toBe("r:europe");
  });

  it("worldwide replaces everything else", () => {
    expect(toggle([dubai, berlin], { region: "world" })).toEqual([{ region: "world" }]);
  });

  it("clears one level and its children only", () => {
    const value = [bengaluru, karnataka, dubai, berlin];
    expect(clearWithin(value, "c:IN").map(keyOf)).toEqual(["t:AE||Dubai", "t:DE|DE-BE|Berlin"]);
    expect(clearWithin(value, "s:IN-KA")).toEqual([dubai, berlin]);
    expect(clearWithin(value, "r:asia")).toEqual([berlin]);
    expect(countWithin(value, "r:asia")).toBe(3);
  });

  it("drops stored selections the catalog does not know, and duplicates", () => {
    const stored = [dubai, dubai, { country_code: "XX" }, { country_code: "AE", city: "Doha" }, { region: "mars" }, "junk"];
    expect(sanitize(stored)).toEqual([dubai]);
    // Pre-0.2 saved form: still valid.
    expect(sanitize([{ country_code: "SA", city: "Riyadh" }, { country_code: "QA" }])).toHaveLength(2);
  });
});

describe("location search", () => {
  it("finds cities by alias and distinguishes same-named cities", () => {
    expect(searchLocations("bangalore")[0]).toMatchObject({ name: "Bengaluru", kind: "City" });
    const londons = searchLocations("london").filter((h) => h.name === "London");
    expect(londons.map((h) => h.path).sort()).toEqual(["Ontario, Canada", "United Kingdom"]);
    expect(searchLocations("m")).toEqual([]); // one letter is too broad to search
    expect(searchLocations("muenchen")[0]).toMatchObject({ name: "Munich", path: "Bavaria, Germany" });
  });
});

describe("form resets", () => {
  const edited = {
    ...DEFAULT_FORM,
    titles: ["Data Engineer"],
    skills: ["SQL"],
    description: "Build pipelines",
    resume_text: "My resume",
    days: 30 as const,
    include_undated: false,
    work_modes: ["remote" as const],
    exclusions: ["unpaid"],
    seniority: ["senior" as const],
    min_score: 40,
    locations: [berlin],
  };

  it("each reset touches only its own field", () => {
    const cleared = resetField(edited, "skills");
    expect(cleared.skills).toEqual([]);
    expect({ ...cleared, skills: edited.skills }).toEqual(edited);

    expect(resetField(edited, "titles").titles).toEqual([]);
    expect(resetField(edited, "description").description).toBe("");
    expect(resetField(edited, "resume_text").resume_text).toBe("");
    expect(resetField(edited, "exclusions").exclusions).toEqual([]);
    expect(resetField(edited, "seniority").seniority).toEqual([]);
    expect(resetField(edited, "locations").locations).toEqual([]);
  });

  it("restores defaults where an empty value is not meaningful", () => {
    const dates = resetField(edited, "dates");
    expect([dates.days, dates.include_undated]).toEqual([7, true]);
    expect(resetField(edited, "work_modes").work_modes).toEqual(["onsite", "hybrid", "remote"]);
    expect(resetField(edited, "min_score").min_score).toBe(0);
  });

  it("reports when a field is already reset", () => {
    expect(isFieldReset(edited, "skills")).toBe(false);
    expect(isFieldReset(resetField(edited, "skills"), "skills")).toBe(true);
    expect(isFieldReset(DEFAULT_FORM, "description")).toBe(true);
    expect(isFieldReset(DEFAULT_FORM, "dates")).toBe(true);
  });

  it("reset all restores the complete default form", () => {
    expect(isFormDefault(edited)).toBe(false);
    expect(isFormDefault({ ...DEFAULT_FORM })).toBe(true);
  });

  it("repairs a stored form", () => {
    const repaired = sanitizeForm({ titles: ["X"], locations: [berlin, { country_code: "ZZ" }] });
    expect(repaired.titles).toEqual(["X"]);
    expect(repaired.locations).toEqual([berlin]);
    expect(repaired.days).toBe(DEFAULT_FORM.days);
  });
});

describe("request serialisation", () => {
  it("sends ISO codes the API validates", () => {
    const body = JSON.parse(JSON.stringify({ ...DEFAULT_FORM, locations: [berlin, karnataka, { region: "gcc" }] }));
    expect(body.locations).toEqual([
      { country_code: "DE", subdivision: "DE-BE", city: "Berlin" },
      { country_code: "IN", subdivision: "IN-KA" },
      { region: "gcc" },
    ]);
  });

  it("turns selections into research place names, none for worldwide", () => {
    expect(placeNames([{ region: "europe" }, karnataka, bengaluru])).toEqual(["Europe", "Karnataka", "Bengaluru"]);
    expect(placeNames([{ region: "world" }])).toEqual([]);
  });
});
