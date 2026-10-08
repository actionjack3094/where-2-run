import { describe, expect, it } from "vitest";
import {
  cosineIdeologicalSimilarity,
  euclideanIdeologicalDistance,
  parseIdeologicalVector,
} from "@/app/lib/ideological-distance";

describe("ideological vector distance", () => {
  it("parses Townhall and candidate JSON coordinates", () => {
    expect(parseIdeologicalVector({ x: -0.4, y: 0.2 })).toEqual({ x: -0.4, y: 0.2 });
    expect(parseIdeologicalVector({ ideology_x: 0.1, ideology_y: -0.3 })).toEqual({
      x: 0.1,
      y: -0.3,
    });
  });

  it("ranks a nearer candidate by Euclidean distance", () => {
    const user = { x: -0.5, y: -0.2 };
    const near = euclideanIdeologicalDistance(user, { x: -0.55, y: -0.25 });
    const far = euclideanIdeologicalDistance(user, { x: 0.85, y: 0.7 });
    expect(near).not.toBeNull();
    expect(far).not.toBeNull();
    expect(near!).toBeLessThan(far!);
    expect(near!).toBeCloseTo(Math.sqrt(0.05 ** 2 + 0.05 ** 2));
  });

  it("scores cosine similarity for the same direction", () => {
    const similarity = cosineIdeologicalSimilarity({ x: -0.5, y: -0.2 }, { x: -1, y: -0.4 });
    expect(similarity).toBeCloseTo(1);
  });
});
