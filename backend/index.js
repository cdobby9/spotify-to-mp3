const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');
const { exec } = require('child_process');
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..'))); // Serves index.html and script.js

io.on('connection', (socket) => {
    console.log('Client connected');
});

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
    return new Promise((resolve, reject) => {
        const command = `yt-dlp -x --audio-format mp3 -o "${outputPath}" "${youtubeUrl}"`;

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error: ${stderr}`);
                return reject(error);
            }
            resolve(outputPath);
        });
    });
}

app.post('/download-playlist', async (req, res) => {
    const socketId = req.body.socketId; // Get the socket ID from the request
    const playlistUrl = req.body.playlistUrl;

    try {
        const playlistId = playlistUrl.split('/').pop().split('?')[0];
        const token = await getSpotifyToken();
        
        // Fetch playlist details
        const playlistResponse = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const playlistName = playlistResponse.data.name;
        
        const tracksResponse = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const tracks = await Promise.all(tracksResponse.data.items.map(async item => {
            const title = item.track.name;
            const artist = item.track.artists[0].name;
            const youtubeUrl = await searchYouTube(title, artist);
            return { title, artist, youtubeUrl };
        }));

        // Prepare temporary folder for MP3 files
        const downloadDir = path.join(__dirname, 'downloads');
        if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir);

        for (const [index, track] of tracks.entries()) {
            const outputPath = path.join(downloadDir, `${track.title}-${track.artist}.mp3`);
            await downloadAndConvertToMp3(track.youtubeUrl, outputPath);

            // Emit and log progress
            const progressMessage = `Downloaded ${track.title} by ${track.artist}`;
            io.to(socketId).emit('progress', {
                message: progressMessage,
                percentage: Math.round(((index + 1) / tracks.length) * 100)
            });
            console.log(progressMessage);
        }

        // Create a ZIP file of all MP3 files
        const sanitizedPlaylistName = playlistName.replace(/[<>:"/\\|?*]+/g, '_'); 
        const zipPath = path.join(__dirname, `${sanitizedPlaylistName}.zip`);
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip');

        archive.on('error', (err) => {
            throw err;
        });

        archive.pipe(output);
        archive.directory(downloadDir, false);
        await archive.finalize();

        // Notify client of completion
        io.to(socketId).emit('complete', { url: `/download/${sanitizedPlaylistName}.zip` });

        res.json({ message: 'Processing complete', zipPath: zipPath });
    } catch (error) {
        console.error('Error processing playlist:', error.message);
        res.status(500).send('Failed to process playlist');
    }
});

// Serve the generated ZIP file and delay cleanup
app.get('/download/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, filename);
    
    res.download(filePath, filename, (err) => {
        if (err) {
            console.error(err);
        } else {
            // Delay cleanup by 5 seconds to ensure the file is fully downloaded
            setTimeout(() => {
                try {
                    fs.unlinkSync(filePath); // Clean up after download
                    console.log(`Successfully deleted ${filename}`);
                } catch (error) {
                    console.error(`Failed to delete ${filename}:`, error);
                }
            }, 5000); // 5000 ms delay
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
