import { describe, expect, it } from "vitest";
import {
  expectedResult,
  K_EARLY,
  K_FINALS,
  kForStage,
  marginFactor,
  nextElo,
  ratingsAfterVoteMargin,
} from "@/lib/actions/elo";

describe("World Football Elo", () => {
  it("computes expected result as 1 / (10^(-dr/400) + 1)", () => {
    expect(expectedResult(1200, 1200)).toBeCloseTo(0.5, 8);
    const favorite = expectedResult(1600, 1200);
    const underdog = expectedResult(1200, 1600);
    expect(favorite).toBeCloseTo(1 / (10 ** (-400 / 400) + 1), 8);
    expect(favorite + underdog).toBeCloseTo(1, 8);
    expect(favorite).toBeGreaterThan(underdog);
  });

  it("maps a 51/49 spectator split to G = 1.0", () => {
    expect(marginFactor(51, 49)).toBe(1);
    expect(marginFactor(49, 51)).toBe(1);
  });

  it("maps an 80/20 blowout to G = 2.5", () => {
    expect(marginFactor(80, 20)).toBeCloseTo(2.5, 8);
  });

  it("uses a larger G on a blowout than on a nail-biter", () => {
    expect(marginFactor(80, 20)).toBeGreaterThan(marginFactor(55, 45));
    expect(marginFactor(55, 45)).toBeGreaterThanOrEqual(marginFactor(51, 49));
  });

  it("takes K as a tournament-stage weight", () => {
    expect(kForStage("early")).toBe(K_EARLY);
    expect(kForStage("finals")).toBe(K_FINALS);
    expect(kForStage(40)).toBe(40);
  });

  it("applies R_new = R_old + K * G * (W - W_e)", () => {
    const rating = 1200;
    const opponent = 1200;
    const k = 20;
    const winnerVotes = 80;
    const loserVotes = 20;
    const result = nextElo({
      rating,
      opponentRating: opponent,
      won: 1,
      k,
      winnerVotes,
      loserVotes,
    });

    const expected =
      rating + k * marginFactor(winnerVotes, loserVotes) * (1 - expectedResult(rating, opponent));
    expect(result.nextRating).toBe(Math.round(expected));
    expect(result.margin).toBeCloseTo(2.5, 8);
  });

  it("moves more Elo on a blowout than on a 51/49", () => {
    const blowout = ratingsAfterVoteMargin({
      winnerId: "w",
      loserId: "l",
      winnerRating: 1200,
      loserRating: 1200,
      winnerVotes: 80,
      loserVotes: 20,
      k: 20,
    });
    const close = ratingsAfterVoteMargin({
      winnerId: "w",
      loserId: "l",
      winnerRating: 1200,
      loserRating: 1200,
      winnerVotes: 51,
      loserVotes: 49,
      k: 20,
    });

    expect(blowout.winner.delta).toBeGreaterThan(close.winner.delta);
    expect(Math.abs(blowout.loser.delta)).toBeGreaterThan(Math.abs(close.loser.delta));
  });

  it("applies a larger swing in finals (K=60) than in early rounds (K=20)", () => {
    const early = nextElo({
      rating: 1200,
      opponentRating: 1200,
      won: 1,
      k: K_EARLY,
      winnerVotes: 60,
      loserVotes: 40,
    });
    const finals = nextElo({
      rating: 1200,
      opponentRating: 1200,
      won: 1,
      k: K_FINALS,
      winnerVotes: 60,
      loserVotes: 40,
    });
    expect(finals.delta).toBeGreaterThan(early.delta);
  });
});
