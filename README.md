# Tetris_WebGPU - Enhanced Edition

A modern, full-featured Tetris game powered by WebGPU with beautiful UI and smooth animations.

## 🎮 Live Demo

Live demo: https://konstantin84ukr.github.io/Tetris_WebGPU/

## ✨ Features

### Game Features
- Classic Tetris gameplay with all 7 tetromino pieces (I, J, L, O, S, T, Z)
- Progressive difficulty - speed increases every 10 lines
- Score tracking with multipliers for multi-line clears
- Next piece preview with color-coded blocks
- High score persistence using localStorage
- Smooth WebGPU-powered 3D graphics

### UI/UX Enhancements
- **Modern Design**: Cyberpunk-inspired theme with neon glows and gradients
- **Responsive Layout**: Works on desktop and mobile devices
- **Animated Elements**: Smooth transitions, fades, and pulse effects
- **Real-time Statistics**: Score, lines, level, and high score display
- **Keyboard Controls Guide**: On-screen reference for all controls
- **Game State Feedback**: Clear visual indicators for playing, paused, and game over states

### Controls
- **←** Move piece left
- **→** Move piece right
- **↓** Move piece down (soft drop)
- **↑** Rotate piece clockwise
- **Enter** Start game / Pause / Resume / Restart

## 🚀 Getting Started

### Prerequisites
Test on **Google Chrome Canary v96.0.4648.2** or later

Enable WebGPU support:
1. Open `chrome://flags/`
2. Search for "Unsafe WebGPU"
3. Set to **Enabled**
4. Restart browser

### Running Locally

1. Clone the repository:
```bash
git clone https://github.com/Konstantin84UKR/Tetris_WebGPU.git
cd Tetris_WebGPU
```

2. Start a local server:
```bash
python -m http.server 8080
# or
npx serve
```

3. Open your browser to `http://localhost:8080`

## 🎨 Color Scheme

Each Tetris piece has its own distinctive color:
- **I-piece** (Cyan): The long straight piece
- **J-piece** (Blue): L-shaped, flipped
- **L-piece** (Orange): Classic L-shape
- **O-piece** (Yellow): The square
- **S-piece** (Green): S-shaped
- **T-piece** (Magenta): T-shaped
- **Z-piece** (Red): Z-shaped

## 🏗️ Technical Stack

- **WebGPU**: Modern graphics API for hardware-accelerated 3D rendering
- **Vanilla JavaScript**: ES6 modules, no framework dependencies
- **CSS3**: Modern layouts with Flexbox, gradients, and animations
- **gl-matrix**: Efficient matrix operations for 3D transformations

## 📊 Scoring System

- **Single line**: 10 points
- **Double lines**: 40 points (2² × 10)
- **Triple lines**: 90 points (3² × 10)
- **Tetris (4 lines)**: 160 points (4² × 10)

## 🔧 Code Structure

```
Tetris_WebGPU/
├── index.html          # Main HTML structure
├── index.js            # Application entry point
├── css/
│   └── style.css       # Enhanced styling
└── src/
    ├── game.js         # Game logic and state management
    ├── controller.js   # Input handling and game flow
    ├── viewWebGPU.js   # WebGPU rendering engine
    └── gl-matrix.js    # Matrix math library
```

## 🎯 Future Enhancements

- [ ] Sound effects and background music
- [ ] Touch controls for mobile devices
- [ ] Ghost piece (preview of where piece will land)
- [ ] Hold piece functionality
- [ ] Particle effects for line clears
- [ ] Leaderboard system
- [ ] Custom themes/skins

## 📝 Credits

- **Original Author**: Konstantin84UKR
- **Enhanced Edition**: Includes modern UI, improved code quality, and additional features
- **Inspired by**: Classic Tetris gameplay

## 📄 License

This project is open source and available for educational purposes.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the issues page.

---

**Made with ❤️ and WebGPU**
