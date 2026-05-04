import test from "node:test";
import assert from "node:assert/strict";

import {
  NBA_PLAYOFFS_PHASE,
  getGameSeasonPhase,
  getGameTournamentName,
  isNbaPlayoffGame,
} from "./gameFilters.js";

test("classifies season_type 3 games as NBA playoffs", () => {
  const game = {
    season_type: 3,
    tournament_headline: "East Semifinals - Game 1",
  };

  assert.equal(isNbaPlayoffGame(game), true);
  assert.equal(getGameSeasonPhase(game), NBA_PLAYOFFS_PHASE);
  assert.equal(getGameTournamentName(game), "East Semifinals - Game 1");
});

test("recognizes east and west semifinals headlines", () => {
  assert.equal(
    isNbaPlayoffGame({ tournament_headline: "East Semifinals - Game 1" }),
    true
  );
  assert.equal(
    isNbaPlayoffGame({ tournament_headline: "West Semifinals - Game 2" }),
    true
  );
});
