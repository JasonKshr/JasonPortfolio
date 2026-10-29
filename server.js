const express = require("express");
const path = require("path");
const querystring = require("querystring");
require("dotenv").config();

const app = express();

const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
const redirectUri = process.env.SPOTIFY_REDIRECT_URI;

// These live only on the backend
let accessToken = null;
let refreshToken = process.env.SPOTIFY_REFRESH_TOKEN || null;
let accessTokenExpiresAt = 0;

// Serve index.html, style.css, spotify.js, images, etc.
app.use(express.static(path.join(__dirname, "public")));

// --------------------
// TEST ROUTE
// --------------------

app.get("/api/test", (req, res) => {
  res.json({
    message: "backend works!",
  });
});

// --------------------
// SPOTIFY LOGIN
// --------------------

app.get("/login", (req, res) => {
  const scope = "user-read-currently-playing user-read-recently-played";

  const spotifyLoginUrl =
    "https://accounts.spotify.com/authorize?" +
    querystring.stringify({
      response_type: "code",
      client_id: clientId,
      scope: scope,
      redirect_uri: redirectUri,
    });

  res.redirect(spotifyLoginUrl);
});

app.get("/api/recent-debug", async (req, res) => {
  try {
    const token = await getAccessToken();

    const response = await fetch(
      "https://api.spotify.com/v1/me/player/recently-played?limit=5",
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    const data = await response.json();

    const songs = data.items?.map((item) => ({
      song: item.track.name,
      artist: item.track.artists[0].name,
      playedAt: item.played_at,
    }));

    res.json(songs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "failed" });
  }
});

// --------------------
// SPOTIFY CALLBACK
// --------------------

app.get("/callback", async (req, res) => {
  try {
    const code = req.query.code;

    if (!code) {
      return res.status(400).send("No authorization code received.");
    }

    const tokenResponse = await fetch(
      "https://accounts.spotify.com/api/token",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/x-www-form-urlencoded",

          Authorization:
            "Basic " +
            Buffer.from(clientId + ":" + clientSecret).toString("base64"),
        },

        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: code,
          redirect_uri: redirectUri,
        }),
      },
    );

    const data = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error("Spotify token error:", data);
      return res.status(500).send("Could not connect Spotify.");
    }

    accessToken = data.access_token;

    // Spotify normally gives this when you authorize
    if (data.refresh_token) {
      refreshToken = data.refresh_token;

      // TEMPORARILY print it so you can put it in .env
      //console.log("\nCOPY THIS INTO YOUR .env:");
      //console.log(`SPOTIFY_REFRESH_TOKEN=${refreshToken}\n`);
    }

    // Spotify access tokens normally expire after about an hour
    accessTokenExpiresAt = Date.now() + data.expires_in * 1000;

    res.send("Spotify connected! Go back to http://127.0.0.1:3000");
  } catch (error) {
    console.error(error);

    res.status(500).send("Something went wrong connecting Spotify.");
  }
});

// --------------------
// GET A NEW ACCESS TOKEN
// --------------------

async function refreshAccessToken() {
  if (!refreshToken) {
    throw new Error("No Spotify refresh token available.");
  }

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",

    headers: {
      "Content-Type": "application/x-www-form-urlencoded",

      Authorization:
        "Basic " +
        Buffer.from(clientId + ":" + clientSecret).toString("base64"),
    },

    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("Refresh error:", data);
    throw new Error("Could not refresh Spotify access token.");
  }

  accessToken = data.access_token;

  accessTokenExpiresAt = Date.now() + data.expires_in * 1000;

  // Spotify may occasionally return another refresh token
  if (data.refresh_token) {
    refreshToken = data.refresh_token;
  }

  return accessToken;
}

// --------------------
// MAKE SURE TOKEN WORKS
// --------------------

async function getAccessToken() {
  const tokenStillValid =
    accessToken && Date.now() < accessTokenExpiresAt - 60000;

  if (tokenStillValid) {
    return accessToken;
  }

  return await refreshAccessToken();
}

// --------------------
// SPOTIFY DATA
// --------------------

app.get("/api/spotify", async (req, res) => {
  try {
    const token = await getAccessToken();

    // First ask Spotify what Jason is playing RIGHT NOW
    const currentResponse = await fetch(
      "https://api.spotify.com/v1/me/player/currently-playing",
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    // A track is currently available
    if (currentResponse.status !== 204) {
      const currentData = await currentResponse.json();

      if (currentResponse.ok && currentData.item) {
        return res.json({
          playing: true,
          song: currentData.item.name,
          artist: currentData.item.artists
            .map((artist) => artist.name)
            .join(", "),
          albumArt: currentData.item.album?.images?.[0]?.url || null,
        });
      }
    }

    // Nothing is playing, so get Jason's most recent song
    const recentResponse = await fetch(
      "https://api.spotify.com/v1/me/player/recently-played?limit=1",
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (!recentResponse.ok) {
      const errorData = await recentResponse.json();

      console.error("Recently played error:", errorData);

      return res.status(recentResponse.status).json({
        error: "Could not get recently played song.",
      });
    }

    const recentData = await recentResponse.json();

    const track = recentData.items?.[0]?.track;

    if (!track) {
      return res.json({
        playing: false,
        song: null,
        artist: null,
        albumArt: null,
      });
    }

    res.json({
      playing: false,
      song: track.name,
      artist: track.artists.map((artist) => artist.name).join(", "),
      albumArt: track.album?.images?.[0]?.url || null,
    });
  } catch (error) {
    console.error("Spotify API error:", error.message);

    res.status(401).json({
      error: "Spotify needs to be connected.",
      login: "/login",
    });
  }
});

// --------------------
// START SERVER
// --------------------
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`running on port ${PORT}`);
});
