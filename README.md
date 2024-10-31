# Spotify Playlist to MP3 Downloader

![Project Logo](https://via.placeholder.com/150)  <!-- Replace with a real logo if you have one -->

## Overview

This project is a web application that allows users to convert Spotify playlists into downloadable MP3 files. By pasting a Spotify playlist link, users can easily download all the songs from that playlist as MP3 files compressed into a ZIP file. 

### Features
- Fetches Spotify playlist details, including song titles and artists.
- Searches for corresponding YouTube links for each track.
- Downloads the audio from the YouTube videos as MP3 files.
- Compresses all downloaded MP3 files into a single ZIP file named after the Spotify playlist.
- Simple and intuitive interface for seamless user experience.

## Tech Stack
- **Node.js**: Server-side JavaScript runtime.
- **Express**: Web framework for Node.js.
- **Axios**: Promise-based HTTP client for making requests.
- **Archiver**: For creating ZIP files.
- **yt-dlp**: Tool for downloading videos from YouTube and converting them to audio.
- **Spotify API**: To access playlist data.
- **YouTube Data API**: To search for videos based on song titles and artists.

## Installation

### Prerequisites
- **Node.js** and **npm**: Make sure you have Node.js installed. You can download it from [nodejs.org](https://nodejs.org/).

### Getting Started
1. **Clone the repository**:
    ```bash
    git clone https://github.com/yourusername/spotify-playlist-to-mp3-downloader.git
    cd spotify-playlist-to-mp3-downloader
    ```

2. **Install dependencies**:
    ```bash
    npm install
    ```

3. **Set up environment variables**:
    Create a `.env` file in the root directory and add your Spotify and YouTube API keys:
    ```
    SPOTIFY_CLIENT_ID=your_spotify_client_id
    SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
    YOUTUBE_API_KEY=your_youtube_api_key
    ```

4. **Install `yt-dlp`**:
   Make sure you have `yt-dlp` installed. You can download it from [yt-dlp's GitHub page](https://github.com/yt-dlp/yt-dlp#installation).

5. **Run the application**:
    ```bash
    node index.js
    ```

6. **Access the application**:
   Open your browser and go to [http://localhost:3000/download-playlist](http://localhost:3000/download-playlist).

## Usage
- To download a Spotify playlist, append the playlist URL to the endpoint:
