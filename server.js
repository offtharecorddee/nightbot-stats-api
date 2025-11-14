import express from "express";
import fetch from "node-fetch";

const app = express();

// === 30 SECOND CACHE TO REDUCE ESPN LOAD ===
let cache = {};
const CACHE_TIME = 30 * 1000;

// Safely fetch JSON
async function getJSON(url) {
  const res = await fetch(url);
  return res.json();
}

app.get("/player", async (req, res) => {
  try {
    const playerName = (req.query.player || "").trim().toLowerCase();
    if (!playerName) {
      return res.send("Please provide a player. Example: !player Caleb Williams");
    }

    // === CHECK CACHE ===
    if (cache[playerName] && Date.now() - cache[playerName].time < CACHE_TIME) {
      return res.send(cache[playerName].data);
    }

    const leagues = [
      {
        name: "college football",
        scoreboard: "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard",
        summary: "https://site.api.espn.com/apis/site/v2/sports/football/college-football/summary?event=",
      },
      {
        name: "nfl",
        scoreboard: "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard",
        summary: "https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=",
      }
    ];

    let found = null;
    let leagueName = null;

    // === SEARCH EACH LEAGUE ===
    for (const league of leagues) {
      const board = await getJSON(league.scoreboard);

      for (const event of board.events) {
        const summaryUrl = `${league.summary}${event.id}`;
        const summary = await getJSON(summaryUrl);

        // Each team has stat categories
        for (const team of summary.boxscore?.players || []) {
          for (const category of team.statistics) {
            for (const athlete of category.athletes) {
              const name = athlete.athlete.displayName.toLowerCase();

              // handle minor spelling errors (auto-correct)
              function closeMatch(a, b) {
                if (a.includes(b) || b.includes(a)) return true;
                if (a.split(" ")[0] === b.split(" ")[0]) return true;
                return false;
              }

              if (closeMatch(name, playerName)) {
                found = { event, summary, athlete, teamStats: team.statistics };
                leagueName = league.name;
                break;
              }
            }
            if (found) break;
          }
          if (found) break;
        }
        if (found) break;
      }
      if (found) break;
    }

    if (!found) {
      return res.send(`No stats found for "${playerName}". Check spelling.`);
    }

    const { event, athlete, teamStats } = found;
    const realName = athlete.athlete.displayName;

    // === Basic game info ===
    const comp = event.competitions[0];
    const status = comp.status.type.shortDetail;

    // === SCORE ===
    const home = comp.competitors.find(c => c.homeAway === "home");
    const away = comp.competitors.find(c => c.homeAway === "away");
    const scoreText = `${away.team.abbreviation} ${away.score} – ${home.team.abbreviation} ${home.score}`;

    // === BUILD PLAYER STAT MESSAGE ===
    let parts = [];

    const getStats = (catName, labels) => {
      const category = teamStats.find(x => x.name === catName);
      if (!category) return null;

      const p = category.athletes.find(a => a.athlete.id === athlete.athlete.id);
      if (!p) return null;

      const stats = p.stats;
      return labels.map((label, i) => `${label}: ${stats[i]}`).join(", ");
    };

    // Passing
    const passing = getStats("passing", ["Comp/Att", "Yards", "TD", "INT"]);
    if (passing) parts.push(`Passing: ${passing}`);

    // Rushing
    const rushing = getStats("rushing", ["Carries", "Yards", "TD"]);
    if (rushing) parts.push(`Rushing: ${rushing}`);

    // Receiving
    const receiving = getStats("receiving", ["Receptions", "Yards", "TD"]);
    if (receiving) parts.push(`Receiving: ${receiving}`);

    // Defensive players (tackles, sacks, INT)
    const defense = getStats("defensive", ["Tackles", "Sacks", "INT"]);
    if (defense) parts.push(`Defense: ${defense}`);

    if (parts.length === 0) parts.push("No recorded stats yet.");

    // Final Nightbot message
    const finalMsg =
      `${realName} (${leagueName}) | ${parts.join(" | ")} | Score: ${scoreText} (${status})`;

    // === SAVE TO CACHE ===
    cache[playerName] = {
      data: finalMsg,
      time: Date.now()
    };

    res.send(finalMsg);

  } catch (err) {
    console.error("API ERROR:", err);
    res.send("Error pulling ESPN stats.");
  }
});

app.listen(3000, () => console.log("Upgraded ESPN stats API running on port 3000"));
