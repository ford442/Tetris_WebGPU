#!/bin/bash
# Script to create placeholder video files for testing
# Requires ffmpeg to be installed: sudo apt-get install ffmpeg

echo "Creating placeholder video files for Tetris background..."

# Create 7 videos with different colors for each level
# Level 0 - Dark blue/purple
ffmpeg -f lavfi -i color=c=0x1a0a3a:s=640x480:d=5 -c:v libx264 -t 5 -pix_fmt yuv420p -y bg1.mp4

# Level 1 - Blue
ffmpeg -f lavfi -i color=c=0x0033cc:s=640x480:d=5 -c:v libx264 -t 5 -pix_fmt yuv420p -y bg2.mp4

# Level 2 - Cyan
ffmpeg -f lavfi -i color=c=0x00cccc:s=640x480:d=5 -c:v libx264 -t 5 -pix_fmt yuv420p -y bg3.mp4

# Level 3 - Green
ffmpeg -f lavfi -i color=c=0x00cc00:s=640x480:d=5 -c:v libx264 -t 5 -pix_fmt yuv420p -y bg4.mp4

# Level 4 - Yellow
ffmpeg -f lavfi -i color=c=0xcccc00:s=640x480:d=5 -c:v libx264 -t 5 -pix_fmt yuv420p -y bg5.mp4

# Level 5 - Orange
ffmpeg -f lavfi -i color=c=0xcc6600:s=640x480:d=5 -c:v libx264 -t 5 -pix_fmt yuv420p -y bg6.mp4

# Level 6+ - Red
ffmpeg -f lavfi -i color=c=0xcc0000:s=640x480:d=5 -c:v libx264 -t 5 -pix_fmt yuv420p -y bg7.mp4
ffmpeg -f lavfi -i color=c=0x9900cc:s=640x480:d=5 -c:v libx264 -t 5 -pix_fmt yuv420p -y bg8.mp4

echo "Done! Created 8 placeholder videos (bg1.mp4 through bg8.mp4)"
echo "These are simple solid color videos for demonstration."
echo "Replace them with your actual video content for production."
