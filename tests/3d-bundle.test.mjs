import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('3D bundle file exists and has valid size', () => {
  const bundlePath = path.resolve('js/simulation-3d.bundle.js');
  assert.ok(fs.existsSync(bundlePath), 'js/simulation-3d.bundle.js must exist');
  const stat = fs.statSync(bundlePath);
  assert.ok(stat.size > 100_000, `Bundle size should be substantial (actual: ${stat.size} bytes)`);
});

test('3D bundle exports Simulation3DEngine', async () => {
  // Provide minimal mock environment for Three.js import in Node
  const originalWindow = global.window;
  const originalDocument = global.document;

  global.window = {
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  global.document = {
    createElement: () => ({ getContext: () => null }),
    createElementNS: () => ({ getContext: () => null }),
  };

  try {
    const bundle = await import('../js/simulation-3d.bundle.js');
    assert.ok(bundle.Simulation3DEngine, 'Simulation3DEngine should be exported');
    assert.equal(bundle.Simulation3DEngine.is3D, true, 'Simulation3DEngine.is3D should be static true');
  } finally {
    if (originalWindow !== undefined) global.window = originalWindow;
    else delete global.window;
    if (originalDocument !== undefined) global.document = originalDocument;
    else delete global.document;
  }
});

test('3D test environment HTML page exists and references loader', () => {
  const testHtmlPath = path.resolve('test-3d.html');
  assert.ok(fs.existsSync(testHtmlPath), 'test-3d.html must exist at root');
  const html = fs.readFileSync(testHtmlPath, 'utf8');
  assert.ok(html.includes('simulation-3d-loader.js'), 'test-3d.html should load simulation-3d-loader.js');
  assert.ok(html.includes('test-canvas-container'), 'test-3d.html should contain canvas container');
});

test('3D loader resolves bundle candidates correctly', () => {
  const loaderCode = fs.readFileSync('js/simulation-3d-loader.js', 'utf8');
  assert.ok(loaderCode.includes('resolveBundleUrls'), 'Loader should define resolveBundleUrls candidate resolver');
  assert.ok(!loaderCode.includes("import('./simulation-3d.bundle.js')"), 'Loader should not use hardcoded relative import');
});
