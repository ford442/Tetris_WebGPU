// Ambient declarations for the scripts/ tree (type-checked via tsconfig.node.json).

// Playwright is an on-demand tool (CI installs it ad hoc; it is not a devDependency).
declare module 'playwright' {
  export const chromium: any;
}

// Globals the app exposes for the diagnostic/screenshot scripts' page.evaluate() bodies.
interface Window {
  view?: any;
  game?: any;
}
interface Navigator {
  gpu?: any;
}
