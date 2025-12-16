// Test script for ESPN rank/record data
const test = async () => {
  const date = "20251126";
  try {
    const response = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${date}&groups=50&limit=1000`
    );
    const data = await response.json();

    if (data.events && data.events.length > 0) {
      const event = data.events[0];
      const competition = event.competitions[0];
      const competitors = competition.competitors;

      competitors.forEach((c) => {
        console.log(`Team: ${c.team.displayName}`);
        console.log(`Rank:`, c.curatedRank?.current);
        console.log(`Records:`, JSON.stringify(c.records, null, 2));
      });
    }
  } catch (e) {
    console.error(e);
  }
};

test();
