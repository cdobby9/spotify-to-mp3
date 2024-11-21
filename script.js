const socket = io(); // Connect to the Socket.IO server


async function downloadPlaylist() {
    const spotifyUrl = document.getElementById('spotifyUrl').value;
    const loadingBar = document.getElementById('loading-bar');
    const progress = document.getElementById('progress');
    const status = document.getElementById('status');

    if (!spotifyUrl) {
        alert("Please enter a Spotify playlist URL.");
        return;
    }

    progress.style.width = '0%';
    status.textContent = 'Processing...';

    try {
        // Send request to the server with the socket ID
        const response = await fetch('/download-playlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playlistUrl: spotifyUrl, socketId: socket.id })
        });
    
        if (response.ok) {
            const data = await response.json();
            status.textContent = 'Download ready!';
            
            if (data.success && data.coverImageUrl) {
                playlistCover.src = data.coverImageUrl;
                playlistCover.alt = "Playlist Cover";
            } else {
                playlistCover.src = "";
                playlistCover.alt = "Failed to load playlist cover";
            }
        } else {
            status.textContent = 'Failed to process playlist.';
            playlistCover.src = "";
            playlistCover.alt = "Failed to load playlist cover";
        }
    } catch (error) {
        console.error('Error:', error);
        status.textContent = 'An error occurred.';
        playlistCover.src = "";
        playlistCover.alt = "Failed to load playlist cover";
    }
}

// Listen for progress updates
socket.on('progress', (data) => {
    document.getElementById('status').textContent = data.message;
    document.getElementById('progress').style.width = `${data.percentage}%`;
});

// Listen for completion
socket.on('complete', (data) => {
    const status = document.getElementById('status');
    
    // Create a download link for the ZIP file
    const link = document.createElement('a');
    link.href = data.url;
    link.textContent = 'Download ZIP';
    link.style.display = 'block';
    link.style.marginTop = '20px';
    link.setAttribute('download', 'playlist.zip'); // Prompts download
    
    status.textContent = 'Processing complete! ';
    status.appendChild(link);

    // Automatically click the link to prompt the download
    link.click();
});
