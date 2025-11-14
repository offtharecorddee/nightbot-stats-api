import express from "express";
import fetch from "node-fetch";

const app = express();

app.get("/player", async (req, res) => {
  const playerName = (req.query.player || "").trim().toLowerCase();
  if (!playerName) return res.send("Please provide a player name, e.g. ?player=Dillon%20Gabriel");

  try {
    const leagues = [
      {
        name: "college football",
        sportUrl: "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard",
        summaryUrl: "https://site.api.espn.com/apis/site/v2/sports/football/college-football/summary?event=",
      },
      {
        name: "nfl",
        sportUrl: "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard",
        summaryUrl: "https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=",
      },
    ];

    let foundGame = null;
    let foundLeague = null;
    let playerStats = {};

    // Step 1: Search both leagues for player in active/recent games
    for (const league of leagues) {
      const scoreboardResp = await fetch(league.sportUrl);
      const scoreboard = await scoreboardResp.json();

      for (const event of scoreboard.events) {
        const summaryResp = await fetch(`${league.summaryUrl}${event.id}`);
        const summary = await summaryResp.json();

        // Step 2: Find player and record their stats by category
        for (const team of summary.boxscore?.players || []) {
          for (const category of team.statistics) {
            for (const athlete of category.athletes) {
              if (athlete.athlete.displayName.toLowerCase().includes(playerName)) {
                foundGame = { event, summary, player: athlete };
                foundLeague = league.name;
                playerStats[category.name] = athlete.stats;
              }
            }
          }
        }

        if (foundGame) break;
      }
      if (foundGame) break;
    }

    if (!foundGame) {
      return res.send(`No live or recent game found for ${playerName}.`);
    }

    const { event } = foundGame;
    const name = foundGame.player.athlete.displayName;
    const competition = event.competitions[0];
    const status = competition.status?.type?.shortDetail || "N/A";

    // Step 3: Build output
    let msgParts = [];

    // Passing
    if (playerStats.passing) {
      const [compAtt, yards, td, int] = playerStats.passing;
      msgParts.push(`Passing: ${compAtt}, ${yards} YDS, ${td} TD, ${int} INT`);
    }

    // Rushing
    if (playerStats.rushing) {
      const [carries, rushYds, rushTD] = playerStats.rushing;
      msgParts.push(`Rushing: ${carries} CAR, ${rushYds} YDS, ${rushTD} TD`);
    }

    // Receiving
    if (playerStats.receiving) {
      const [receptions, recYds, recTD] = playerStats.receiving;
      msgParts.push(`Receiving: ${receptions} REC, ${recYds} YDS, ${recTD} TD`);
    }

    if (msgParts.length === 0) {
      msgParts.push("No stats available yet.");
    }

    // Step 4: Combine message for Nightbot
    const finalMsg = `${name} (${foundLeague}): ${msgParts.join(" | ")} (${status})`;
    res.send(finalMsg);
  } catch (err) {
    console.error(err);
    res.send("Error fetching ESPN data");
  }
});

app.listen(3000, () => console.log("Full multi-league player stats API running on port 3000"));
