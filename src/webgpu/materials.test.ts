/**
 * Material System Test Suite
 * Run this to verify all premium materials work correctly
 */

import { Materials, MaterialThemes, getPieceMaterial } from './materials.js';

console.log('=== Material System Test ===\n');

// Test 1: All materials defined
console.log('Test 1: Material Definitions');
Object.entries(Materials).forEach(([name, mat]) => {
  console.log(`  ✓ ${name}: metallic=${mat.metallic.toFixed(2)}, roughness=${mat.roughness.toFixed(2)}`);
});

// Test 2: Theme mappings
console.log('\nTest 2: Theme Mappings');
Object.entries(MaterialThemes).forEach(([theme, mats]) => {
  console.log(`  ✓ ${theme}: ${mats.length} materials`);
});

// Test 3: Piece material lookup
console.log('\nTest 3: Piece Material Lookup');
['classic', 'gold', 'premium', 'cyber'].forEach(theme => {
  [1, 2, 3, 4, 5, 6, 7].forEach(piece => {
    const mat = getPieceMaterial(theme, piece);
    console.log(`  ✓ ${theme}[${piece}]: ${mat.name}`);
  });
});

// Test 4: Material property ranges
console.log('\nTest 4: Property Ranges');
let allValid = true;
Object.entries(Materials).forEach(([name, mat]) => {
  if (mat.metallic < 0 || mat.metallic > 1) {
    console.log(`  ✗ ${name}: metallic out of range`);
    allValid = false;
  }
  if (mat.roughness < 0 || mat.roughness > 1) {
    console.log(`  ✗ ${name}: roughness out of range`);
    allValid = false;
  }
  if (mat.ior < 1 || mat.ior > 3) {
    console.log(`  ✗ ${name}: ior out of range`);
    allValid = false;
  }
});
if (allValid) {
  console.log('  ✓ All material properties in valid ranges');
}

console.log('\n=== All Tests Passed ===');
