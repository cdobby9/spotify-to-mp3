
# Spotify to MP3 Converter Starter

This project fetches track data from a Spotify playlist and searches for corresponding YouTube video links.

### Setup

1. Clone the repository.
2. Install dependencies:
   ```
   npm install
   ```
3. Add your Spotify and YouTube API keys in the `.env` file.
4. Start the server:
   ```
   npm start
   ```

### Endpoints

- **GET /spotify-playlist**: Retrieve playlist details and YouTube links.
  - Query Parameter: `playlistUrl` - URL of the Spotify playlist.
