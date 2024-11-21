const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');
const { exec } = require('child_process');
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
const NodeID3 = require('node-id3'); // Import node-id3 for metadata
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

function downloadAndConvertToMp3(youtubeUrl, outputPath) {
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

function addMetadata(filePath, metadata) {
    return new Promise((resolve, reject) => {
        const success = NodeID3.write(metadata, filePath);
        if (success) {
            console.log(`Metadata added to ${filePath}`);
            resolve();
        } else {
            console.error(`Failed to add metadata to ${filePath}`);
            reject(new Error(`Failed to add metadata to ${filePath}`));
        }
    });
}

app.post('/download-playlist', async (req, res) => {
    const socketId = req.body.socketId;
    const playlistUrl = req.body.playlistUrl;

    try {
        const playlistId = playlistUrl.split('/').pop().split('?')[0];
        const token = await getSpotifyToken();
        
        const playlistResponse = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const playlistName = playlistResponse.data.name;
        const coverImageUrl = playlistResponse.data.images[0]?.url || '';


        const tracksResponse = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const tracks = await Promise.all(tracksResponse.data.items.map(async item => {
            const title = item.track.name;
            const artist = item.track.artists.map(artist => artist.name).join(', ');
            const album = item.track.album.name;
            const year = item.track.album.release_date.split('-')[0];
            const youtubeUrl = await searchYouTube(title, artist);
            return { title, artist, album, year, youtubeUrl };
        }));

        // Prepare temporary folder for MP3 files
        const downloadDir = path.join(__dirname, 'downloads');
        if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir);

        // Download and convert each track to MP3 concurrently
        const downloadPromises = tracks.map((track, index) => {
            const outputPath = path.join(downloadDir, `${track.title}-${track.artist}.mp3`);
            
            return downloadAndConvertToMp3(track.youtubeUrl, outputPath).then(async () => {
                // Add metadata to the MP3 file
                const metadata = {
                    title: track.title,
                    artist: track.artist,
                    album: track.album,
                    year: track.year,
                    genre: 'Spotify Playlist' // Example genre
                };
                await addMetadata(outputPath, metadata);

                // Emit and log progress for each completed download
                const progressMessage = `Downloaded and tagged ${track.title} by ${track.artist}`;
                io.to(socketId).emit('progress', {
                    message: progressMessage,
                    percentage: Math.round(((index + 1) / tracks.length) * 100)
                });
                console.log(progressMessage);
                return outputPath; // Return path to ensure ordering
            });
        });

        // Wait for all downloads to complete and get ordered paths
        const orderedPaths = await Promise.all(downloadPromises);

        // Create a ZIP file with MP3 files in the same order as the Spotify playlist
        const sanitizedPlaylistName = playlistName.replace(/[<>:"/\\|?*]+/g, '_'); 
        const zipPath = path.join(__dirname, `${sanitizedPlaylistName}.zip`);
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip');

        archive.on('error', (err) => {
            throw err;
        });

        archive.pipe(output);

        // Add files to the archive in order
        for (const filePath of orderedPaths) {
            const fileName = path.basename(filePath);
            archive.file(filePath, { name: fileName });
        }

        await archive.finalize();

        // Notify client of completion
        io.to(socketId).emit('complete', { url: `/download/${sanitizedPlaylistName}.zip` });

        res.json({ message: 'Processing complete', zipPath: zipPath });
        res.json({ message: 'Processing complete', coverImageUrl });
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
                    // Clean up the ZIP file
                    fs.unlinkSync(filePath);
                    console.log(`Successfully deleted ${filename}`);

                    // Clean up the downloads folder by removing all MP3 files
                    const downloadDir = path.join(__dirname, 'downloads');
                    fs.readdir(downloadDir, (err, files) => {
                        if (err) console.error(`Error reading downloads directory: ${err}`);
                        else {
                            files.forEach(file => {
                                const mp3FilePath = path.join(downloadDir, file);
                                fs.unlink(mp3FilePath, (err) => {
                                    if (err) console.error(`Failed to delete ${mp3FilePath}: ${err}`);
                                    else console.log(`Deleted ${mp3FilePath}`);
                                });
                            });
                        }
                    });
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
