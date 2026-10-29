async function loadSpotify() {
  try {
    const response = await fetch("/api/spotify");

    if (!response.ok) {
      throw new Error("Spotify API request failed");
    }

    const data = await response.json();

    console.log("Spotify data:", data);

    const heading = document.querySelector("#spotify-card > p");
    const song = document.getElementById("spotify-song");
    const artist = document.getElementById("spotify-artist");
    const album = document.getElementById("spotify-album");

    if (data.song) {
      if (data.playing) {
        heading.textContent = "🎧 listening to:";
      } else {
        heading.textContent = "🎧 recently listened to:";
      }

      song.textContent = data.song;
      artist.textContent = data.artist;

      album.src = data.albumArt;
      album.style.display = "block";
    } else {
      song.textContent = "nothing right now";
      artist.textContent = "";
      album.style.display = "none";
    }
  } catch (error) {
    console.error("Spotify error:", error);
  }
}

loadSpotify();

setInterval(loadSpotify, 15000);
