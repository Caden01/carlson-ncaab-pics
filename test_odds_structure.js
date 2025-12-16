// Test script for ESPN odds structure
const test = async () => {
  const date = "20251126";
  try {
    const response = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${date}`
    );
    const data = await response.json();

    if (data.events && data.events.length > 0) {
      const odds = data.events[0].competitions[0].odds;
      if (odds && odds.length > 0) {
        console.log("Odds Object Keys:", Object.keys(odds[0]));
        console.log("Details:", odds[0].details);
        console.log("Spread Value:", odds[0].spread);
      } else {
        console.log("No odds found for first event.");
      }
    }
  } catch (e) {
    console.error(e);
  }
};

test();
