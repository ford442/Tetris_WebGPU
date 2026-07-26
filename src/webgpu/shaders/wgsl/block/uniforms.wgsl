struct FragmentUniforms {
    lightPosition : vec4f,      // 0-15
    eyePosition   : vec4f,      // 16-31
    time          : f32,        // 32
    useGlitch     : f32,        // 36
    lockPercent   : f32,        // 40
    level         : f32,        // 44
    metallic      : f32,        // 48
    roughness     : f32,        // 52
    transmission  : f32,        // 56
    ior           : f32,        // 60
    subsurface    : f32,        // 64
    clearcoat     : f32,        // 68
    anisotropic   : f32,        // 72
    dispersion    : f32,        // 76
    materialType  : u32,        // 80 (0=classic,6=lava,7=hologram)
    particleIntensity : f32,    // 84
    enablePBR     : f32,        // 88
    textureMix    : f32,        // 92
    movementFlash : f32,        // 96
    lineClearFlash: f32,        // 100
    magnetWorldX  : f32,        // 104
    magnetWorldY  : f32,        // 108
    magnetStrength: f32,        // 112
    // KNOWN BUG: written every frame by viewMaterials.ts but never read in
    // fragmentMain.wgsl's main() — see the comment at that write site.
    particleMaterialType: u32,  // 116
    reserved2     : vec4f,      // 120-127
    padHeights    : vec4f,      // 128-143 (underwater flash timers at 128/132)
    columnHeights : array<f32, 10>, // 144
    bassLevel     : f32,        // 184
    midLevel      : f32,        // 188
    trebleLevel   : f32,        // 192
    padAudio      : f32,        // 196
    _structPad    : vec2f,      // 200 (WGSL pads struct to 224B minBindingSize)
};
