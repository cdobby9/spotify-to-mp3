const express = require('express');
const axios = require('axios');
const { exec } = require('child_process');
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = 3000;

app.use(express.json());

async function getSpotifyToken() {
    const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } = process.env;
    const response = await axios.post('https://accounts.spotify.com/api/token', 
    new URLSearchParams({ 'grant_type': 'client_credentials' }), 
    {
        headers: {
            'Authorization': `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });
    return response.data.access_token;
}

async function searchYouTube(title, artist) {
    const { YOUTUBE_API_KEY } = process.env;
    const query = `${title} ${artist}`;
    const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
        params: {
            key: YOUTUBE_API_KEY,
            q: query,
            part: 'snippet',
            maxResults: 1,
            type: 'video'
        }
    });
    return `https://www.youtube.com/watch?v=${response.data.items[0].id.videoId}`;
}

async function downloadAndConvertToMp3(youtubeUrl, outputPath) {
    console.log(`Downloading: ${youtubeUrl}`);
    return new Promise((resolve, reject) => {
        const command = `yt-dlp -x --audio-format mp3 -o "${outputPath}" "${youtubeUrl}"`;

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error: ${stderr}`);
                return reject(error);
            }
            console.log(`Downloaded: ${stdout}`);
            resolve(outputPath);
        });
    });
}

app.get('/download-playlist', async (req, res) => {
    try {
        const { playlistUrl } = req.query;
        const playlistId = playlistUrl.split('/').pop().split('?')[0];
        const token = await getSpotifyToken();
        
        // Fetch playlist details to get the playlist name
        const playlistResponse = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const playlistName = playlistResponse.data.name; // Get the playlist name
        
        const tracksResponse = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const tracks = await Promise.all(tracksResponse.data.items.map(async item => {
            const title = item.track.name;
            const artist = item.track.artists[0].name;
            const youtubeUrl = await searchYouTube(title, artist);
            return { title, artist, youtubeUrl };
        }));

        // Temporary folder for MP3 files
        const downloadDir = path.join(__dirname, 'downloads');
        if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir);

        // Download and convert each track
        for (const track of tracks) {
            const outputPath = path.join(downloadDir, `${track.title}-${track.artist}.mp3`);
            await downloadAndConvertToMp3(track.youtubeUrl, outputPath);
        }

        // Create a ZIP file of all MP3 files, naming it after the playlist
        const sanitizedPlaylistName = playlistName.replace(/[<>:"/\\|?*]+/g, '_'); // Sanitize the playlist name
        const zipPath = path.join(__dirname, `${sanitizedPlaylistName}.zip`);
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip');

        output.on('close', () => {
            console.log(`ZIP created with ${archive.pointer()} total bytes`);
            res.download(zipPath, `${sanitizedPlaylistName}.zip`, () => {
                // Clean up after download
                fs.rmdirSync(downloadDir, { recursive: true });
                fs.unlinkSync(zipPath);
            });
        });

        archive.on('error', err => {
            throw err;
        });

        archive.pipe(output);
        archive.directory(downloadDir, false);
        archive.finalize();

    } catch (error) {
        console.error('Error processing playlist:', error.message);
        res.status(500).send('Failed to download playlist');
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
